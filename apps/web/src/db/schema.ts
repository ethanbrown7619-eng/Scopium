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

/**
 * People a user is monitoring. Each carries the search name plus optional
 * "known facts" (DOB, locality, occupation) used to disambiguate, and a
 * fingerprint of the last assembled profile so the monitor can detect change.
 */
export const watchlist = pgTable(
  "watchlist",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    knownFacts: jsonb("known_facts").notNull().default({}).$type<Record<string, unknown>>(),
    /** Person object id anchored to, once resolved. */
    anchorId: text("anchor_id"),
    /** Stable hash of the last profile's contributing source records. */
    fingerprint: text("fingerprint"),
    /** Source keys already seen, so the monitor reports only true deltas. */
    knownKeys: jsonb("known_keys").notNull().default([]).$type<string[]>(),
    notifyEmail: text("notify_email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSweptAt: timestamp("last_swept_at", { withTimezone: true }),
  },
  t => ({ nameIdx: index("watchlist_name_idx").on(t.name) }),
);

/** New information surfaced for a watched person since the last sweep. */
export const watchFindings = pgTable(
  "watch_findings",
  {
    id: text("id").primaryKey(),
    watchId: text("watch_id").notNull().references(() => watchlist.id, { onDelete: "cascade" }),
    summary: text("summary").notNull(),
    /** The new object ids that triggered this finding. */
    objectIds: jsonb("object_ids").notNull().$type<string[]>(),
    source: text("source"),
    seen: text("seen").notNull().default("false"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  t => ({ watchIdx: index("watch_findings_watch_idx").on(t.watchId) }),
);

/**
 * Two-phase landing zone. Every connector fetch is captured here immutably
 * before parsing, so parsers can be fixed and re-run without re-fetching and
 * every materialised fact is traceable to the exact bytes it came from.
 */
export const rawCaptures = pgTable(
  "raw_captures",
  {
    id: text("id").primaryKey(),
    connectorId: text("connector_id").notNull(),
    sourceId: text("source_id").notNull(),
    sourceUrl: text("source_url").notNull(),
    contentHash: text("content_hash").notNull(),
    httpStatus: text("http_status").notNull(),
    parserVersion: text("parser_version").notNull(),
    payload: jsonb("payload").notNull().$type<unknown>(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  t => ({
    connectorIdx: index("raw_captures_connector_idx").on(t.connectorId),
    sourceIdx: index("raw_captures_source_idx").on(t.sourceId),
  }),
);

/** Raw extension bootstrap — applied via db:push by hand (drizzle-kit can't do CREATE EXTENSION). */
export const bootstrap = sql`
  CREATE EXTENSION IF NOT EXISTS vector;
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  -- Trigram index on person fullName for fast fuzzy name search.
  CREATE INDEX IF NOT EXISTS objects_fullname_trgm
    ON objects USING gin ((properties->>'fullName') gin_trgm_ops);
  -- AGE is optional; the query layer compiles to plain SQL.
  -- CREATE EXTENSION IF NOT EXISTS age;
`;
