/**
 * Assemble a person profile: given one Person object id, gather its resolved
 * cluster (records joined by confirmed/candidate SameAs) and everything those
 * records link to — companies, charities, credentials, events, property — each
 * carrying its source provenance. This is what the person-search UI renders.
 */
import { sql } from "drizzle-orm";
import { db } from "./client";
import type { ObjectRow, LinkRow } from "./repository";

export type PersonProfile = {
  seedId: string;
  /** All source-scoped person records determined to be the same human. */
  cluster: ObjectRow[];
  /** Confidence of the cluster (min confirmed-edge confidence, or 1 if singleton). */
  clusterConfidence: number;
  /** Connected entities grouped by type, e.g. { NZCompany: [...], Credential: [...] }. */
  connected: Record<string, ObjectRow[]>;
  /** Every link touching the cluster (for the graph view + provenance). */
  links: LinkRow[];
  /** Distinct source connectors that contributed — the "reputable sources" list. */
  sources: string[];
};

const rawList = (ids: string[]): string => ids.map(i => `'${i.replace(/'/g, "''")}'`).join(",");

export const buildPersonProfile = async (seedId: string): Promise<PersonProfile | null> => {
  const seedRes = await db.execute(sql.raw(
    `SELECT id, type, classification, properties, provenance FROM objects WHERE id = '${seedId.replace(/'/g, "''")}'`,
  ));
  const seed = (seedRes as unknown as ObjectRow[])[0];
  if (!seed) return null;

  // 1. Resolve the cluster: follow SameAs edges (confirmed or candidate) up to 2 hops.
  const clusterRes = await db.execute(sql.raw(`
    WITH RECURSIVE cluster(id, depth) AS (
      SELECT '${seedId.replace(/'/g, "''")}'::text, 0
      UNION
      SELECT CASE WHEN l.from_id = c.id THEN l.to_id ELSE l.from_id END, c.depth + 1
      FROM cluster c
      JOIN links l ON (l.from_id = c.id OR l.to_id = c.id)
      WHERE l.type = 'SameAs'
        AND (l.properties->>'status') IN ('confirmed','candidate')
        AND c.depth < 2
    )
    SELECT DISTINCT o.id, o.type, o.classification, o.properties, o.provenance
    FROM objects o JOIN cluster c ON c.id = o.id
  `));
  const cluster = (clusterRes as unknown as ObjectRow[]) ?? [];
  const clusterIds = cluster.map(c => c.id);
  if (clusterIds.length === 0) return null;

  // 2. All links touching the cluster.
  const linkRes = await db.execute(sql.raw(
    `SELECT id, type, classification, from_id, to_id, properties, provenance
     FROM links WHERE from_id IN (${rawList(clusterIds)}) OR to_id IN (${rawList(clusterIds)})`,
  ));
  const linkRows = (linkRes as unknown as LinkRow[]) ?? [];

  // 3. Neighbouring entities (everything the cluster connects to, minus the cluster itself).
  const clusterSet = new Set(clusterIds);
  const neighbourIds = Array.from(new Set(
    linkRows.flatMap(l => [l.from_id, l.to_id]).filter(id => !clusterSet.has(id)),
  ));
  const neighbours = neighbourIds.length
    ? (await db.execute(sql.raw(
        `SELECT id, type, classification, properties, provenance
         FROM objects WHERE id IN (${rawList(neighbourIds)})`,
      )) as unknown as ObjectRow[])
    : [];

  const connected: Record<string, ObjectRow[]> = {};
  for (const n of neighbours) (connected[n.type] ??= []).push(n);

  // 4. Cluster confidence = weakest confirmed SameAs edge inside it.
  const confirmedEdges = linkRows.filter(
    l => l.type === "SameAs" && clusterSet.has(l.from_id) && clusterSet.has(l.to_id),
  );
  const clusterConfidence = confirmedEdges.length === 0
    ? 1
    : Math.min(...confirmedEdges.map(l => Number(l.properties.confidence ?? 1)));

  // 5. Distinct contributing sources.
  const sources = Array.from(new Set(
    [...cluster, ...neighbours].map(o => String((o.provenance as any)?.connectorId ?? "unknown")),
  )).sort();

  return { seedId, cluster, clusterConfidence, connected, links: linkRows, sources };
};
