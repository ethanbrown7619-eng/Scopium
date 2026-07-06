import { Connector, type Materialised, type SyncContext, type SyncResult, type RawCapture } from "./base";
import { politeFetch } from "./http";
import { sanitiseAddress } from "@scopium/ontology";
import type { ScopiumObject, ScopiumLink } from "@scopium/ontology";

export type CompaniesOfficePublicOptions = {
  /** Person name OR company name to search for. */
  query: string;
  /** "director" searches the directors index; "company" the company index. */
  mode?: "director" | "company";
  /** Base of the public XHR/JSON API behind app.companiesoffice.govt.nz. */
  baseUrl?: string;
  /** Max entities to materialise. */
  limit: number;
  /**
   * Injected fetch. In production this hits the public search; the shape is
   * defensive so it survives the undocumented endpoint changing. Provide a
   * mock in tests / provide the official API adapter later without touching
   * materialisation.
   */
  fetchImpl?: typeof fetch;
};

const DEFAULT_BASE = "https://app.companiesoffice.govt.nz/companies/app/api/companies";

/**
 * Companies Office on-demand connector (public register).
 *
 * Seed-driven: given a person's name, hits the public "search directors"
 * function, then pulls each matching company's detail to materialise the
 * NZCompany + directors/shareholders + DirectorOf/ShareholderOf links. This is
 * the person-search entry point into the corporate graph.
 *
 * The register is public by statute; we crawl only the subgraph an analyst
 * actually queries, politely (~1 req/sec, honest UA, cached upstream). We keep
 * only coarse localities for individuals, never residential street addresses.
 */
export class CompaniesOfficePublicConnector extends Connector {
  readonly id = "companies-office-public";
  readonly version = "0.1.0";
  readonly displayName = "Companies Register (public search)";
  readonly description = "NZ companies, directors and shareholders via the public Companies Register.";

  constructor(private readonly opts: CompaniesOfficePublicOptions) { super(); }

