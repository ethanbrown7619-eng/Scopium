import Papa from "papaparse";
import { z } from "zod";
import { Connector, type Materialised, type SyncContext, type SyncResult } from "./base";
import type { ScopiumObject, ScopiumObjectType } from "@scopium/ontology";

export const ColumnMapping = z.object({
  /** Source CSV column name. */
  source: z.string(),
  /** Target ontology property path (dot path within `properties`). */
  target: z.string(),
  /** Optional cast — strings parse as-is. */
  cast: z.enum(["string", "number", "boolean", "date"]).default("string"),
});
export type ColumnMapping = z.infer<typeof ColumnMapping>;

export type CsvUploadOptions = {
  csv: string;
  /** Object type to materialise per row. */
  objectType: ScopiumObjectType;
  mappings: ColumnMapping[];
  /** Source identifier used in provenance (e.g. uploaded filename). */
  sourceLabel: string;
};

/** CSV upload connector — analyst-facing, used after the column-mapping wizard. */
export class CsvUploadConnector extends Connector {
  readonly id = "csv-upload";
  readonly version = "0.1.0";
  readonly displayName = "CSV upload";
  readonly description = "Map CSV columns to ontology properties via the upload wizard.";

  constructor(private readonly opts: CsvUploadOptions) { super(); }

  async sync(ctx: SyncContext): Promise<SyncResult> {
    const start = Date.now();
    const { data } = Papa.parse<Record<string, string>>(this.opts.csv, { header: true, skipEmptyLines: true });
    const objects: ScopiumObject[] = [];
    const now = this.nowIso();

    for (const [i, row] of data.entries()) {
      ctx.signal?.throwIfAborted();
      const properties: Record<string, unknown> = {};
      for (const m of this.opts.mappings) {
        const raw = row[m.source];
        if (raw == null || raw === "") continue;
        properties[m.target] = cast(raw, m.cast);
      }
      const obj = {
        id: this.newId(),
        type: this.opts.objectType,
        classification: "Public" as const,
        provenance: this.provenance(`${this.opts.sourceLabel}:row:${i + 1}`, undefined, row, ctx.fetchedBy),
        createdAt: now,
        updatedAt: now,
        properties,
      } as ScopiumObject;
      objects.push(obj);
    }

    await ctx.emit({ objects, links: [] });
    return { objectsEmitted: objects.length, linksEmitted: 0, durationMs: Date.now() - start };
  }
}

const cast = (raw: string, kind: ColumnMapping["cast"]): unknown => {
  switch (kind) {
    case "number": return Number(raw);
    case "boolean": return /^(true|1|yes|y)$/i.test(raw);
    case "date": return new Date(raw).toISOString();
    default: return raw;
  }
};
