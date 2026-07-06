import { MbieConnector } from "./mbie-base";
import { sanitiseAddress } from "@scopium/ontology";
import type { ScopiumObject, ScopiumLink } from "@scopium/ontology";
import type { Materialised, SyncContext, SyncResult } from "./base";

/**
 * Insolvency Register connector.
 * https://api.business.govt.nz/services/v5/insolvency/
 *
 * Each insolvency proceeding becomes an Event object; the affected debtor
 * becomes a Person (or NZCompany when the case targets a company), with a
 * PartyTo link from debtor → event.
 */
export class InsolvencyConnector extends MbieConnector {
  readonly id = "insolvency";
  readonly version = "0.1.0";
  readonly displayName = "Insolvency Register";
  readonly description = "Real NZ insolvency proceedings (bankruptcies, liquidations, debt repayment orders).";
  // Gateway path — verify against api-portal.business.govt.nz Insolvency v5 docs.
  protected readonly apiPath = "insolvency/v5";

  async sync(ctx: SyncContext): Promise<SyncResult> {
    const start = Date.now();
    let fetched = 0, totalObjs = 0, totalLinks = 0;
    let pageNumber = 1;
    const pageSize = 50;

    while (fetched < this.opts.limit) {
      ctx.signal?.throwIfAborted();
      const data = await this.fetchJson("/cases", {
        "page-number": pageNumber,
        "page-size": pageSize,
      }).catch(() => null);
      const items: any[] = data?.items ?? data?.cases ?? [];
      if (items.length === 0) break;

      for (const item of items) {
        if (fetched >= this.opts.limit) break;
        const batch = this.materialise(item, ctx);
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

  private materialise(item: any, ctx: SyncContext): Materialised {
    const now = this.nowIso();
    const caseId = String(item.caseNumber ?? item.id ?? "");
    if (!caseId) return { objects: [], links: [] };

    const occurredAt = (item.startDate ?? item.commencementDate ?? item.adjudicationDate ?? "").slice(0, 10);
    const eventTitle = `${item.caseType ?? "Insolvency"}: ${item.debtorName ?? caseId}`;

    const eventId = this.newId();
    const eventObj: ScopiumObject = {
      id: eventId,
      type: "Event",
      classification: "Public",
      provenance: this.provenance(`insolvency:${caseId}`, undefined, item, ctx.fetchedBy),
      createdAt: now, updatedAt: now,
      properties: {
        title: eventTitle,
        occurredAt: occurredAt ? `${occurredAt}T00:00:00.000Z` : new Date().toISOString(),
        endedAt: (item.endDate ?? "").slice(0, 10) ? `${item.endDate.slice(0, 10)}T00:00:00.000Z` : undefined,
        description: item.caseType ?? item.caseStatus,
      },
    };

    const objects: ScopiumObject[] = [eventObj];
    const links: ScopiumLink[] = [];

    const debtorName = item.debtorName ?? item.entityName;
    if (debtorName) {
      const isCompany = /(ltd|limited|llp|ltc)$/i.test(debtorName);
      const debtorId = this.newId();
      objects.push({
        id: debtorId,
        type: isCompany ? "NZCompany" : "Person",
        classification: "Public",
        provenance: this.provenance(`insolvency-debtor:${caseId}`, undefined, item, ctx.fetchedBy),
        createdAt: now, updatedAt: now,
        properties: isCompany
          ? { name: debtorName, nzbn: "0000000000000", companyNumber: caseId, status: "InLiquidation" }
          : {
              fullName: debtorName,
              // Insolvency is one of the few sources exposing DOB — the
              // strongest person-resolution anchor. Kept full for matching.
              dateOfBirth: (item.dateOfBirth ?? item.dob ?? "").slice(0, 10) || undefined,
              occupation: item.occupation,
              residentialLocality: sanitiseAddress(item.address ?? item.debtorAddress),
              sourceScoped: true,
            },
      } as ScopiumObject);
      links.push({
        id: this.newId(),
        type: "PartyTo",
        fromId: debtorId,
        toId: eventId,
        classification: "Public",
        provenance: this.provenance(`insolvency-party:${caseId}`, undefined, item, ctx.fetchedBy),
        createdAt: now, updatedAt: now,
        properties: { role: "Counterparty" },
      });
    }

    return { objects, links };
  }
}