  async sync(ctx: SyncContext): Promise<SyncResult> {
    const start = Date.now();
    const base = (this.opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    const mode = this.opts.mode ?? "director";
    let totalObjects = 0, totalLinks = 0;

    const searchUrl = new URL(`${base}/search`);
    searchUrl.searchParams.set("q", this.opts.query);
    searchUrl.searchParams.set("entityTypes", mode === "director" ? "DIRECTOR" : "COMPANY");
    searchUrl.searchParams.set("pageSize", String(this.opts.limit));

    const searchRes = await this.get(searchUrl.toString());
    if (!searchRes.ok) throw new Error(`Companies search failed: ${searchRes.status}`);
    const searchBody = await searchRes.json() as any;
    const results: any[] = searchBody?.items ?? searchBody?.results ?? [];

    // Collect the set of company numbers to hydrate.
    const companyNumbers = new Set<string>();
    for (const r of results) {
      const cn = String(r.companyNumber ?? r.entityId ?? r.id ?? "");
      if (cn) companyNumbers.add(cn);
    }

    let count = 0;
    for (const cn of companyNumbers) {
      if (count >= this.opts.limit) break;
      ctx.signal?.throwIfAborted();
      const detailUrl = `${base}/${encodeURIComponent(cn)}`;
      const res = await this.get(detailUrl);
      if (!res.ok) continue;
      const detail = await res.json() as any;
      const batch = this.materialise(cn, detail, detailUrl, ctx);
      await ctx.emit(batch.materialised);
      if (ctx.emitRaw) await ctx.emitRaw(batch.raw);
      totalObjects += batch.materialised.objects.length;
      totalLinks += batch.materialised.links.length;
      count++;
    }

    return { objectsEmitted: totalObjects, linksEmitted: totalLinks, durationMs: Date.now() - start };
  }

  private get(url: string): Promise<Response> {
    return this.opts.fetchImpl
      ? this.opts.fetchImpl(url)
      : politeFetch(url, { minIntervalMs: 1000 });
  }

  private materialise(cn: string, detail: any, sourceUrl: string, ctx: SyncContext): { materialised: Materialised; raw: RawCapture } {
    const now = this.nowIso();
    const objects: ScopiumObject[] = [];
    const links: ScopiumLink[] = [];
    const nzbn = String(detail.nzbn ?? "").padStart(13, "0").slice(0, 13);

    const companyId = this.newId();
    objects.push({
      id: companyId,
      type: "NZCompany",
      classification: "Public",
      provenance: this.provenance(`company:${cn}`, `https://app.companiesoffice.govt.nz/companies/app/ui/pages/companies/${cn}`, detail, ctx.fetchedBy),
      createdAt: now, updatedAt: now,
      properties: {
        name: detail.entityName ?? detail.name ?? "Unknown",
        nzbn: /^\d{13}$/.test(nzbn) ? nzbn : "0000000000000",
        companyNumber: cn,
        status: mapStatus(detail.companyStatus ?? detail.status),
        incorporationDate: (detail.incorporationDate ?? "").slice(0, 10) || undefined,
        registeredOffice: detail.registeredOfficeAddress ?? detail.addressForService,
      },
    });

    for (const d of detail.directors ?? []) {
      const fullName = nameOf(d);
      if (!fullName) continue;
      const personId = this.newId();
      objects.push({
        id: personId,
        type: "Person",
        classification: "Public",
        provenance: this.provenance(`company-director:${cn}:${fullName}`, undefined, d, ctx.fetchedBy),
        createdAt: now, updatedAt: now,
        properties: {
          fullName,
          givenNames: d.firstName,
          familyName: d.lastName,
          // Companies Office exposes residential addresses — sanitise to locality.
          residentialLocality: sanitiseAddress(d.residentialAddress ?? d.address),
          sourceScoped: true,
        },
      });
      links.push({
        id: this.newId(),
        type: "DirectorOf",
        fromId: personId,
        toId: companyId,
        classification: "Public",
        provenance: this.provenance(`company-director:${cn}:${fullName}`, undefined, d, ctx.fetchedBy),
        createdAt: now, updatedAt: now,
        properties: {
          startDate: (d.appointmentDate ?? "").slice(0, 10) || undefined,
          endDate: (d.ceasedDate ?? "").slice(0, 10) || undefined,
          appointmentSource: "Companies Register",
        },
      });
    }

    for (const s of detail.shareholders ?? []) {
      const fullName = nameOf(s);
      if (!fullName) continue;
      const personId = this.newId();
      objects.push({
        id: personId,
        type: "Person",
        classification: "Public",
        provenance: this.provenance(`company-shareholder:${cn}:${fullName}`, undefined, s, ctx.fetchedBy),
        createdAt: now, updatedAt: now,
        properties: { fullName, sourceScoped: true },
      });
      links.push({
        id: this.newId(),
        type: "ShareholderOf",
        fromId: personId,
        toId: companyId,
        classification: "Public",
        provenance: this.provenance(`company-shareholder:${cn}:${fullName}`, undefined, s, ctx.fetchedBy),
        createdAt: now, updatedAt: now,
        properties: {
          shares: typeof s.shares === "number" ? s.shares : undefined,
          percentage: typeof s.percentage === "number" ? s.percentage : undefined,
        },
      });
    }

    const raw: RawCapture = {
      id: this.newId(),
      connectorId: this.id,
      sourceUrl,
      sourceId: `company:${cn}`,
      contentHash: this.hash(JSON.stringify(detail)),
      httpStatus: 200,
      parserVersion: this.version,
      payload: detail,
      fetchedAt: now,
    };
    return { materialised: { objects, links }, raw };
  }
}

const nameOf = (o: any): string =>
  (o?.fullName
    ?? [o?.firstName, o?.middleNames, o?.lastName].filter(Boolean).join(" ")
    ?? o?.name
    ?? "").trim();

const mapStatus = (raw: unknown): "Registered" | "InLiquidation" | "Removed" | "InReceivership" | "Other" => {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("registered") || s.includes("active")) return "Registered";
  if (s.includes("liquidation")) return "InLiquidation";
  if (s.includes("receiver")) return "InReceivership";
  if (s.includes("removed") || s.includes("dissolved") || s.includes("struck")) return "Removed";
  return "Other";
};
