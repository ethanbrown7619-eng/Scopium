import { ulid } from "ulid";
import type { ScopiumObject, ScopiumLink, ProvenanceRecord } from "@scopium/ontology";

export type Materialised = {
  objects: ScopiumObject[];
  links: ScopiumLink[];
};

/**
 * A raw, immutable capture of an upstream payload. Stored in the landing zone
 * before parsing so parsers can be fixed and re-run without re-fetching, and
 * so every materialised fact points at the exact bytes it came from.
 */
export type RawCapture = {
  id: string;
  connectorId: string;
  sourceUrl: string;
  /** Stable upstream key (e.g. company number, officer id, notice id). */
  sourceId: string;
  contentHash: string;
  httpStatus: number;
  parserVersion: string;
  /** JSON-serialisable payload (parsed JSON, or {html} / {text} wrapper). */
  payload: unknown;
  fetchedAt: string;
};

export type SyncContext = {
  /** Called repeatedly with batches; lets the caller flush to Postgres incrementally. */
  emit: (batch: Materialised) => Promise<void> | void;
  /** Optional: persist a raw capture to the landing zone (two-phase connectors). */
  emitRaw?: (capture: RawCapture) => Promise<void> | void;
  /** Logger; defaults to console. */
  log?: (msg: string, meta?: Record<string, unknown>) => void;
  /** User initiating the sync, recorded in provenance. */
  fetchedBy?: string;
  /** Abort signal for long-running syncs. */
  signal?: AbortSignal;
};

export type SyncResult = {
  objectsEmitted: number;
  linksEmitted: number;
  durationMs: number;
};

export abstract class Connector {
  abstract readonly id: string;
  abstract readonly version: string;
  abstract readonly displayName: string;
  abstract readonly description: string;

  abstract sync(ctx: SyncContext): Promise<SyncResult>;

  protected newId(): string { return ulid(); }

  /** Deterministic content hash for raw captures (FNV-1a, no crypto dep). */
  protected hash(input: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }

  protected provenance(sourceId: string, sourceUrl?: string, sourceRow?: unknown, fetchedBy?: string): ProvenanceRecord {
    return {
      connectorId: this.id,
      connectorVersion: this.version,
      sourceId,
      sourceUrl,
      sourceRow,
      syncedAt: new Date().toISOString(),
      fetchedBy,
    };
  }

  protected nowIso(): string { return new Date().toISOString(); }
}
