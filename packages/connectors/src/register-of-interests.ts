import { Connector, type SyncContext, type SyncResult, type RawCapture } from "./base";
import { politeFetch } from "./http";
import type { ScopiumObject, ScopiumLink } from "@scopium/ontology";

export type RegisterOfInterestsOptions = {
  /**
   * Feed of MP pecuniary-interest entries (extracted from the annual
   * Parliament publication). Each entry: mpName + declared interests
   * (directorships, shareholdings, property, trusts, gifts).
   */
  feedUrl?: string;
  query?: string;
  limit: number;
  fetchImpl?: typeof fetch;
};

/**
 * Register of Pecuniary Interests of MPs (Parliament).
 *
 * Materialises each MP as a Person and their declared interests: companies
 * (DirectorOf / ShareholderOf) and organisations. Low privacy sensitivity —
 * this is self-declared public accountability data for elected officials.
 */
export class RegisterOfInterestsConnector extends Connector {
  readonly id = "register-of-interests";
  readonly version = "0.1.0";
  readonly displayName = "MPs' Register of Pecuniary Interests";
  readonly description = "NZ MPs' declared directorships, shareholdings, property and trusts.";

  constructor(private readonly opts: RegisterOfInterestsOptions) { super(); }

  async sync(ctx: SyncContext): Promise<SyncResult> {
    const start = Date.now();
    if (!this.opts.feedUrl) {
      // No structured feed configured — this source needs a PDF-extraction
      // step (see SOURCES.md). Nothing to ingest without it.
      return { objectsEmitted: 0, linksEmitted: 0, durationMs: Date.now() - start };
    }
    const res = await (this.opts.fetchImpl ? this.opts.fetchImpl(this.opts.feedUrl) : politeFetch(this.opts.feedUrl));
    if (!res.ok) throw new Error(`Register of interests fetch failed: ${res.status}`);
    const body = await res.json() as any;
    const entries: any[] = Array.isArray(body) ? body : body?.members ?? body?.entries ?? [];

    let totalObjects = 0, totalLinks = 0, fetched = 0;
    const now = this.nowIso();
    const q = this.opts.query?.toLowerCase();

    for (const entry of entries) {
      if (fetched >= this.opts.limit) break;
      ctx.signal?.throwIfAborted();
      const mpName = entry.name ?? entry.mpName;
      if (!mpName) continue;
      if (q && !String(mpName).toLowerCase().includes(q)) continue;

      const objects: ScopiumObject[] = [];
      const links: ScopiumLink[] = [];
      const personId = this.newId();
      objects.push({
        id: personId, type: "Person", classification: "Public",
        provenance: this.provenance(`mp:${mpName}`, this.opts.feedUrl, entry, ctx.fetchedBy),
        createdAt: now, updatedAt: now,
        properties: { fullName: mpName, occupation: "Member of Parliament", sourceScoped: true },
      });

      for (const co of entry.companies ?? entry.directorships ?? []) {
        const name = typeof co === "string" ? co : co.name;
        if (!name) continue;
        const companyId = this.newId();
        objects.push({
          id: companyId, type: "NZCompany", classification: "Public",
          provenance: this.provenance(`mp-interest:${mpName}:${name}`, undefined, co, ctx.fetchedBy),
          createdAt: now, updatedAt: now,
          properties: { name, nzbn: "0000000000000", companyNumber: "", status: "Other" },
        });
        links.push({
          id: this.newId(),
          type: co.shareholding || co.type === "shareholding" ? "ShareholderOf" : "DirectorOf",
          fromId: personId, toId: companyId, classification: "Public",
          provenance: this.provenance(`mp-interest-link:${mpName}:${name}`, undefined, co, ctx.fetchedBy),
          createdAt: now, updatedAt: now,
          properties: co.shareholding || co.type === "shareholding"
            ? {}
            : { appointmentSource: "Register of Pecuniary Interests" },
        } as ScopiumLink);
      }

      await ctx.emit({ objects, links });
      if (ctx.emitRaw) {
        const raw: RawCapture = {
          id: this.newId(), connectorId: this.id, sourceUrl: this.opts.feedUrl,
          sourceId: `mp:${mpName}`, contentHash: this.hash(JSON.stringify(entry)),
          httpStatus: 200, parserVersion: this.version, payload: entry, fetchedAt: now,
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
