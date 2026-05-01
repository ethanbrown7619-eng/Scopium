import { Connector, type Materialised, type SyncContext, type SyncResult } from "./base";
import type { ScopiumObject, ScopiumLink } from "@scopium/ontology";

export type CompaniesRegisterOptions = {
  /** API base, defaults to env. */
  baseUrl: string;
  /** Optional bearer token. */
  token?: string;
  /** Search expression — defaults to all 'Registered' companies. */
  search?: string;
  /** Maximum companies to ingest in this sync. */
  limit: number;
  /** Page size for list endpoint. */
  pageSize?: number;
  /** Override fetch — used by tests. */
  fetchImpl?: typeof fetch;
};

/**
 * NZ Companies Register connector. Pulls companies, then for each company
 * fetches directors and shareholders, materialising NZCompany + Person + the
 * DirectorOf / ShareholderOf links between them.
 *
 * The Companies Office API is documented at
 * https://api.companiesoffice.govt.nz/companies/v1/. Endpoints used:
 *   GET /companies?search=...&pageSize=&page=
 *   GET /companies/{nzbn}/directors
 *   GET /companies/{nzbn}/shareholdings
 */
export class NZCompaniesRegisterConnector extends Connector {
  readonly id = "nz-companies-register";
  readonly version = "0.1.0";
  readonly displayName = "NZ Companies Register";
  readonly description = "Companies, directors, and shareholders from the New Zealand Companies Office.";

  constructor(private readonly opts: CompaniesRegisterOptions) { super(); }

  async sync(ctx: SyncContext): Promise<SyncResult> {
    const start = Date.now();
    const f = this.opts.fetchImpl ?? fetch;
    const pageSize = this.opts.pageSize ?? 50;
    let fetched = 0;
    let page = 1;
    let objects = 0;
    let links = 0;

    while (fetched < this.opts.limit) {
      ctx.signal?.throwIfAborted();
      const url = new URL("/companies", this.opts.baseUrl);
      if (this.opts.search) url.searchParams.set("search", this.opts.search);
      url.searchParams.set("pageSize", String(Math.min(pageSize, this.opts.limit - fetched)));
      url.searchParams.set("page", String(page));

      const res = await f(url, this.headers());
      if (!res.ok) throw new Error(`Companies Register list failed: ${res.status} ${res.statusText}`);
      const body = await res.json() as { items?: any[]; totalItems?: number };
      const items = body.items ?? [];
      if (items.length === 0) break;

      for (const item of items) {
        ctx.signal?.throwIfAborted();
        const batch = await this.materialiseCompany(item, f, ctx);
        objects += batch.objects.length;
        links += batch.links.length;
        await ctx.emit(batch);
        fetched += 1;
        if (fetched >= this.opts.limit) break;
      }

      page += 1;
      if (items.length < pageSize) break;
    }

    return { objectsEmitted: objects, linksEmitted: links, durationMs: Date.now() - start };
  }

  private headers(): RequestInit {
    return {
      headers: {
        Accept: "application/json",
        ...(this.opts.token ? { Authorization: `Bearer ${this.opts.token}` } : {}),
      },
    };
  }

  private async materialiseCompany(item: any, f: typeof fetch, ctx: SyncContext): Promise<Materialised> {
    const objects: ScopiumObject[] = [];
    const links: ScopiumLink[] = [];
    const now = this.nowIso();
    const nzbn: string = item.nzbn ?? item.nzbnNumber ?? "";
    const companyId = this.newId();

    const company: ScopiumObject = {
      id: companyId,
      type: "NZCompany",
      classification: "Public",
      provenance: this.provenance(nzbn, `${this.opts.baseUrl}/companies/${nzbn}`, item, ctx.fetchedBy),
      createdAt: now,
      updatedAt: now,
      properties: {
        name: item.entityName ?? item.companyName ?? "Unknown",
        nzbn,
        companyNumber: String(item.companyNumber ?? item.id ?? ""),
        status: mapStatus(item.entityStatusCode ?? item.companyStatus),
        incorporationDate: item.incorporationDate?.slice(0, 10),
        anzsic: item.australianAndNewZealandStandardIndustrialClassificationCode ?? item.anzsic,
        registeredOffice: item.registeredOffice?.address ?? item.addressForServiceEffectiveFrom,
      },
    };
    objects.push(company);

    // Directors — best-effort; the public endpoint format may vary.
    const directors = await this.safeFetchArray(f, `${this.opts.baseUrl}/companies/${nzbn}/directors`);
    for (const d of directors) {
      const personId = this.newId();
      const fullName = [d.firstName, d.middleNames, d.lastName].filter(Boolean).join(" ").trim() || d.name || "Unknown";
      objects.push({
        id: personId,
        type: "Person",
        classification: "Public",
        provenance: this.provenance(`director:${nzbn}:${fullName}`, undefined, d, ctx.fetchedBy),
        createdAt: now, updatedAt: now,
        properties: {
          fullName,
          givenNames: d.firstName,
          familyName: d.lastName,
          residentialLocality: d.residentialAddress?.city ?? d.address?.city,
        },
      });
      links.push({
        id: this.newId(),
        type: "DirectorOf",
        fromId: personId,
        toId: companyId,
        classification: "Public",
        provenance: this.provenance(`director:${nzbn}:${fullName}`, undefined, d, ctx.fetchedBy),
        createdAt: now, updatedAt: now,
        properties: {
          startDate: d.appointmentDate?.slice(0, 10),
          endDate: d.ceasedDate?.slice(0, 10),
          appointmentSource: "Companies Register",
        },
      });
    }

    // Shareholders — same caveat.
    const shareholdings = await this.safeFetchArray(f, `${this.opts.baseUrl}/companies/${nzbn}/shareholdings`);
    for (const s of shareholdings) {
      for (const allocation of s.allocations ?? []) {
        for (const holder of allocation.shareholders ?? []) {
          const personId = this.newId();
          objects.push({
            id: personId,
            type: "Person",
            classification: "Public",
            provenance: this.provenance(`holder:${nzbn}:${holder.name}`, undefined, holder, ctx.fetchedBy),
            createdAt: now, updatedAt: now,
            properties: { fullName: holder.name ?? "Unknown" },
          });
          links.push({
            id: this.newId(),
            type: "ShareholderOf",
            fromId: personId,
            toId: companyId,
            classification: "Public",
            provenance: this.provenance(`holder:${nzbn}:${holder.name}`, undefined, holder, ctx.fetchedBy),
            createdAt: now, updatedAt: now,
            properties: {
              shares: typeof allocation.shares === "number" ? allocation.shares : undefined,
              percentage: typeof allocation.percentage === "number" ? allocation.percentage : undefined,
            },
          });
        }
      }
    }

    return { objects, links };
  }

  private async safeFetchArray(f: typeof fetch, url: string): Promise<any[]> {
    try {
      const res = await f(url, this.headers());
      if (!res.ok) return [];
      const body = await res.json();
      if (Array.isArray(body)) return body;
      if (Array.isArray(body?.items)) return body.items;
      return [];
    } catch {
      return [];
    }
  }
}

const mapStatus = (raw: unknown): "Registered" | "InLiquidation" | "Removed" | "InReceivership" | "Other" => {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("registered") || s === "active") return "Registered";
  if (s.includes("liquidation")) return "InLiquidation";
  if (s.includes("receiver")) return "InReceivership";
  if (s.includes("removed") || s.includes("dissolved")) return "Removed";
  return "Other";
};
