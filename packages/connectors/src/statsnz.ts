import { Connector, type SyncContext, type SyncResult, type Materialised } from "./base";
import type { ScopiumObject } from "@scopium/ontology";

export type StatsNzOptions = {
  baseUrl: string;
  apiKey?: string;
  /** OData resource path, e.g. "Population/PopulationByRegion". */
  resource: string;
  limit: number;
  fetchImpl?: typeof fetch;
};

/**
 * StatsNZ Open Data connector. Pulls population/business demography by
 * statistical area and materialises Location objects whose properties carry
 * the demographic measures.
 */
export class StatsNzConnector extends Connector {
  readonly id = "statsnz";
  readonly version = "0.1.0";
  readonly displayName = "StatsNZ Open Data";
  readonly description = "Population and business demography by NZ Statistical Area.";

  constructor(private readonly opts: StatsNzOptions) { super(); }

  async sync(ctx: SyncContext): Promise<SyncResult> {
    const start = Date.now();
    const f = this.opts.fetchImpl ?? fetch;
    const url = new URL(this.opts.resource, this.opts.baseUrl);
    url.searchParams.set("$top", String(this.opts.limit));
    url.searchParams.set("$format", "json");

    const res = await f(url, {
      headers: {
        Accept: "application/json",
        ...(this.opts.apiKey ? { "Ocp-Apim-Subscription-Key": this.opts.apiKey } : {}),
      },
    });
    if (!res.ok) throw new Error(`StatsNZ fetch failed: ${res.status}`);
    const body = await res.json() as { value?: any[] };
    const rows = body.value ?? [];

    const objects: ScopiumObject[] = [];
    const now = this.nowIso();
    for (const row of rows) {
      objects.push({
        id: this.newId(),
        type: "Location",
        classification: "Public",
        provenance: this.provenance(`${this.opts.resource}:${row.Geography ?? row.Area ?? ""}`, url.toString(), row, ctx.fetchedBy),
        createdAt: now, updatedAt: now,
        properties: {
          name: row.Geography ?? row.Area ?? "Unknown",
        },
      });
    }
    const batch: Materialised = { objects, links: [] };
    await ctx.emit(batch);
    return { objectsEmitted: objects.length, linksEmitted: 0, durationMs: Date.now() - start };
  }
}
