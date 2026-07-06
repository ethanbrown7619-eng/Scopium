import { Connector, type Materialised, type SyncContext, type SyncResult, type RawCapture } from "./base";
import { politeFetch } from "./http";
import { sanitiseAddress } from "@scopium/ontology";
import type { ScopiumObject, ScopiumLink } from "@scopium/ontology";

export type CharitiesOptions = {
  /** OData base. Defaults to the public Charities Services feed. */
  baseUrl?: string;
  /** Max charities to ingest. */
  limit: number;
  /** Optional name filter — when set, only charities whose officer names match. */
  officerName?: string;
  fetchImpl?: typeof fetch;
};

const DEFAULT_BASE = "https://www.odata.charities.govt.nz/";

/**
 * Charities Register connector (Charities Services / DIA).
 *
 * The single best zero-friction real NZ people source: a genuinely open OData
 * API, no key, no approval. Materialises each charity as an Organisation and
 * each officer as a source-scoped Person with an OfficerOf link, running every
 * record through the two-phase landing zone with full provenance.
 *
 * OData docs: https://www.odata.charities.govt.nz/
 */
export class CharitiesConnector extends Connector {
  readonly id = "charities";
  readonly version = "0.1.0";
  readonly displayName = "Charities Register";
  readonly description = "NZ registered charities and their officers (Charities Services / DIA open OData).";

  constructor(private readonly opts: CharitiesOptions) { super(); }

  async sync(ctx: SyncContext): Promise<SyncResult> {
    const start = Date.now();
    const base = (this.opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    let fetched = 0, totalObjects = 0, totalLinks = 0;
    let skip = 0;
    const pageSize = Math.min(100, this.opts.limit);

    while (fetched < this.opts.limit) {
      ctx.signal?.throwIfAborted();
      const url = new URL(`${base}/Organisations`);
      url.searchParams.set("$top", String(Math.min(pageSize, this.opts.limit - fetched)));
      url.searchParams.set("$skip", String(skip));
      url.searchParams.set("$format", "json");
      // Expand officers if the feed supports it; harmless if ignored.
      url.searchParams.set("$expand", "Officers");

      const res = await (this.opts.fetchImpl
        ? this.opts.fetchImpl(url)
        : politeFetch(url.toString(), { minIntervalMs: 500 }));
      if (!res.ok) throw new Error(`Charities OData failed: ${res.status}`);
      const body = await res.json() as { value?: any[] };
      const items = body.value ?? [];
      if (items.length === 0) break;

      for (const org of items) {
        if (fetched >= this.opts.limit) break;
        ctx.signal?.throwIfAborted();
        const batch = this.materialise(org, url.toString(), ctx);
        if (batch) {
          await ctx.emit(batch.materialised);
          if (ctx.emitRaw) await ctx.emitRaw(batch.raw);
          totalObjects += batch.materialised.objects.length;
          totalLinks += batch.materialised.links.length;
        }
        fetched++;
      }

      if (items.length < pageSize) break;
      skip += pageSize;
    }

    return { objectsEmitted: totalObjects, linksEmitted: totalLinks, durationMs: Date.now() - start };
  }

  private materialise(org: any, sourceUrl: string, ctx: SyncContext): { materialised: Materialised; raw: RawCapture } | null {
    const now = this.nowIso();
    const ccNumber = String(org.CharityRegistrationNumber ?? org.OrganisationId ?? "");
    if (!ccNumber) return null;

    const officerFilter = this.opts.officerName?.toLowerCase();
    const officers: any[] = org.Officers ?? org.officers ?? [];
    if (officerFilter && !officers.some(o => nameOf(o).toLowerCase().includes(officerFilter))) {
      return null;
    }

    const objects: ScopiumObject[] = [];
    const links: ScopiumLink[] = [];

    const orgId = this.newId();
    const orgProvenance = this.provenance(
      `charity:${ccNumber}`,
      `https://register.charities.govt.nz/CharitiesRegister/ViewCharity?accountId=${ccNumber}`,
      undefined,
      ctx.fetchedBy,
    );
    objects.push({
      id: orgId,
      type: "Organisation",
      classification: "Public",
      provenance: orgProvenance,
      createdAt: now, updatedAt: now,
      properties: {
        name: org.Name ?? org.CharityName ?? "Unknown charity",
        sector: "Charity",
        website: typeof org.Website === "string" && org.Website.startsWith("http") ? org.Website : undefined,
      },
    });

    for (const o of officers) {
      const fullName = nameOf(o);
      if (!fullName) continue;
      const personId = this.newId();
      objects.push({
        id: personId,
        type: "Person",
        classification: "Public",
        provenance: this.provenance(`charity-officer:${ccNumber}:${fullName}`, undefined, undefined, ctx.fetchedBy),
        createdAt: now, updatedAt: now,
        properties: {
          fullName,
          residentialLocality: sanitiseAddress(o.Address ?? o.FullAddress),
          sourceScoped: true,
        },
      });
      links.push({
        id: this.newId(),
        type: "OfficerOf",
        fromId: personId,
        toId: orgId,
        classification: "Public",
        provenance: this.provenance(`charity-officer:${ccNumber}:${fullName}`, undefined, undefined, ctx.fetchedBy),
        createdAt: now, updatedAt: now,
        properties: {
          role: o.Position ?? o.Title ?? "Officer",
          startDate: (o.AppointmentDate ?? "").slice(0, 10) || undefined,
          appointmentSource: "Charities Register",
        },
      });
    }

    const raw: RawCapture = {
      id: this.newId(),
      connectorId: this.id,
      sourceUrl,
      sourceId: `charity:${ccNumber}`,
      contentHash: this.hash(JSON.stringify(org)),
      httpStatus: 200,
      parserVersion: this.version,
      payload: org,
      fetchedAt: now,
    };

    return { materialised: { objects, links }, raw };
  }
}

const nameOf = (o: any): string =>
  (o?.FullName
    ?? [o?.FirstName, o?.MiddleName, o?.LastName].filter(Boolean).join(" ")
    ?? o?.Name
    ?? "").trim();
