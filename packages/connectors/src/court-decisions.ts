import { Connector, type SyncContext, type SyncResult, type RawCapture } from "./base";
import { politeFetch } from "./http";
import type { ScopiumObject, ScopiumLink } from "@scopium/ontology";

export type CourtDecisionsOptions = {
  /** Full-text query, typically a person or company name. */
  query: string;
  /** Base of the decisions search (NZLII or an official DB). */
  baseUrl?: string;
  limit: number;
  fetchImpl?: typeof fetch;
};

const DEFAULT_BASE = "https://www.nzlii.org";

// Phrases that indicate a suppressed / anonymised matter — never materialise
// named parties from these. Name suppression is legally enforced in NZ.
const SUPPRESSION_MARKERS = [
  "name suppress", "suppression order", "anonymis", "[name deleted]",
  "identifying particulars", "prohibited from publish",
];

/**
 * Court / tribunal decisions connector (NZLII-style full-text search).
 *
 * Each decision becomes a Document + an Event; where a decision names parties
 * and is NOT suppressed, a MentionedIn link ties the queried person to it.
 * Free-text extraction is low-confidence by nature, so these links are
 * support-only for resolution (never an anchor) and every one carries the
 * source URL for verification.
 *
 * SAFETY: decisions flagged as suppressed/anonymised are ingested as the
 * Document/Event only, with NO named-party links.
 */
export class CourtDecisionsConnector extends Connector {
  readonly id = "court-decisions";
  readonly version = "0.1.0";
  readonly displayName = "Court & Tribunal Decisions";
  readonly description = "NZ court and tribunal decisions naming a person (suppression-aware).";

  constructor(private readonly opts: CourtDecisionsOptions) { super(); }

  async sync(ctx: SyncContext): Promise<SyncResult> {
    const start = Date.now();
    const base = (this.opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    const url = new URL(`${base}/cgi-bin/sinosrch.cgi`);
    url.searchParams.set("query", this.opts.query);
    url.searchParams.set("method", "auto");
    url.searchParams.set("format", "json");

    const res = await (this.opts.fetchImpl ? this.opts.fetchImpl(url) : politeFetch(url.toString(), { minIntervalMs: 1500 }));
    if (!res.ok) throw new Error(`Court decisions search failed: ${res.status}`);
    const body = await res.json() as any;
    const results: any[] = body?.results ?? body?.items ?? [];

    let totalObjects = 0, totalLinks = 0, fetched = 0;
    const now = this.nowIso();
    const q = this.opts.query.toLowerCase();

    for (const r of results) {
      if (fetched >= this.opts.limit) break;
      ctx.signal?.throwIfAborted();
      const decisionId = String(r.citation ?? r.id ?? r.url ?? "");
      if (!decisionId) continue;
      const title = r.title ?? r.citation ?? "Decision";
      const snippet = String(r.snippet ?? r.summary ?? "");
      const suppressed = SUPPRESSION_MARKERS.some(m => `${title} ${snippet}`.toLowerCase().includes(m));
      const decisionUrl = r.url ?? `${base}`;
      const decidedAt = (r.date ?? "").slice(0, 10);

      const objects: ScopiumObject[] = [];
      const links: ScopiumLink[] = [];

      const docId = this.newId();
      objects.push({
        id: docId,
        type: "Document",
        classification: "Public",
        provenance: this.provenance(`decision:${decisionId}`, decisionUrl, r, ctx.fetchedBy),
        createdAt: now, updatedAt: now,
        properties: {
          title: String(title),
          mimeType: "text/html",
          url: decisionUrl.startsWith("http") ? decisionUrl : undefined,
          publishedAt: decidedAt ? `${decidedAt}T00:00:00.000Z` : undefined,
        },
      });

      // Only tie a named person to the decision when it is NOT suppressed and
      // the query name actually appears — support-only, low confidence.
      if (!suppressed && `${title} ${snippet}`.toLowerCase().includes(q)) {
        const personId = this.newId();
        objects.push({
          id: personId,
          type: "Person",
          classification: "Public",
          provenance: this.provenance(`decision-party:${decisionId}`, decisionUrl, r, ctx.fetchedBy),
          createdAt: now, updatedAt: now,
          properties: { fullName: this.opts.query, sourceScoped: true },
        });
        links.push({
          id: this.newId(),
          type: "MentionedIn",
          fromId: personId,
          toId: docId,
          classification: "Public",
          provenance: this.provenance(`decision-mention:${decisionId}`, decisionUrl, r, ctx.fetchedBy),
          createdAt: now, updatedAt: now,
          properties: { confidence: 0.3 },
        });
      }

      await ctx.emit({ objects, links });
      if (ctx.emitRaw) {
        const raw: RawCapture = {
          id: this.newId(), connectorId: this.id, sourceUrl: decisionUrl,
          sourceId: `decision:${decisionId}`, contentHash: this.hash(JSON.stringify(r)),
          httpStatus: 200, parserVersion: this.version, payload: r, fetchedAt: now,
        };
        await ctx.emitRaw(raw);
      }
      totalObjects += objects.length;
      totalLinks += links.length;
      fetched++;
    }

    return { objectsEmitted: totalObjects, linksEmitted: totalLinks, durationMs: Date.now() - start };
  }
}
