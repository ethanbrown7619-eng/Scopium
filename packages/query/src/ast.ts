import { z } from "zod";

/**
 * Typed query AST. The Anthropic-driven Ask layer emits this; we never let the
 * model emit raw SQL. The executor compiles AST → parameterised SQL.
 */

export const Comparator = z.enum(["eq", "neq", "contains", "startsWith", "in", "lt", "lte", "gt", "gte"]);
export type Comparator = z.infer<typeof Comparator>;

export const PropertyFilter = z.object({
  kind: z.literal("property"),
  field: z.string(),
  op: Comparator,
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]),
});

export const TemporalFilter = z.object({
  kind: z.literal("temporal"),
  field: z.string(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const GeoBboxFilter = z.object({
  kind: z.literal("geoBbox"),
  field: z.string().default("point"),
  /** [minLon, minLat, maxLon, maxLat] in WGS84. */
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
});

export const Filter = z.discriminatedUnion("kind", [PropertyFilter, TemporalFilter, GeoBboxFilter]);
export type Filter = z.infer<typeof Filter>;

export const Aggregation = z.object({
  fn: z.enum(["count", "sum", "avg", "min", "max"]),
  field: z.string().optional(),
  groupBy: z.array(z.string()).default([]),
});

export const LinkTraversal = z.object({
  via: z.string().describe("Link type, e.g. DirectorOf"),
  direction: z.enum(["outgoing", "incoming", "either"]).default("either"),
  /** Maximum hops; 1 = direct neighbour, n = up to n hops. Hard cap 4. */
  depth: z.number().int().min(1).max(4).default(1),
  /** Optional filter on the link itself. */
  where: z.array(Filter).default([]),
});
export type LinkTraversal = z.infer<typeof LinkTraversal>;

export const QueryAst = z.object({
  /** Object type to start from (e.g. NZCompany). */
  from: z.string(),
  where: z.array(Filter).default([]),
  traverse: z.array(LinkTraversal).default([]),
  aggregate: Aggregation.optional(),
  limit: z.number().int().positive().max(1000).default(100),
  /** Free-form rationale from the model — surfaced in the UI for trust. */
  rationale: z.string().optional(),
});
export type QueryAst = z.infer<typeof QueryAst>;
