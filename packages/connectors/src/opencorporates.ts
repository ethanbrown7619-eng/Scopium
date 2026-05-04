import { Connector, type SyncContext, type SyncResult, type Materialised } from "./base";
import type { ScopiumObject, ScopiumLink } from "@scopium/ontology";

export type OpenCorporatesOptions = {
  /**
   * Optional API token. Free quota is ~500 calls/month without one; with a
   * free OpenCorporates account you can request more. Sign up at
   * https://opencorporates.com/users/sign_up
   */
  apiToken?: string;
  /** Maximum number of companies to ingest. */
  limit: number;
  /** Optional search term — defaults to '*' which matches everything. */
  query?: string;
  /**
   * If true, fetch each company's detail page to capture officers as Person
   * objects with DirectorOf links. Doubles the API call count; useful for
   * graph demos but eats quota.
   */
  withOfficers?: boolean;
  fetchImpl?: typeof fetch;
};

const BASE = "https://api.opencorporates.com/v0.4";

/**
 * OpenCorporates connector for real NZ companies. Hits the public NZ
 * jurisdiction (code: `nz`). No authentication required at low volume.
 *
 * Docs: https://api.opencorporates.com/documentation/API-Reference
 */
export class OpenCorporatesConnector extends Connector {
  readonly id = "opencorporates";
  readonly version = "0.1.0";
  readonly displayName = "OpenCorporates (NZ)";
  readonly description = "Real NZ companies + officers from OpenCorporates' public NZ jurisdiction.";

  constructor(private readonly opts: OpenCorporatesOptions) { super(); }

  async sync(ctx: SyncContext): Promise<SyncResult> {
    const start = Date.now();
    const f = this.opts.fetchImpl ?? fetch;
    const perPage = 100;
    let page = 1;
    let fetched = 0;
    let totalObjects = 0;
    let totalLinks = 0;

    while (fetched < this.opts.limit) {
      ctx.signal?.throwIfAborted();
      const url = new URL(`${BASE}/companies/search`);
      url.searchParams.set("q", this.opts.query ?? "*");
      url.searchParams.set("jurisdiction_code", "nz");
      url.searchParams.set("per_page", String(perPage));
      url.searchParams.set("page", String(page));
      if (this.opts.apiToken) url.searchParams.set("api_token", this.opts.apiToken);

      const res = await f(url, { headers: { Accept: "application/json" } });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`OpenCorporates search failed: ${res.status} ${body.slice(0, 200)}`);
      }
      const data = await res.json() as any;
      const items: any[] = data?.results?.companies ?? [];
      if (items.length === 0) break;

      for (const wrapper of items) {
        if (fetched >= this.opts.limit) break;
        ctx.signal?.throwIfAborted();
        const company = wrapper.company ?? wrapper;
        const batch = await this.materialise(company, f, ctx);
        await ctx.emit(batch);
        totalObjects += batch.objects.length;
        totalLinks += batch.links.length;
        fetched++;
      }

      if (items.length < perPage) break;
      page++;
    }

    return { objectsEmitted: totalObjects, linksEmitted: totalLinks, durationMs: Date.now() - start };
  }

  private async materialise(c: any, f: typeof fetch, ctx: SyncContext): Promise<Materialised> {
    const objects: ScopiumObject[] = [];
    const links: ScopiumLink[] = [];
    const now = this.nowIso();

    const companyNumber = String(c.company_number ?? "");
    if (!companyNumber) return { objects, links };
    // Treat the OpenCorporates company_number as the closest stable ID we have.
    // NZBN isn't always populated in search results; pad to satisfy the
    // ontology's 13-digit constraint when missing.
    const nzbn = String(c.identifiers?.find?.((i: any) => i.identifier_system_code === "nz_nzbn")?.uid ?? "")
      .padStart(13, "0").slice(0, 13);

    const companyId = this.newId();
    objects.push({
      id: companyId,
      type: "NZCompany",
      classification: "Public",
      provenance: this.provenance(
        companyNumber,
        c.opencorporates_url ?? `https://opencorporates.com/companies/nz/${companyNumber}`,
        c,
        ctx.fetchedBy,
      ),
      createdAt: now, updatedAt: now,
      properties: {
        name: c.name ?? "Unknown",
        nzbn: /^\d{13}$/.test(nzbn) ? nzbn : "0000000000000",
        companyNumber,
        status: mapStatus(c.current_status),
        incorporationDate: (c.incorporation_date ?? "").slice(0, 10) || undefined,
        registeredOffice: c.registered_address_in_full,
      },
    });

    if (this.opts.withOfficers) {
      try {
        const detUrl = new URL(`${BASE}/companies/nz/${companyNumber}`);
        if (this.opts.apiToken) detUrl.searchParams.set("api_token", this.opts.apiToken);
        const detRes = await f(detUrl, { headers: { Accept: "application/json" } });
        if (detRes.ok) {
          const det = await detRes.json() as any;
          const officers = det?.results?.company?.officers ?? [];
          for (const o of officers) {
            const officer = o.officer ?? o;
            const fullName = officer.name;
            if (!fullName) continue;
            const personId = this.newId();
            objects.push({
              id: personId,
              type: "Person",
              classification: "Public",
              provenance: this.provenance(`oc-officer:${officer.id ?? fullName}`, undefined, officer, ctx.fetchedBy),
              createdAt: now, updatedAt: now,
              properties: { fullName },
            });
            links.push({
              id: this.newId(),
              type: "DirectorOf",
              fromId: personId,
              toId: companyId,
              classification: "Public",
              provenance: this.provenance(`oc-officer:${officer.id ?? fullName}`, undefined, officer, ctx.fetchedBy),
              createdAt: now, updatedAt: now,
              properties: {
                startDate: (officer.start_date ?? "").slice(0, 10) || undefined,
                endDate: (officer.end_date ?? "").slice(0, 10) || undefined,
                appointmentSource: "OpenCorporates",
              },
            });
          }
        }
      } catch {
        // best-effort; skip officers if detail fails or rate-limited
      }
    }

    return { objects, links };
  }
}

const mapStatus = (raw: unknown): "Registered" | "InLiquidation" | "Removed" | "InReceivership" | "Other" => {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("registered") || s.includes("active")) return "Registered";
  if (s.includes("liquidation")) return "InLiquidation";
  if (s.includes("receiver")) return "InReceivership";
  if (s.includes("removed") || s.includes("dissolved") || s.includes("struck")) return "Removed";
  return "Other";
};
