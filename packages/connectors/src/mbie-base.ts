import { Connector } from "./base";

export type MbieOptions = {
  /** Primary key from the MBIE API portal subscription. */
  apiKey: string;
  /** Maximum records to ingest per sync. */
  limit: number;
  /** Override base URL for tests. */
  baseUrl?: string;
  /** Override fetch for tests. */
  fetchImpl?: typeof fetch;
};

/**
 * Shared base for MBIE API connectors (NZBN, Insolvency, IPONZ, LBP, MVTR,
 * etc.). All MBIE APIs share the same auth header and live under
 * api.business.govt.nz/services/<api>/<version>. Subclasses set `apiPath`
 * (e.g. "v5/nzbnregister") and use `fetchJson()` to hit endpoints.
 */
export abstract class MbieConnector extends Connector {
  /** API path segment, e.g. "v5/nzbnregister" or "v5/insolvency". */
  protected abstract readonly apiPath: string;

  constructor(protected readonly opts: MbieOptions) { super(); }

  protected get fetchImpl(): typeof fetch {
    return this.opts.fetchImpl ?? fetch;
  }

  protected baseUrl(): string {
    return this.opts.baseUrl ?? `https://api.business.govt.nz/services/${this.apiPath}`;
  }

  protected async fetchJson(path: string, params?: Record<string, string | number>): Promise<any> {
    const url = new URL(`${this.baseUrl()}${path}`);
    for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, String(v));
    const res = await this.fetchImpl(url, {
      headers: {
        Accept: "application/json",
        "Ocp-Apim-Subscription-Key": this.opts.apiKey,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${this.id} ${path} failed: ${res.status} ${text.slice(0, 200)}`);
    }
    return res.json();
  }
}
