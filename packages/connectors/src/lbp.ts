import { MbieConnector } from "./mbie-base";
import type { ScopiumObject } from "@scopium/ontology";
import type { Materialised, SyncContext, SyncResult } from "./base";

/**
 * Licensed Building Practitioners connector.
 * https://api.business.govt.nz/services/v2/lbp/
 *
 * Each LBP becomes a Person carrying their license id and category in
 * properties. No links by default — pair with company/role data later if you
 * want to graph practitioners against builders.
 */
export class LicensedBuildingPractitionersConnector extends MbieConnector {
  readonly id = "lbp";
  readonly version = "0.1.0";
  readonly displayName = "Licensed Building Practitioners";
  readonly description = "Real NZ Licensed Building Practitioners (designers, carpenters, roofers, plasterers, etc.).";
  protected readonly apiPath = "v2/lbp";

  async sync(ctx: SyncContext): Promise<SyncResult> {
    const start = Date.now();
    let fetched = 0, totalObjs = 0;
    const pageSize = 50;
    let pageNumber = 1;

    while (fetched < this.opts.limit) {
      ctx.signal?.throwIfAborted();
      const data = await this.fetchJson("/practitioners", {
        "page-number": pageNumber,
        "page-size": pageSize,
      }).catch(() => null);
      const items: any[] = data?.items ?? data?.practitioners ?? [];
      if (items.length === 0) break;

      for (const item of items) {
        if (fetched >= this.opts.limit) break;
        const batch = this.materialise(item, ctx);
        if (batch.objects.length > 0) {
          await ctx.emit(batch);
          totalObjs += batch.objects.length;
        }
        fetched++;
      }

      if (items.length < pageSize) break;
      pageNumber++;
    }

    return { objectsEmitted: totalObjs, linksEmitted: 0, durationMs: Date.now() - start };
  }

  private materialise(item: any, ctx: SyncContext): Materialised {
    const now = this.nowIso();
    const licenceNo = String(item.licenceNumber ?? item.id ?? "");
    if (!licenceNo) return { objects: [], links: [] };

    const fullName = [item.firstName, item.lastName].filter(Boolean).join(" ").trim() || item.name;
    if (!fullName) return { objects: [], links: [] };

    const person: ScopiumObject = {
      id: this.newId(),
      type: "Person",
      classification: "Public",
      provenance: this.provenance(`lbp:${licenceNo}`, undefined, item, ctx.fetchedBy),
      createdAt: now, updatedAt: now,
      properties: {
        fullName,
        givenNames: item.firstName,
        familyName: item.lastName,
        residentialLocality: item.businessSuburb ?? item.locality,
      },
    };

    return { objects: [person], links: [] };
  }
}
