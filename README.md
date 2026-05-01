# Scopium

**See the whole picture.**

Scopium is an ontology-driven data integration and analysis platform for
Aotearoa New Zealand public-sector and business data. Think Foundry, but
opinionated for NZ: ingest the Companies Register, StatsNZ, LINZ, and CKAN
catalogues, see the connected entities as a typed ontology, and explore them
on a graph, map, timeline, or table — driven by the same selection set so
you can pivot views without losing context. A Cmd-K "Ask" palette lets an
analyst ask natural-language questions; Claude returns a typed query plan
that the platform validates, executes, and answers from with full
provenance.

## Architecture

```
apps/web                # Next.js 15 (App Router) workspace
packages/ontology       # Object/link types, Zod validation, classification, provenance
packages/query          # Typed query AST + SQL compiler
packages/connectors     # Companies Register, CSV upload, StatsNZ, LINZ, CKAN
```

- **PostgreSQL** with `pgvector` (semantic search lane on `Document.embedding`).
  Apache AGE is supported but optional — link traversal compiles to recursive
  CTEs against a plain `links` table, so the platform runs on vanilla Postgres.
- **Drizzle ORM** for typed access; schema lives in `apps/web/src/db/schema.ts`.
- **MapLibre** (basemap), **Cytoscape** (graph), **Recharts** (timeline).
- **Anthropic Messages API** (`claude-sonnet-4-6` by default) wired with a
  `query_plan` tool — the model never emits free-form claims about data, only
  typed AST that the executor runs.

## Running locally

```bash
# 1. Postgres (with pgvector)
docker run -d --name scopium-pg -p 5432:5432 \
  -e POSTGRES_USER=scopium -e POSTGRES_PASSWORD=scopium -e POSTGRES_DB=scopium \
  pgvector/pgvector:pg16

# 2. Env
cp .env.example .env
# fill in ANTHROPIC_API_KEY

# 3. Install + push schema
pnpm install
pnpm db:push

# 4. Seed real NZ companies (smaller --limit for a quick demo)
pnpm db:seed -- --limit=200

# 5. Run
pnpm dev
```

Open http://localhost:3000.

## Adding a new connector

1. Create `packages/connectors/src/your-source.ts` exporting a class that
   extends `Connector`.
2. Implement `sync(ctx)` — call `ctx.emit({ objects, links })` in batches.
   Each emitted object needs an `id`, `type`, `properties`, and a
   `provenance` record (use the `this.provenance(...)` helper).
3. Re-export from `packages/connectors/src/index.ts`.
4. Wire a route under `apps/web/src/app/api/connectors/<id>/route.ts` that
   pipes the connector's emissions through `persistMaterialised`.

See `nz-companies-register.ts` and `csv-upload.ts` for concrete examples.

## Adding a new object type

1. Add the schema in `packages/ontology/src/types.ts` using `objectType(...)`.
2. Add it to the `ScopiumObject` discriminated union and to `OBJECT_TYPES`.
3. (Optional) Add it to `ontologySchemaSummary()` so the model sees it.
4. Add a Drizzle migration if your type needs custom indexing on top of the
   shared `objects` table — the JSONB `properties` column already supports
   arbitrary fields, so most subtypes need no migration.

## URL-shareable investigations

Workspace state (active view, selection, last query AST) is encoded into
`?s=...` so any view is a permalink. Sharing a URL reproduces the analyst's
view exactly.

## Tests

- **Unit**: `pnpm test` runs Vitest across all packages.
- **E2E**: `pnpm test:e2e` runs Playwright happy-path tests for the workspace.

## Layout

```
.
├── apps/web                       Next.js 15 workspace
│   ├── src/app                    Routes (workspace + /api/*)
│   ├── src/components             Workspace components (Graph, Map, Table, Timeline, AskPalette, DetailPanel)
│   ├── src/db                     Drizzle schema, client, repository, seed
│   └── src/ai/ask.ts              Claude integration (tool-calling, streamed)
├── packages/ontology              Type system + Zod + provenance
├── packages/query                 AST + SQL compiler
├── packages/connectors            All data connectors
└── README.md
```
