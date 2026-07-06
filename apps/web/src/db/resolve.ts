/**
 * Entity-resolution driver. Loads source-scoped Person records, blocks them by
 * surname+initial, scores every candidate pair with the pure resolver, and
 * writes SameAs links: auto-merges as "confirmed", weaker matches as
 * "candidate" for analyst review. Reversible and provenance-stamped.
 */
import { ulid } from "ulid";
import {
  blockingKey, scorePersonMatch, RESOLVER_VERSION,
  type PersonAttributes,
} from "@scopium/ontology";
import { db } from "./client";
import { links } from "./schema";
import { allPersonRows, personLinkedEntities, type ObjectRow } from "./repository";

export type ResolveResult = {
  personsConsidered: number;
  pairsScored: number;
  autoMerged: number;
  candidates: number;
};

const CANDIDATE_THRESHOLD = 0.55;

const toAttrs = (row: ObjectRow, linked: Map<string, string[]>): PersonAttributes => ({
  fullName: String(row.properties.fullName ?? ""),
  dateOfBirth: row.properties.dateOfBirth ? String(row.properties.dateOfBirth) : undefined,
  residentialLocality: row.properties.residentialLocality ? String(row.properties.residentialLocality) : undefined,
  linkedEntityIds: linked.get(row.id) ?? [],
});

export const resolvePeople = async (): Promise<ResolveResult> => {
  const people = await allPersonRows();
  const linked = await personLinkedEntities();

  // Block by surname+initial to keep comparisons O(n) per block, not O(n²) global.
  const blocks = new Map<string, ObjectRow[]>();
  for (const p of people) {
    const key = blockingKey(String(p.properties.fullName ?? ""));
    if (!key) continue;
    let arr = blocks.get(key);
    if (!arr) { arr = []; blocks.set(key, arr); }
    arr.push(p);
  }

  const now = new Date();
  const sameAsRows: (typeof links.$inferInsert)[] = [];
  let pairsScored = 0, autoMerged = 0, candidates = 0;

  for (const group of blocks.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!, b = group[j]!;
        pairsScored++;
        const match = scorePersonMatch(toAttrs(a, linked), toAttrs(b, linked));
        if (match.score < CANDIDATE_THRESHOLD && !match.autoMerge) continue;

        const status = match.autoMerge ? "confirmed" : "candidate";
        if (match.autoMerge) autoMerged++; else candidates++;

        sameAsRows.push({
          id: ulid(),
          type: "SameAs",
          fromId: a.id,
          toId: b.id,
          classification: "Public",
          properties: {
            confidence: match.score,
            method: match.method,
            signals: match.signals,
            resolverVersion: RESOLVER_VERSION,
            status,
          },
          provenance: {
            connectorId: "person-resolver",
            connectorVersion: RESOLVER_VERSION,
            sourceId: `${a.id}~${b.id}`,
            syncedAt: now.toISOString(),
          },
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  // Batch insert (chunked to keep statements reasonable).
  for (let k = 0; k < sameAsRows.length; k += 500) {
    await db.insert(links).values(sameAsRows.slice(k, k + 500)).onConflictDoNothing();
  }

  return { personsConsidered: people.length, pairsScored, autoMerged, candidates };
};
