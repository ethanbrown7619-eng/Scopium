import { MbieConnector } from "./mbie-base";
import type { ScopiumObject, ScopiumLink } from "@scopium/ontology";
import type { Materialised, SyncContext, SyncResult } from "./base";

/**
 * NZBN connector — official New Zealand Business Number register.
 * https://api.business.govt.nz/services/v5/nzbnregister/
 *
 * Each entity becomes an NZCompany (when entity-type is "NZ Limited Company")
 * or Organisation. Officers exposed via the role list become Person objects
 * with DirectorOf links.
 */
export class NzbnConnector extends MbieConnector {
  readonly id = "nzbn";
  readonly version = "0.1.0";
  readonly displayName = "NZBN Register";
  readonly description = "Real NZ business entities from the New Zealand Business Number register.";
  protected readonly apiPath = "v5/nzbnregister";

  async sync(ctx: SyncContext): Promise<SyncResult> {
    const start = Date.now();
    let fetched = 0, totalObjs = 0, totalLinks = 0;
    let pageNumber = 1;
    const pageSize = 50;

    while (fetched < this.opts.limit) {
      ctx.signal?.throwIfAborted();
      const data = await this.fetchJson("/entities", {
        "page-number": pageNumber,
        "page-size": pageSize,
        "entity-type-description": "NZ Limited Company",
      }).catch(() => null);
      const items: any[] = data?.items ?? [];
      if (items.length === 0) break;

      for (const item of items) {
        if (fetched >= this.opts.limit) break;
        ctx.signal?.throwIfAborted();
        const batch = await this.materialise(item, ctx);
        if (batch.objects.length > 0) {
          await ctx.emit(batch);
          totalObjs += batch.objects.length;
          totalLinks += batch.links.length;
        }
        fetched++;
      }

      if (items.length < pageSize) break;
      pageNumber++;
    }

    return { objectsEmitted: totalObjs, linksEmitted: totalLinks, durationMs: Date.now() - start };
  }

  private async materialise(item: any, ctx: SyncContext): Promise<Materialised> {
    const now = this.nowIso();
    const nzbn = String(item.nzbn ?? "");
    if (!/^\d{13}$/.test(nzbn)) return { objects: [], links: [] };

    const companyId = this.newId();
    const company: ScopiumObject = {
      id: companyId,
      type: "NZCompany",
      classification: "Public",
      provenance: this.provenance(nzbn, `https://www.nzbn.govt.nz/mynzbn/nzbndetails/${nzbn}/`, item, ctx.fetchedBy),
      createdAt: now, updatedAt: now,
      properties: {
        name: item.entityName ?? "Unknown",
        nzbn,
        companyNumber: String(item.sourceRegisterUniqueIdentifier ?? ""),
        status: mapStatus(item.entityStatusDescription),
        incorporationDate: (item.registrationDate ?? "").slice(0, 10) || undefined,
        registeredOffice: item.addresses?.find?.((a: any) => /registered/i.test(a.addressType ?? ""))?.address1,
      },
    };

    const objects: ScopiumObject[] = [company];
    const links: ScopiumLink[] = [];

    // Try to fetch the detail record for roles (directors). Optional — the
    // entities list may not include roles by default.
    try {
      const detail = await this.fetchJson(`/entities/${nzbn}`);
      const roles: any[] = detail?.roles ?? [];
      for (const role of roles) {
        if (!/director/i.test(role.roleType ?? "")) continue;
        const person = role.rolePerson ?? role;
        const fullName = [person.firstName, person.middleNames, person.lastName].filter(Boolean).join(" ").trim()
          || person.fullName || person.name;
        if (!fullName) continue;
        const personId = this.newId();
        objects.push({
          id: personId,
          type: "Person",
          classification: "Public",
          provenance: this.provenance(`nzbn-director:${nzbn}:${fullName}`, undefined, role, ctx.fetchedBy),
          createdAt: now, updatedAt: now,
          properties: { fullName, givenNames: person.firstName, familyName: person.lastName },
        });
        links.push({
          id: this.newId(),
          type: "DirectorOf",
          fromId: personId,
          toId: companyId,
          classification: "Public",
          provenance: this.provenance(`nzbn-director:${nzbn}:${fullName}`, undefined, role, ctx.fetchedBy),
          createdAt: now, updatedAt: now,
          properties: {
            startDate: (role.appointmentDate ?? "").slice(0, 10) || undefined,
            endDate: (role.ceasedDate ?? "").slice(0, 10) || undefined,
            appointmentSource: "NZBN Register",
          },
        });
      }
    } catch {
      // Best-effort — entity list-only ingest is fine without role detail.
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
