import { MbieConnector, type MbieOptions } from "./mbie-base";
import { sanitiseAddress } from "@scopium/ontology";
import type { ScopiumObject, ScopiumLink } from "@scopium/ontology";
import type { Materialised, SyncContext, SyncResult } from "./base";

export type DisqualifiedDirectorsOptions = MbieOptions & {
  /** Person name to search — "starts with" match, min 2 chars. */
  query: string;
};

/**
 * Companies Register — Disqualified Directors search (v3).
 * https://api.business.govt.nz/gateway/companies-office/companies-register/disqualified-directors/v3/search
 *
 * Name-searchable ("starts with" on given/middle/last). Each result becomes a
 * Person plus one Event per disqualification criterion, with PartyTo links, and
 * an NZCompany + a flagged DirectorOf for each associated company. Surfacing a
 * banning is the register's statutory purpose, so this is low-sensitivity.
 */
export class DisqualifiedDirectorsConnector extends MbieConnector {
  readonly id = "disqualified-directors";
  readonly version = "0.1.0";
  readonly displayName = "Disqualified Directors";
  readonly description = "NZ disqualified/banned company directors (Companies Register v3 name search).";
  protected readonly apiPath = "companies-office/companies-register/disqualified-directors/v3";

  constructor(private readonly ddOpts: DisqualifiedDirectorsOptions) { super(ddOpts); }

  async sync(ctx: SyncContext): Promise<SyncResult> {
    const start = Date.now();
    let page = 0, fetched = 0, totalObjects = 0, totalLinks = 0;
    const pageSize = 20;

    while (fetched < this.ddOpts.limit) {
      ctx.signal?.throwIfAborted();
      const data = await this.fetchJson("/search", {
        name: this.ddOpts.query,
        page,
        "page-size": pageSize,
      }).catch(() => null);
      const roles: any[] = data?.roles ?? [];
      if (roles.length === 0) break;

      for (const person of roles) {
        if (fetched >= this.ddOpts.limit) break;
        const batch = this.materialise(person, ctx);
        if (batch.objects.length > 0) {
          await ctx.emit(batch);
          totalObjects += batch.objects.length;
          totalLinks += batch.links.length;
        }
        fetched++;
      }

      if (roles.length < pageSize) break;
      page++;
    }

    return { objectsEmitted: totalObjects, linksEmitted: totalLinks, durationMs: Date.now() - start };
  }

  private materialise(person: any, ctx: SyncContext): Materialised {
    const now = this.nowIso();
    const objects: ScopiumObject[] = [];
    const links: ScopiumLink[] = [];

    const fullName = [person.firstName, person.middleName, person.lastName].filter(Boolean).join(" ").trim();
    if (!fullName) return { objects, links };
    const ddId = String(person.disqualifiedDirectorId ?? fullName);

    const personId = this.newId();
    const address = (person.addresses ?? [])[0];
    objects.push({
      id: personId,
      type: "Person",
      classification: "Public",
      provenance: this.provenance(`disqualified:${ddId}`, undefined, person, ctx.fetchedBy),
      createdAt: now, updatedAt: now,
      properties: {
        fullName,
        givenNames: person.firstName,
        middleNames: person.middleName,
        familyName: person.lastName,
        aliases: person.aliases?.aliases,
        residentialLocality: sanitiseAddress((address?.addressLines ?? []).join(", ")),
        sourceScoped: true,
      },
    });

    for (const crit of person.disqualificationCriteria?.criteria ?? []) {
      const eventId = this.newId();
      const start = (crit.startDate ?? "").slice(0, 10);
      objects.push({
        id: eventId,
        type: "Event",
        classification: "Public",
        provenance: this.provenance(`disqualification:${ddId}:${start}`, undefined, crit, ctx.fetchedBy),
        createdAt: now, updatedAt: now,
        properties: {
          title: `Director disqualification: ${crit.criteria ?? "order"}`,
          occurredAt: start ? `${start}T00:00:00.000Z` : now,
          endedAt: crit.endDate ? `${crit.endDate.slice(0, 10)}T00:00:00.000Z` : undefined,
          description: crit.comments ?? crit.criteria,
        },
      });
      links.push({
        id: this.newId(), type: "PartyTo", fromId: personId, toId: eventId,
        classification: "Public",
        provenance: this.provenance(`disqualification-party:${ddId}`, undefined, crit, ctx.fetchedBy),
        createdAt: now, updatedAt: now, properties: { role: "Counterparty" },
      });
    }

    for (const assoc of person.associations?.associations ?? []) {
      const nzbn = String(assoc.associatedCompanyNzbn ?? "").padStart(13, "0").slice(0, 13);
      const companyId = this.newId();
      objects.push({
        id: companyId, type: "NZCompany", classification: "Public",
        provenance: this.provenance(`disqualified-company:${assoc.associatedCompanyNumber}`, undefined, assoc, ctx.fetchedBy),
        createdAt: now, updatedAt: now,
        properties: {
          name: assoc.associatedCompanyName ?? "Unknown",
          nzbn: /^\d{13}$/.test(nzbn) ? nzbn : "0000000000000",
          companyNumber: String(assoc.associatedCompanyNumber ?? ""),
          status: "Other",
        },
      });
      links.push({
        id: this.newId(), type: "DirectorOf", fromId: personId, toId: companyId,
        classification: "Public",
        provenance: this.provenance(`disqualified-directorship:${assoc.associatedCompanyNumber}`, undefined, assoc, ctx.fetchedBy),
        createdAt: now, updatedAt: now,
        properties: { appointmentSource: "Disqualified Directors Register" },
      });
    }

    return { objects, links };
  }
}
