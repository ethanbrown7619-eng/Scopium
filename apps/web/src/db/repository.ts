import type { Materialised } from "@scopium/connectors";
import { db } from "./client";
import { objects, links } from "./schema";
import { sql } from "drizzle-orm";

/** Bulk-upsert a connector batch. */
export const persistMaterialised = async ({ objects: objs, links: lnks }: Materialised): Promise<void> => {
  if (objs.length > 0) {
    await db.insert(objects).values(objs.map(o => ({
      id: o.id,
      type: o.type,
      classification: o.classification,
      properties: o.properties as Record<string, unknown>,
      provenance: o.provenance as unknown as Record<string, unknown>,
      createdAt: new Date(o.createdAt),
      updatedAt: new Date(o.updatedAt),
    }))).onConflictDoUpdate({
      target: objects.id,
      set: { properties: sql`EXCLUDED.properties`, updatedAt: sql`EXCLUDED.updated_at` },
    });
  }
  if (lnks.length > 0) {
    await db.insert(links).values(lnks.map(l => ({
      id: l.id,
      type: l.type,
      fromId: l.fromId,
      toId: l.toId,
      classification: l.classification,
      properties: l.properties as Record<string, unknown>,
      provenance: l.provenance as unknown as Record<string, unknown>,
      createdAt: new Date(l.createdAt),
      updatedAt: new Date(l.updatedAt),
    }))).onConflictDoNothing();
  }
};

export type ObjectRow = {
  id: string;
  type: string;
  classification: string;
  properties: Record<string, unknown>;
  provenance: Record<string, unknown>;
};

export type LinkRow = ObjectRow & { from_id: string; to_id: string };

/** Run a compiled query and return objects + links touching them (for graph view). */
export const runCompiledQuery = async (sqlText: string, params: unknown[]): Promise<{ rows: ObjectRow[] }> => {
  const result = await db.execute(sql.raw(formatSql(sqlText, params)));
  return { rows: (result as unknown as ObjectRow[]) ?? [] };
};

export const linksFor = async (ids: string[]): Promise<LinkRow[]> => {
  if (ids.length === 0) return [];
  const list = ids.map(i => `'${i.replace(/'/g, "''")}'`).join(",");
  const result = await db.execute(sql.raw(
    `SELECT id, type, classification, from_id, to_id, properties, provenance
     FROM links WHERE from_id IN (${list}) OR to_id IN (${list}) LIMIT 1000`,
  ));
  return (result as unknown as LinkRow[]) ?? [];
};

/**
 * Inline parameter values into the SQL string. We do this here (rather than
 * passing through drizzle's parameter machinery) because the compiler emits
 * positional `$n` placeholders. A small inliner with strict escaping keeps
 * this safe for the value types our AST permits.
 */
const formatSql = (sqlText: string, params: unknown[]): string =>
  sqlText.replace(/\$(\d+)/g, (_, idx) => formatParam(params[Number(idx) - 1]));

const formatParam = (v: unknown): string => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (Array.isArray(v)) return `ARRAY[${v.map(formatParam).join(",")}]`;
  return `'${String(v).replace(/'/g, "''")}'`;
};
