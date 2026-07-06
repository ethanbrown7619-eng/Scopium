import { Connector, type Materialised, type SyncContext, type SyncResult, type RawCapture } from "./base";
import { politeFetch } from "./http";
import type { ScopiumObject, ScopiumLink } from "@scopium/ontology";

/**
 * Description of a professional/occupational licence register. Each of NZ's
 * ~20 public "check my practitioner" registers is the same shape — a
 * name-searchable list of people holding a licence — so one connector,
 * parameterised by a descriptor, covers them all. Add a new register by
 * appending a LICENCE_REGISTERS entry, not by writing a new class.
 */
export type LicenceRegisterDescriptor = {
  id: string;
  displayName: string;
  /** The issuing regulator, stored on the Credential. */
  register: string;
  /** Human licence kind, e.g. "Licensed Building Practitioner". */
  kind: string;
  /** Build the search URL for a person name. */
  searchUrl: (name: string) => string;
  /** Extract the array of result rows from the response JSON. */
  selectRows: (body: any) => any[];
  /** Map one row to normalised licence fields. */
  mapRow: (row: any) => {
    fullName: string;
    licenceNumber?: string;
    status?: string;
    scope?: string;
    locality?: string;
  } | null;
  /** Public profile URL for a row, for provenance. */
  rowUrl?: (row: any) => string | undefined;
};

/**
 * The known free, public, name-searchable NZ licence registers. URLs point at
 * the public search JSON where the shape is known; where an endpoint is
 * undocumented the selector/mapper are defensive so a shape change degrades to
 * "no rows" rather than a crash. Verify endpoints before production per the
 * SOURCES.md "verify-before-ship" list.
 */
export const LICENCE_REGISTERS: Record<string, Omit<LicenceRegisterDescriptor, "searchUrl"> & { searchUrl: (name: string) => string }> = {
  lbp: {
    id: "lbp",
    displayName: "Licensed Building Practitioners",
    register: "Licensed Building Practitioners Board",
    kind: "Licensed Building Practitioner",
    searchUrl: name => `https://www.lbp.govt.nz/api/practitioners/search?name=${encodeURIComponent(name)}`,
    selectRows: b => b?.items ?? b?.results ?? [],
    mapRow: r => r?.name || r?.fullName ? {
      fullName: r.fullName ?? r.name,
      licenceNumber: r.licenceNumber ?? r.lbpNumber,
      status: r.status,
      scope: Array.isArray(r.licenceClasses) ? r.licenceClasses.join(", ") : r.licenceClass,
      locality: r.suburb ?? r.city,
    } : null,
  },
  rea: {
    id: "rea",
    displayName: "Real Estate Agents",
    register: "Real Estate Authority",
    kind: "Real Estate Licensee",
    searchUrl: name => `https://www.rea.govt.nz/api/licensees/search?q=${encodeURIComponent(name)}`,
    selectRows: b => b?.items ?? b?.results ?? [],
    mapRow: r => r?.name || r?.fullName ? {
      fullName: r.fullName ?? r.name,
      licenceNumber: r.licenceNumber,
      status: r.status,
      scope: r.licenceClass ?? r.agencyName,
      locality: r.city,
    } : null,
  },
  fspr: {
    id: "fspr",
    displayName: "Financial Service Providers",
    register: "Financial Service Providers Register",
    kind: "Financial Service Provider",
    searchUrl: name => `https://fsp-register.companiesoffice.govt.nz/app/api/fsp/search?q=${encodeURIComponent(name)}`,
    selectRows: b => b?.items ?? b?.results ?? [],
    mapRow: r => r?.name || r?.fullName ? {
      fullName: r.fullName ?? r.name,
      licenceNumber: r.fspNumber ?? r.registrationNumber,
      status: r.status,
      scope: Array.isArray(r.services) ? r.services.join(", ") : r.services,
      locality: r.city,
    } : null,
  },
};

