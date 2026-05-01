import { ulid } from "ulid";
import type { ScopiumObject, ScopiumLink, ProvenanceRecord } from "@scopium/ontology";

export type Materialised = {
  objects: ScopiumObject[];
  links: ScopiumLink[];
};

export type SyncContext = {
  /** Called repeatedly with batches; lets the caller flush to Postgres incrementally. */
  emit: (batch: Materialised) => Promise<void> | void;
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
