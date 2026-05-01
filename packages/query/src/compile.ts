import type { Filter, QueryAst, LinkTraversal } from "./ast";

export type CompiledQuery = {
  sql: string;
  params: unknown[];
  /**
   * The result columns we expect: object_id, type, properties, classification.
   * The executor returns these plus contributing object IDs (which equal the
   * object_id column for non-aggregated queries).
   */
  shape: "objects" | "aggregate";
};

/**
 * Compile an AST to parameterised SQL. We avoid Apache AGE so the platform
 * runs on vanilla Postgres; link traversal uses recursive CTEs against the
 * `links` table. If AGE is available, a future executor can swap in Cypher.
 */
export const compile = (ast: QueryAst): CompiledQuery => {
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };

  const renderFilter = (f: Filter, alias: string): string => {
    if (f.kind === "property") {
      const path = `${alias}.properties->>${p(f.field)}`;
      switch (f.op) {
        case "eq": return `${path} = ${p(String(f.value))}`;
        case "neq": return `${path} <> ${p(String(f.value))}`;
        case "contains": return `${path} ILIKE ${p(`%${f.value}%`)}`;
        case "startsWith": return `${path} ILIKE ${p(`${f.value}%`)}`;
        case "in": {
          const arr = Array.isArray(f.value) ? f.value : [f.value];
          return `${path} = ANY(${p(arr.map(String))})`;
        }
        case "lt": return `(${path})::numeric < ${p(Number(f.value))}`;
        case "lte": return `(${path})::numeric <= ${p(Number(f.value))}`;
        case "gt": return `(${path})::numeric > ${p(Number(f.value))}`;
        case "gte": return `(${path})::numeric >= ${p(Number(f.value))}`;
      }
    }
    if (f.kind === "temporal") {
      const path = `(${alias}.properties->>${p(f.field)})::timestamptz`;
      const parts: string[] = [];
      if (f.from) parts.push(`${path} >= ${p(f.from)}`);
      if (f.to) parts.push(`${path} <= ${p(f.to)}`);
      return parts.length ? parts.join(" AND ") : "TRUE";
    }
    // geoBbox — relies on point properties stored as {lat, lon}
    const lon = `(${alias}.properties->'${escapeIdent(f.field)}'->>'lon')::float8`;
    const lat = `(${alias}.properties->'${escapeIdent(f.field)}'->>'lat')::float8`;
    return `${lon} BETWEEN ${p(f.bbox[0])} AND ${p(f.bbox[2])} AND ${lat} BETWEEN ${p(f.bbox[1])} AND ${p(f.bbox[3])}`;
  };

  const baseWhere = ["o.type = " + p(ast.from), ...ast.where.map(f => renderFilter(f, "o"))]
    .filter(Boolean).join(" AND ");

  if (ast.traverse.length === 0) {
    if (ast.aggregate) {
      const { fn, field, groupBy } = ast.aggregate;
      const target = field ? `(o.properties->>${p(field)})::numeric` : "1";
      const select = `${fn.toUpperCase()}(${target}) AS value`;
      const groupCols = groupBy.map((g, i) => `o.properties->>${p(g)} AS grp_${i}`);
      const sql = `
        SELECT ${[...groupCols, select].join(", ")}
        FROM objects o
        WHERE ${baseWhere}
        ${groupBy.length ? `GROUP BY ${groupCols.map((_, i) => `grp_${i}`).join(", ")}` : ""}
        LIMIT ${p(ast.limit)}
      `;
      return { sql: collapseWs(sql), params, shape: "aggregate" };
    }
    const sql = `
      SELECT o.id, o.type, o.classification, o.properties, o.provenance
      FROM objects o
      WHERE ${baseWhere}
      ORDER BY o.updated_at DESC
      LIMIT ${p(ast.limit)}
    `;
    return { sql: collapseWs(sql), params, shape: "objects" };
  }

  // Multi-hop traversal: recursive CTE walks links from the seed set up to depth.
  const seed = `seed AS (SELECT o.id FROM objects o WHERE ${baseWhere})`;
  const hops = ast.traverse.map((t, i) => buildHop(t, i, p)).join("\n,\n");
  const finalSet = `final AS (
    SELECT DISTINCT id FROM (
      ${ast.traverse.map((_, i) => `SELECT id FROM hop_${i}`).join(" UNION ")}
    ) u
  )`;

  const sql = `
    WITH RECURSIVE
      ${seed},
      ${hops},
      ${finalSet}
    SELECT o.id, o.type, o.classification, o.properties, o.provenance
    FROM objects o
    JOIN final f ON f.id = o.id
    ORDER BY o.updated_at DESC
    LIMIT ${p(ast.limit)}
  `;
  return { sql: collapseWs(sql), params, shape: "objects" };
};

const buildHop = (t: LinkTraversal, idx: number, p: (v: unknown) => string): string => {
  const linkType = p(t.via);
  const dir = t.direction;
  const matchFrom = dir === "outgoing" || dir === "either";
  const matchTo = dir === "incoming" || dir === "either";
  const linkWhere = t.where.length ? "AND " + t.where.map(f => filterAgainstLink(f, p)).join(" AND ") : "";
  // Recursive walk: starting set = seed, follow up to depth hops via this link type.
  return `hop_${idx}(id, depth) AS (
    SELECT id, 0 FROM seed
    UNION
    SELECT CASE
      ${matchFrom ? `WHEN l.from_id = h.id THEN l.to_id` : ""}
      ${matchTo ? `WHEN l.to_id = h.id THEN l.from_id` : ""}
      ELSE NULL
    END AS id, h.depth + 1
    FROM hop_${idx} h
    JOIN links l ON (${matchFrom ? "l.from_id = h.id" : "FALSE"} OR ${matchTo ? "l.to_id = h.id" : "FALSE"})
    WHERE l.type = ${linkType} AND h.depth < ${p(t.depth)} ${linkWhere}
  )`;
};

const filterAgainstLink = (f: Filter, p: (v: unknown) => string): string => {
  if (f.kind !== "property") return "TRUE";
  const path = `l.properties->>${p(f.field)}`;
  if (f.op === "eq") return `${path} = ${p(String(f.value))}`;
  if (f.op === "contains") return `${path} ILIKE ${p(`%${f.value}%`)}`;
  return "TRUE";
};

const escapeIdent = (s: string): string => s.replace(/[^a-zA-Z0-9_]/g, "");
const collapseWs = (s: string): string => s.replace(/\s+/g, " ").trim();
