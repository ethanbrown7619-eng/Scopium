/**
 * Watchlist + monitoring. Add a person once; a scheduled monitor re-sweeps
 * them, diffs the assembled profile against the last fingerprint, and records
 * a finding for anything genuinely new — so the user is told when fresh
 * information surfaces instead of having to look.
 */
import { ulid } from "ulid";
import { sql } from "drizzle-orm";
import { db } from "./client";
import { watchlist, watchFindings } from "./schema";
import { sweepPerson, type KnownFacts } from "./sweep";
import { buildPersonProfile, profileFingerprint, profileSourceKeys } from "./person-profile";

export type WatchEntry = {
  id: string;
  name: string;
  knownFacts: Record<string, unknown>;
  anchorId: string | null;
  fingerprint: string | null;
  notifyEmail: string | null;
  createdAt: string;
  lastSweptAt: string | null;
};

export const addWatch = async (name: string, facts: KnownFacts, notifyEmail?: string): Promise<string> => {
  const id = ulid();
  await db.insert(watchlist).values({
    id, name, knownFacts: facts as Record<string, unknown>, notifyEmail: notifyEmail ?? null,
  });
  // Baseline immediately: sweep once, record current keys as "known" so the
  // first monitor run only reports genuinely new information, not everything.
  try {
    const outcome = await sweepPerson(name, { facts, actor: "watch-baseline" });
    const best = outcome.people[0];
    if (best) {
      const profile = await buildPersonProfile(best.id);
      if (profile) {
        const keys = profileSourceKeys(profile).map(k => k.key);
        await db.execute(sql.raw(
          `UPDATE watchlist SET anchor_id = '${best.id.replace(/'/g, "''")}',
           fingerprint = '${profileFingerprint(profile)}',
           known_keys = '${JSON.stringify(keys).replace(/'/g, "''")}'::jsonb,
           last_swept_at = now() WHERE id = '${id}'`,
        ));
      }
    }
  } catch { /* baseline is best-effort; monitor will retry */ }
  return id;
};

export const listWatches = async (): Promise<(WatchEntry & { knownKeys: string[] })[]> => {
  const res = await db.execute(sql.raw(
    `SELECT id, name, known_facts AS "knownFacts", anchor_id AS "anchorId", fingerprint,
            known_keys AS "knownKeys", notify_email AS "notifyEmail",
            created_at AS "createdAt", last_swept_at AS "lastSweptAt"
     FROM watchlist ORDER BY created_at DESC`,
  ));
  return (res as unknown as (WatchEntry & { knownKeys: string[] })[]) ?? [];
};

export const removeWatch = async (id: string): Promise<void> => {
  await db.execute(sql.raw(`DELETE FROM watchlist WHERE id = '${id.replace(/'/g, "''")}'`));
};

export const listFindings = async (watchId?: string, onlyUnseen = false): Promise<any[]> => {
  const where = [
    watchId ? `watch_id = '${watchId.replace(/'/g, "''")}'` : null,
    onlyUnseen ? `seen = 'false'` : null,
  ].filter(Boolean).join(" AND ");
  const res = await db.execute(sql.raw(
    `SELECT id, watch_id AS "watchId", summary, object_ids AS "objectIds", source, seen, created_at AS "createdAt"
     FROM watch_findings ${where ? `WHERE ${where}` : ""} ORDER BY created_at DESC LIMIT 200`,
  ));
  return (res as unknown as any[]) ?? [];
};

export const markFindingSeen = async (id: string): Promise<void> => {
  await db.execute(sql.raw(`UPDATE watch_findings SET seen = 'true' WHERE id = '${id.replace(/'/g, "''")}'`));
};

export type MonitorReport = {
  watched: number;
  swept: number;
  newFindings: number;
  perWatch: { name: string; newFindings: number }[];
};

/**
 * Re-sweep every watched person, diff against last fingerprint, record
 * findings for new source records. Idempotent: unchanged profiles produce
 * nothing. Run on a schedule (see .github/workflows/watch-monitor.yml).
 */
export const runMonitor = async (): Promise<MonitorReport> => {
  const watches = await listWatches();
  const perWatch: MonitorReport["perWatch"] = [];
  let swept = 0, newFindings = 0;

  for (const w of watches) {
    const facts = w.knownFacts as KnownFacts;
    const outcome = await sweepPerson(w.name, { facts, actor: "monitor" });
    swept++;
    const best = outcome.people[0];
    if (!best) { perWatch.push({ name: w.name, newFindings: 0 }); continue; }

    const anchorId = w.anchorId ?? best.id;
    const profile = await buildPersonProfile(anchorId);
    if (!profile) { perWatch.push({ name: w.name, newFindings: 0 }); continue; }

    const keys = profileSourceKeys(profile);
    const known = new Set(w.knownKeys ?? []);
    const fresh = keys.filter(k => !known.has(k.key));

    let added = 0;
    if (fresh.length > 0) {
      const rows = fresh.slice(0, 50).map(k => ({
        id: ulid(), watchId: w.id,
        summary: `New ${k.type}: ${k.label}`,
        objectIds: [k.id] as string[], source: k.type, seen: "false",
      }));
      await db.insert(watchFindings).values(rows);
      added = rows.length;
    }

    const allKeys = Array.from(new Set([...(w.knownKeys ?? []), ...keys.map(k => k.key)]));
    await db.execute(sql.raw(
      `UPDATE watchlist SET fingerprint = '${profileFingerprint(profile)}',
       anchor_id = '${anchorId.replace(/'/g, "''")}',
       known_keys = '${JSON.stringify(allKeys).replace(/'/g, "''")}'::jsonb,
       last_swept_at = now() WHERE id = '${w.id}'`,
    ));
    newFindings += added;
    perWatch.push({ name: w.name, newFindings: added });
  }

  return { watched: watches.length, swept, newFindings, perWatch };
};