export type LicenceRegisterOptions = {
  descriptor: LicenceRegisterDescriptor;
  /** Person name to search. */
  query: string;
  limit: number;
  fetchImpl?: typeof fetch;
};

const mapStatus = (raw?: string): "Current" | "Suspended" | "Cancelled" | "Expired" | "Unknown" => {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("current") || s.includes("active") || s.includes("registered")) return "Current";
  if (s.includes("suspend")) return "Suspended";
  if (s.includes("cancel")) return "Cancelled";
  if (s.includes("expire")) return "Expired";
  return "Unknown";
};

/**
 * Generic professional-licence register connector. Given a name, materialises
 * a source-scoped Person, a Credential (the licence), and a Holds link. Person
 * resolution later merges this practitioner with their corporate/charity self.
 */
export class LicenceRegisterConnector extends Connector {
  readonly id: string;
  readonly version = "0.1.0";
  readonly displayName: string;
  readonly description: string;

  constructor(private readonly opts: LicenceRegisterOptions) {
    super();
    this.id = `licence:${opts.descriptor.id}`;
    this.displayName = opts.descriptor.displayName;
    this.description = `${opts.descriptor.register} — public licence register.`;
  }

  async sync(ctx: SyncContext): Promise<SyncResult> {
    const start = Date.now();
    const d = this.opts.descriptor;
    const url = d.searchUrl(this.opts.query);
    const res = await (this.opts.fetchImpl ? this.opts.fetchImpl(url) : politeFetch(url));
    if (!res.ok) throw new Error(`${this.id} search failed: ${res.status}`);
    const body = await res.json();
    const rows = d.selectRows(body).slice(0, this.opts.limit);

    let totalObjects = 0, totalLinks = 0;
    const now = this.nowIso();

    for (const row of rows) {
      ctx.signal?.throwIfAborted();
      const mapped = d.mapRow(row);
      if (!mapped) continue;

      const personId = this.newId();
      const credId = this.newId();
      const rowUrl = d.rowUrl?.(row);
      const objects: ScopiumObject[] = [
        {
          id: personId,
          type: "Person",
          classification: "Public",
          provenance: this.provenance(`${this.id}:${mapped.licenceNumber ?? mapped.fullName}`, rowUrl, row, ctx.fetchedBy),
          createdAt: now, updatedAt: now,
          properties: { fullName: mapped.fullName, occupation: d.kind, residentialLocality: mapped.locality, sourceScoped: true },
        },
        {
          id: credId,
          type: "Credential",
          classification: "Public",
          provenance: this.provenance(`${this.id}:cred:${mapped.licenceNumber ?? mapped.fullName}`, rowUrl, row, ctx.fetchedBy),
          createdAt: now, updatedAt: now,
          properties: {
            kind: d.kind,
            register: d.register,
            licenceNumber: mapped.licenceNumber,
            status: mapStatus(mapped.status),
            scope: mapped.scope,
          },
        },
      ];
      const links: ScopiumLink[] = [{
        id: this.newId(),
        type: "Holds",
        fromId: personId,
        toId: credId,
        classification: "Public",
        provenance: this.provenance(`${this.id}:holds:${mapped.licenceNumber ?? mapped.fullName}`, rowUrl, row, ctx.fetchedBy),
        createdAt: now, updatedAt: now,
        properties: {},
      }];

      await ctx.emit({ objects, links });
      if (ctx.emitRaw) {
        const raw: RawCapture = {
          id: this.newId(), connectorId: this.id, sourceUrl: rowUrl ?? url,
          sourceId: `${this.id}:${mapped.licenceNumber ?? mapped.fullName}`,
          contentHash: this.hash(JSON.stringify(row)), httpStatus: 200,
          parserVersion: this.version, payload: row, fetchedAt: now,
        };
        await ctx.emitRaw(raw);
      }
      totalObjects += objects.length;
      totalLinks += links.length;
    }

    return { objectsEmitted: totalObjects, linksEmitted: totalLinks, durationMs: Date.now() - start };
  }
}
