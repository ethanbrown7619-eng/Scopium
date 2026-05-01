import { z } from "zod";

/**
 * Provenance is recorded on every materialised object. Every property and
 * link can be traced back to: which connector produced it, which row in the
 * upstream source, when it was synced, and (where available) a stable
 * upstream identifier we can refetch.
 */
export const ProvenanceRecord = z.object({
  connectorId: z.string(),
  connectorVersion: z.string(),
  sourceId: z.string().describe("Stable upstream ID (e.g. NZBN, dataset row hash)"),
  sourceUrl: z.string().url().optional(),
  sourceRow: z.unknown().optional().describe("Raw upstream payload, JSON-serialisable"),
  syncedAt: z.string().datetime(),
  fetchedBy: z.string().optional().describe("User or system actor that triggered the sync"),
});
export type ProvenanceRecord = z.infer<typeof ProvenanceRecord>;
