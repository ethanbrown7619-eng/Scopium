import { Connector, type SyncContext, type SyncResult, type RawCapture } from "./base";
import { politeFetch } from "./http";
import type { ScopiumObject, ScopiumLink } from "@scopium/ontology";

export type SanctionsOptions = {
  /**
   * One or more sanctions-list feed URLs returning JSON arrays of entries.
   * Defaults to the NZ Russia Sanctions Register (MFAT). Add UN/OFAC/UK/EU
   * feeds for a fuller PEP/sanctions screen.
   */
  feeds?: { name: string; url: string }[];
  /** Optional name filter. */
  query?: string;
  limit: number;
  fetchImpl?: typeof fetch;
};

const DEFAULT_FEEDS = [
  { name: "NZ Russia Sanctions Register", url: "https://www.mfat.govt.nz/assets/sanctions/russia-sanctions-register.json" },
];

/**
 * Sanctions / designated-persons screen. Materialises each designated
 * individual as a Person and each entity as an Organisation, flagged
 * Restricted, with a "Designated" Event. For due-diligence credibility a real
 * deployment should add UN, OFAC, UK HMT, and EU consolidated lists as feeds.
 */
export class SanctionsConnector extends Connector {
  readonly id = "sanctions";
  readonly version = "0.1.0";
  readonly displayName = "Sanctions & Designated Persons";
  readonly description = "Designated persons/entities from NZ and international sanctions lists.";

  constructor(private readonly opts: SanctionsOptions) { super(); }

  async sync(ctx: SyncContext): Promise<SyncResult> {
    const start = Date.now();
    const feeds = this.opts.feeds ?? DEFAULT_FEEDS;
    let totalObjects = 0, totalLinks = 0, fetched = 0;
    const now = this.nowIso();
    const q = this.opts.query?.toLowerCase();

    for (const feed of feeds) {
      if (fetched >= this.opts.limit) break;
      ctx.signal?.throwIfAborted();
      const res = await (this.opts.fetchImpl ? this.opts.fetchImpl(feed.url) : politeFetch(feed.url));
      if (!res.ok) continue;
      const body = await res.json() as any;
      const entries: any[] = Array.isArray(body) ? body : body?.entries ?? body?.value ?? [];

      for (const e of entries) {
        if (fetched >= this.opts.limit) break;
        const name = e.name ?? e.fullName ?? e.entityName;
        if (!name) continue;
        if (q && !String(name).toLowerCase().includes(q)) continue;
        const isPerson = (e.type ?? "").toLowerCase().includes("individual") || e.dateOfBirth || e.firstName;

        const objects: ScopiumObject[] = [];
        const links: ScopiumLink[] = [];
        const subjectId = this.newId();
        objects.push({
          id: subjectId,
          type: isPerson ? "Person" : "Organisation",
          classification: "Restricted",
          provenance: this.provenance(`sanction:${feed.name}:${name}`, e.sourceUrl ?? feed.url, e, ctx.fetchedBy),
          createdAt: now, updatedAt: now,
          properties: isPerson
            ? { fullName: name, dateOfBirth: e.dateOfBirth, aliases: e.aliases, sourceScoped: true }
            : { name },
        } as ScopiumObject);

        const eventId = this.newId();
        objects.push({
          id: eventId,
          type: "Event",
          classification: "Restricted",
          provenance: this.provenance(`sanction-designation:${feed.name}:${name}`, feed.url, e, ctx.fetchedBy),
          createdAt: now, updatedAt: now,
          properties: {
            title: `Sanctions designation: ${feed.name}`,
            occurredAt: (e.designationDate ?? "").slice(0, 10) ? `${e.designationDate.slice(0, 10)}T00:00:00.000Z` : now,
            description: e.reason ?? e.programme ?? feed.name,
          },
        });
        links.push({
          id: this.newId(), type: "PartyTo", fromId: subjectId, toId: eventId,
          classification: "Restricted",
          provenance: this.provenance(`sanction-party:${feed.name}:${name}`, feed.url, e, ctx.fetchedBy),
          createdAt: now, updatedAt: now, properties: { role: "Counterparty" },
        });

        await ctx.emit({ objects, links });
        if (ctx.emitRaw) {
          const raw: RawCapture = {
            id: this.newId(), connectorId: this.id, sourceUrl: feed.url,
            sourceId: `sanction:${feed.name}:${name}`, contentHash: this.hash(JSON.stringify(e)),
            httpStatus: 200, parserVersion: this.version, payload: e, fetchedAt: now,
          };
          await ctx.emitRaw(raw);
        }
        totalObjects += objects.length;
        totalLinks += links.length;
        fetched++;
      }
    }

    return { objectsEmitted: totalObjects, linksEmitted: totalLinks, durationMs: Date.now() - start };
  }
}
