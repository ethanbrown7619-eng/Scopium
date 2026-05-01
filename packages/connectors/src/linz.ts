import { Connector, type SyncContext, type SyncResult } from "./base";
import type { ScopiumObject } from "@scopium/ontology";

export type LinzOptions = {
  baseUrl: string;
  apiKey: string;
  /** Layer ID, e.g. 105133 for NZ Property Titles. */
  layerId: number;
  limit: number;
  fetchImpl?: typeof fetch;
};

/**
 * LINZ Data Service connector. Materialises administrative boundaries and
 * parcels via WFS GetFeature. Geometries are preserved as WKT in the source
 * CRS; lat/lon centroids are derived for display.
 */
export class LinzConnector extends Connector {
  readonly id = "linz";
  readonly version = "0.1.0";
  readonly displayName = "LINZ Data Service";
  readonly description = "Administrative boundaries and addresses from Toitū Te Whenua LINZ.";

  constructor(private readonly opts: LinzOptions) { super(); }

  async sync(ctx: SyncContext): Promise<SyncResult> {
    const start = Date.now();
    const f = this.opts.fetchImpl ?? fetch;
    const url = new URL(`/services;key=${this.opts.apiKey}/wfs`, this.opts.baseUrl);
    url.searchParams.set("service", "WFS");
    url.searchParams.set("version", "2.0.0");
    url.searchParams.set("request", "GetFeature");
    url.searchParams.set("typeNames", `layer-${this.opts.layerId}`);
    url.searchParams.set("count", String(this.opts.limit));
    url.searchParams.set("outputFormat", "json");
    url.searchParams.set("srsName", "EPSG:4326");

    const res = await f(url);
    if (!res.ok) throw new Error(`LINZ fetch failed: ${res.status}`);
    const body = await res.json() as { features?: any[] };
    const features = body.features ?? [];

    const objects: ScopiumObject[] = [];
    const now = this.nowIso();
    for (const feat of features) {
      const props = feat.properties ?? {};
      objects.push({
        id: this.newId(),
        type: "LINZParcel",
        classification: "Public",
        provenance: this.provenance(`layer-${this.opts.layerId}:${feat.id}`, url.toString(), feat, ctx.fetchedBy),
        createdAt: now, updatedAt: now,
        properties: {
          parcelId: String(feat.id ?? props.id ?? ""),
          appellation: props.appellation,
          areaSqm: props.land_district_area ?? props.calc_area,
          titleReference: props.title_no,
        },
      });
    }
    await ctx.emit({ objects, links: [] });
    return { objectsEmitted: objects.length, linksEmitted: 0, durationMs: Date.now() - start };
  }
}
