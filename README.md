# Scopium

**See the whole picture.**

## Person search — "Who is…?"

Scopium's headline capability: type a **person's name** and it sweeps reputable
public NZ sources to assemble a provenance-backed picture of who they are —
companies they direct, charities they run, professional licences they hold,
insolvency/court events, sanctions, and property. Every fact links back to its
source register. See [`SOURCES.md`](./SOURCES.md) for the full catalogue and
[`HANDOVER.md`](./HANDOVER.md) for the architecture.

- **UI:** `/person` — **Search** (already-ingested data) vs **Sweep** (run live
  connectors for a name), then a profile dossier grouping companies /
  charities / licences / events, each with a source link and a cluster-
  confidence badge. `/person/merges` reviews ambiguous identity matches.
- **Entity resolution:** NZ has no public person id, so records are joined by
  evidence (DOB, locality, shared entities). Auto-merge only on strong
  evidence; ambiguous pairs become analyst-reviewable `SameAs` candidates.
- **Privacy (Privacy Act 2020):** individuals' addresses are reduced to a
  coarse locality at ingest (never street/number); name-suppressed court
  matters are filtered; every field is provenance-stamped. See `privacy.ts`.



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

## Deploying without local setup

The fastest path is **GitHub Actions → Cloudflare + Supabase**, with no
terminal involved. See [`DEPLOY.md`](./DEPLOY.md) for the click-by-click
walkthrough.

## Deploying to Cloudflare Workers + Supabase (from your laptop)

Scopium ships as a single Cloudflare Worker via OpenNext. Postgres lives on
Supabase; Cloudflare Hyperdrive proxies the connection so the Worker doesn't
have to open raw TCP. Real Worker bundle size is **~1 MB gzipped**, which
fits the free Workers plan (3 MB cap) with room to spare.

### 1. Provision Supabase

1. Create a project at https://supabase.com (Sydney region for NZ latency).
2. In the SQL editor, enable the extensions Scopium uses:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   ```
3. Project Settings → Database → Connection string → **Session pooler**.
   Copy the URL (looks like `postgresql://postgres.xxx:PWD@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres`).

### 2. Push the schema and seed (from your laptop)

```bash
DATABASE_URL="postgresql://postgres.xxx:...:5432/postgres" pnpm db:push
DATABASE_URL="postgresql://postgres.xxx:...:5432/postgres" pnpm db:seed -- --limit=200
```

The seed runs as a Node process locally — Workers CPU limits don't apply.

### 3. Create Hyperdrive

```bash
cd apps/web
pnpm exec wrangler hyperdrive create scopium-db \
  --connection-string="postgresql://postgres.xxx:...:5432/postgres"
```

It prints an `id`. Paste it into `apps/web/wrangler.toml`:

```toml
[[hyperdrive]]
binding = "HYPERDRIVE"
id = "PASTE_HERE"
```

### 4. Set secrets

```bash
pnpm exec wrangler secret put ANTHROPIC_API_KEY
# paste your sk-ant-...
```

If you skip Hyperdrive, also `wrangler secret put DATABASE_URL`.

### 5. Deploy

```bash
pnpm cf:deploy
```

That runs `opennextjs-cloudflare build` and `wrangler deploy`. First deploy
also provisions a `*.workers.dev` URL.

For a local preview that mirrors the Worker runtime:

```bash
pnpm cf:preview
```

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
