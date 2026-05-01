import { pgTable, text, timestamp, jsonb, index, primaryKey, customType } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** pgvector type — used for the Document embedding lane. */
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() { return "vector(1024)"; },
  toDriver(v) { return `[${v.join(",")}]`; },
});

export const objects = pgTable(
  "objects",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    classification: text("classification").notNull().default("Public"),
    properties: jsonb("properties").notNull().$type<Record<string, unknown>>(),
    provenance: jsonb("provenance").notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    embedding: vector("embedding"),
  },
  t => ({
    typeIdx: index("objects_type_idx").on(t.type),
    propsGin: index("objects_properties_gin").using("gin", t.properties),
    updatedIdx: index("objects_updated_at_idx").on(t.updatedAt),
  }),
);

export const links = pgTable(
  "links",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    fromId: text("from_id").notNull().references(() => objects.id, { onDelete: "cascade" }),
    toId: text("to_id").notNull().references(() => objects.id, { onDelete: "cascade" }),
    classification: text("classification").notNull().default("Public"),
    properties: jsonb("properties").notNull().$type<Record<string, unknown>>(),
    provenance: jsonb("provenance").notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  t => ({
    typeIdx: index("links_type_idx").on(t.type),
    fromIdx: index("links_from_idx").on(t.fromId),
    toIdx: index("links_to_idx").on(t.toId),
  }),
);

export const investigations = pgTable("investigations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** URL state encoded so an investigation is a permalink. */
  state: jsonb("state").notNull().$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const askLog = pgTable("ask_log", {
  id: text("id").primaryKey(),
  prompt: text("prompt").notNull(),
  response: jsonb("response").notNull().$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Raw extension bootstrap — applied via db:push by hand (drizzle-kit can't do CREATE EXTENSION). */
export const bootstrap = sql`
  CREATE EXTENSION IF NOT EXISTS vector;
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  -- AGE is optional; the query layer compiles to plain SQL.
  -- CREATE EXTENSION IF NOT EXISTS age;
`;
