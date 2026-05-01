import { Connector, type SyncContext, type SyncResult } from "./base";
import type { ScopiumObject } from "@scopium/ontology";

export type CkanOptions = {
  baseUrl: string;
  query?: string;
  limit: number;
  fetchImpl?: typeof fetch;
};

/**
 * data.govt.nz CKAN catalogue connector. Materialises Document objects, one
 * per dataset, so they're discoverable inside the workspace search/graph.
 */
export class CkanConnector extends Connector {
  readonly id = "data-govt-nz-ckan";
  readonly version = "0.1.0";
  readonly displayName = "data.govt.nz CKAN catalogue";
  readonly description = "Generic dataset discovery via CKAN package_search.";

  constructor(private readonly opts: CkanOptions) { super(); }

  async sync(ctx: SyncContext): Promise<SyncResult> {
    const start = Date.now();
    const f = this.opts.fetchImpl ?? fetch;
    const url = new URL("/action/package_search", this.opts.baseUrl);
    if (this.opts.query) url.searchParams.set("q", this.opts.query);
    url.searchParams.set("rows", String(this.opts.limit));

    const res = await f(url);
    if (!res.ok) throw new Error(`CKAN fetch failed: ${res.status}`);
    const body = await res.json() as { result?: { results?: any[] } };
    const results = body.result?.results ?? [];

    const objects: ScopiumObject[] = [];
    const now = this.nowIso();
    for (const ds of results) {
      objects.push({
        id: this.newId(),
        type: "Document",
        classification: "Public",
        provenance: this.provenance(`ckan:${ds.id}`, `${this.opts.baseUrl}/action/package_show?id=${ds.name}`, ds, ctx.fetchedBy),
        createdAt: now, updatedAt: now,
        properties: {
          title: ds.title ?? ds.name,
          mimeType: "text/html",
          url: ds.url,
          publishedAt: ds.metadata_created,
        },
      });
    }
    await ctx.emit({ objects, links: [] });
    return { objectsEmitted: objects.length, linksEmitted: 0, durationMs: Date.now() - start };
  }
}
