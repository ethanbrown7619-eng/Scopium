import { Connector, type Materialised, type SyncContext, type SyncResult, type RawCapture } from "./base";
import type { ScopiumObject, ScopiumLink } from "@scopium/ontology";

export type LinzTitlesOptions = {
  /** LINZ Data Service API key (free, instant self-service signup). */
  apiKey: string;
  /**
   * WFS layer id for "NZ Property Titles Including Owners". The owner layer
   * has a specific click-through licence — read it before production use.
   */
  layerId?: number;
  /** Optional CQL filter, e.g. owner name contains. */
  cqlFilter?: string;
  limit: number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

const DEFAULT_BASE = "https://data.linz.govt.nz/services";
const OWNERS_LAYER = 50804; // NZ Property Titles Including Owners (verify id).

/**
 * LINZ property-titles-including-owners connector.
 *
 * Materialises LINZParcel objects and their registered proprietors (Person or
 * Organisation) with ProprietorOf links — the property layer of a person
 * profile. Owner name + property is a strong identification vector, so this is
 * privacy-HIGH: gate display, and honour the LINZ owner-layer licence terms.
 */
export class LinzTitlesConnector extends Connector {
  readonly id = "linz-titles";
  readonly version = "0.1.0";
  readonly displayName = "LINZ Property Titles (incl. owners)";
  readonly description = "NZ property titles with registered proprietors (Toitū Te Whenua LINZ).";

  constructor(private readonly opts: LinzTitlesOptions) { super(); }

  async sync(ctx: SyncContext): Promise<SyncResult> {
    const start = Date.now();
    const f = this.opts.fetchImpl ?? fetch;
    const base = (this.opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    const layer = this.opts.layerId ?? OWNERS_LAYER;

    const url = new URL(`${base};key=${this.opts.apiKey}/wfs`);
    url.searchParams.set("service", "WFS");
    url.searchParams.set("version", "2.0.0");
    url.searchParams.set("request", "GetFeature");
    url.searchParams.set("typeNames", `layer-${layer}`);
    url.searchParams.set("count", String(this.opts.limit));
    url.searchParams.set("outputFormat", "json");
    url.searchParams.set("srsName", "EPSG:4326");
    if (this.opts.cqlFilter) url.searchParams.set("cql_filter", this.opts.cqlFilter);

    const res = await f(url);
    if (!res.ok) throw new Error(`LINZ titles fetch failed: ${res.status}`);
    const body = await res.json() as { features?: any[] };
    const features = body.features ?? [];

    let totalObjects = 0, totalLinks = 0;
    const now = this.nowIso();

    for (const feat of features) {
      ctx.signal?.throwIfAborted();
      const props = feat.properties ?? {};
      const titleNo = String(props.title_no ?? feat.id ?? "");
      if (!titleNo) continue;

      const objects: ScopiumObject[] = [];
      const links: ScopiumLink[] = [];

      const parcelId = this.newId();
      objects.push({
        id: parcelId,
        type: "LINZParcel",
        classification: "Public",
        provenance: this.provenance(`linz-title:${titleNo}`, url.toString(), feat, ctx.fetchedBy),
        createdAt: now, updatedAt: now,
        properties: {
          parcelId: titleNo,
          appellation: props.appellation ?? props.legal_description,
          titleReference: titleNo,
        },
      });

      // Owners may be delimited in a single field or an array depending on layer.
      const owners: string[] = Array.isArray(props.owners)
        ? props.owners
        : String(props.owners ?? props.proprietors ?? "").split(/[,;]| and /i).map((s: string) => s.trim()).filter(Boolean);

      for (const owner of owners) {
        const isOrg = /(ltd|limited|trust|trustee|council|incorporated|holdings)\b/i.test(owner);
        const ownerId = this.newId();
        objects.push({
          id: ownerId,
          type: isOrg ? "Organisation" : "Person",
          classification: "Public",
          provenance: this.provenance(`linz-owner:${titleNo}:${owner}`, undefined, { owner }, ctx.fetchedBy),
          createdAt: now, updatedAt: now,
          properties: isOrg ? { name: owner } : { fullName: owner, sourceScoped: true },
        } as ScopiumObject);
        links.push({
          id: this.newId(),
          type: "ProprietorOf",
          fromId: ownerId,
          toId: parcelId,
          classification: "Public",
          provenance: this.provenance(`linz-proprietor:${titleNo}:${owner}`, undefined, { owner }, ctx.fetchedBy),
          createdAt: now, updatedAt: now,
          properties: { tenure: props.estate_description },
        });
      }

      await ctx.emit({ objects, links });
      if (ctx.emitRaw) {
        const raw: RawCapture = {
          id: this.newId(), connectorId: this.id, sourceUrl: url.toString(),
          sourceId: `linz-title:${titleNo}`, contentHash: this.hash(JSON.stringify(feat)),
          httpStatus: 200, parserVersion: this.version, payload: feat, fetchedAt: now,
        };
        await ctx.emitRaw(raw);
      }
      totalObjects += objects.length;
      totalLinks += links.length;
    }

    return { objectsEmitted: totalObjects, linksEmitted: totalLinks, durationMs: Date.now() - start };
  }
}
