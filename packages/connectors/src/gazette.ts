import { Connector, type Materialised, type SyncContext, type SyncResult, type RawCapture } from "./base";
import { politeFetch } from "./http";
import type { ScopiumObject, ScopiumLink } from "@scopium/ontology";

export type GazetteOptions = {
  /** Base of the NZ Gazette JSON/search API. */
  baseUrl?: string;
  /** Notice categories to pull, e.g. ["Bankruptcy", "Liquidation & Receivership"]. */
  categories?: string[];
  /** Free-text query (e.g. a person or company name) — optional. */
  query?: string;
  limit: number;
  fetchImpl?: typeof fetch;
};

const DEFAULT_BASE = "https://gazette.govt.nz";

/**
 * NZ Gazette connector.
 *
 * Statutory notices → Event objects: bankruptcies, liquidator/receiver
 * appointments, company removals, honours, appointments. When a notice names a
 * subject (individual or company), we materialise it and a PartyTo link so the
 * event attaches to the entity in the graph. Uses the public search feed; if a
 * formal API isn't available the same parser runs over captured HTML/JSON.
 */
export class GazetteConnector extends Connector {
  readonly id = "gazette";
  readonly version = "0.1.0";
  readonly displayName = "NZ Gazette";
  readonly description = "Statutory notices (insolvency, appointments, honours) as timeline Events.";

  constructor(private readonly opts: GazetteOptions) { super(); }

  async sync(ctx: SyncContext): Promise<SyncResult> {
    const start = Date.now();
    const base = (this.opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    let totalObjects = 0, totalLinks = 0, fetched = 0;

    const url = new URL(`${base}/notices/data.json`);
    if (this.opts.query) url.searchParams.set("q", this.opts.query);
    if (this.opts.categories?.length) url.searchParams.set("categories", this.opts.categories.join(","));
    url.searchParams.set("limit", String(this.opts.limit));

    const res = await (this.opts.fetchImpl ? this.opts.fetchImpl(url) : politeFetch(url.toString()));
    if (!res.ok) throw new Error(`Gazette fetch failed: ${res.status}`);
    const body = await res.json() as any;
    const notices: any[] = body?.notices ?? body?.items ?? body?.value ?? [];

    for (const notice of notices) {
      if (fetched >= this.opts.limit) break;
      ctx.signal?.throwIfAborted();
      const batch = this.materialise(notice, base, ctx);
      if (batch) {
        await ctx.emit(batch.materialised);
        if (ctx.emitRaw) await ctx.emitRaw(batch.raw);
        totalObjects += batch.materialised.objects.length;
        totalLinks += batch.materialised.links.length;
      }
      fetched++;
    }

    return { objectsEmitted: totalObjects, linksEmitted: totalLinks, durationMs: Date.now() - start };
  }

  private materialise(notice: any, base: string, ctx: SyncContext): { materialised: Materialised; raw: RawCapture } | null {
    const now = this.nowIso();
    const noticeId = String(notice.id ?? notice.reference ?? notice.gazetteNumber ?? "");
    if (!noticeId) return null;

    const publishedAt = (notice.publicationDate ?? notice.date ?? "").slice(0, 10);
    const title = notice.title ?? notice.category ?? "Gazette notice";
    const subject = notice.subjectName ?? notice.entityName ?? notice.personName;

    const objects: ScopiumObject[] = [];
    const links: ScopiumLink[] = [];

    const eventId = this.newId();
    objects.push({
      id: eventId,
      type: "Event",
      classification: "Public",
      provenance: this.provenance(`gazette:${noticeId}`, `${base}/notice/id/${noticeId}`, notice, ctx.fetchedBy),
      createdAt: now, updatedAt: now,
      properties: {
        title,
        occurredAt: publishedAt ? `${publishedAt}T00:00:00.000Z` : new Date().toISOString(),
        description: notice.category ?? notice.noticeType,
      },
    });

    if (subject) {
      const isCompany = /(ltd|limited|llp|ltc|incorporated|trust)\b/i.test(subject);
      const subjectId = this.newId();
      objects.push({
        id: subjectId,
        type: isCompany ? "NZCompany" : "Person",
        classification: "Public",
        provenance: this.provenance(`gazette-subject:${noticeId}`, undefined, notice, ctx.fetchedBy),
        createdAt: now, updatedAt: now,
        properties: isCompany
          ? { name: subject, nzbn: "0000000000000", companyNumber: noticeId, status: "Other" }
          : { fullName: subject, sourceScoped: true },
      } as ScopiumObject);
      links.push({
        id: this.newId(),
        type: "PartyTo",
        fromId: subjectId,
        toId: eventId,
        classification: "Public",
        provenance: this.provenance(`gazette-party:${noticeId}`, undefined, notice, ctx.fetchedBy),
        createdAt: now, updatedAt: now,
        properties: { role: "Counterparty" },
      });
    }

    const raw: RawCapture = {
      id: this.newId(),
      connectorId: this.id,
      sourceUrl: `${base}/notice/id/${noticeId}`,
      sourceId: `gazette:${noticeId}`,
      contentHash: this.hash(JSON.stringify(notice)),
      httpStatus: 200,
      parserVersion: this.version,
      payload: notice,
      fetchedAt: now,
    };

    return { materialised: { objects, links }, raw };
  }
}
