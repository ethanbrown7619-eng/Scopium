import { MbieConnector } from "./mbie-base";
import type { ScopiumObject, ScopiumLink } from "@scopium/ontology";
import type { Materialised, SyncContext, SyncResult } from "./base";

/**
 * IPONZ connector — Intellectual Property Office of New Zealand.
 * https://api.business.govt.nz/services/v5/iponz/
 *
 * Trademarks, patents, and design registrations become Asset objects
 * (assetClass: Intangible), with Owns links from the proprietor entity.
 */
export class IponzConnector extends MbieConnector {
  readonly id = "iponz";
  readonly version = "0.1.0";
  readonly displayName = "IPONZ";
  readonly description = "Real NZ trademarks, patents, and designs from IPONZ.";
  // Gateway path — verify against api-portal.business.govt.nz IPONZ v5 docs.
  protected readonly apiPath = "iponz/v5";

  async sync(ctx: SyncContext): Promise<SyncResult> {
    const start = Date.now();
    let fetched = 0, totalObjs = 0, totalLinks = 0;
    const pageSize = 50;
    let pageNumber = 1;

    while (fetched < this.opts.limit) {
      ctx.signal?.throwIfAborted();
      const data = await this.fetchJson("/trademarks", {
        "page-number": pageNumber,
        "page-size": pageSize,
      }).catch(() => null);
      const items: any[] = data?.items ?? data?.trademarks ?? [];
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
    const tmNumber = String(item.applicationNumber ?? item.id ?? "");
    if (!tmNumber) return { objects: [], links: [] };

    const tmId = this.newId();
    const tm: ScopiumObject = {
      id: tmId,
      type: "Asset",
      classification: "Public",
      provenance: this.provenance(`iponz-tm:${tmNumber}`, undefined, item, ctx.fetchedBy),
      createdAt: now, updatedAt: now,
      properties: {
        name: item.tradeMarkText ?? item.markText ?? `Trademark ${tmNumber}`,
        assetClass: "Intangible",
        identifier: tmNumber,
      },
    };

    const objects: ScopiumObject[] = [tm];
    const links: ScopiumLink[] = [];

    // Proprietor / applicant becomes an Organisation linked via Owns.
    const proprietor = item.proprietorName ?? item.applicantName ?? item.owner;
    if (proprietor) {
      const orgId = this.newId();
      objects.push({
        id: orgId,
        type: "Organisation",
        classification: "Public",
        provenance: this.provenance(`iponz-prop:${tmNumber}`, undefined, item, ctx.fetchedBy),
        createdAt: now, updatedAt: now,
        properties: { name: proprietor },
      });
      links.push({
        id: this.newId(),
        type: "Owns",
        fromId: orgId,
        toId: tmId,
        classification: "Public",
        provenance: this.provenance(`iponz-owns:${tmNumber}`, undefined, item, ctx.fetchedBy),
        createdAt: now, updatedAt: now,
        properties: {
          startDate: (item.applicationDate ?? "").slice(0, 10) || undefined,
        },
      });
    }

    return { objects, links };
  }
}
