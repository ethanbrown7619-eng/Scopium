# Scopium — Handover

> **Repo:** https://github.com/ethanbrown7619-eng/Scopium
> **Branch:** `claude/build-scopium-platform-ZBcpM`
> **Status:** MVP + person-search built. The product goal is now: **type a
> person's name → sweep reputable public NZ sources → assemble a
> provenance-backed profile of who they are.** See `SOURCES.md` for the full
> source catalogue and `§Person-search` below for the architecture.

If you're picking this up: read this whole document first, then **start with §6 "Immediate next steps"**.

## Person-search architecture (the current product)

- **Source catalogue:** `SOURCES.md` — every reputable public NZ person source
  in six tiers, with access method, name-searchability, and Privacy-Act flags.
- **Two-phase connectors:** every fetch lands immutably in `raw_captures`
  (schema.ts) before parsing, via `SyncContext.emitRaw`. Fix a parser, re-run
  over stored captures — no re-crawl.
- **Live person connectors:** `CharitiesConnector` (open OData, no key — the
  flagship), `CompaniesOfficePublicConnector` (public register, name-driven),
  `GazetteConnector` (Events), `LicenceRegisterConnector` (config-driven, one
  class for all ~20 Tier-B licence registers; LBP/REA/FSPR descriptors shipped).
- **Privacy (privacy.ts):** `sanitiseAddress()` reduces individuals' addresses
  to a coarse NZ locality (never street/number); `displayDob()` coarsens to a
  year. Applied at materialisation in every person connector. This is the
  Privacy-Act-2020 posture — do not weaken it.
- **Entity resolution:** `resolve.ts` (ontology, pure) scores person-record
  pairs — auto-merge only on exact-name+DOB or exact-name+locality+shared-
  entity; else a candidate. `apps/web/src/db/resolve.ts` runs it, writing
  auditable, reversible `SameAs` links. `person-profile.ts` assembles a
  resolved cluster + everything it connects to + contributing sources.
- **API:** `/api/people/search` (fuzzy), `/api/people/[id]` (profile),
  `/api/people/resolve`, `/api/people/sweep` (live name-driven sweep).
- **UI:** `/person` — "Who is…" search + sweep + a PersonProfile dossier.

---

## 1. What Scopium is

An ontology-driven data integration and analysis platform for NZ public-sector
and business data — Foundry-inspired, opinionated for Aotearoa. An analyst
ingests NZ data sources, sees typed entities (people, companies, places,
events) as a connected graph, explores them on a graph/map/timeline/table, and
asks natural-language questions that resolve against the underlying structured
data with full provenance.

- **Wordmark:** lowercase `scopium`
- **Tagline:** *See the whole picture.*
- **Palette:** navy `#0B1220`, cyan accent `#3DD9D6`, amber alert `#F5A623`, neutral greys
- **Logo:** aperture / concentric-ring SVG at `apps/web/public/logo.svg`

## 2. Tech stack

- **Monorepo:** pnpm workspaces (Node 20+, pnpm 9.12.0).
- **Web:** Next.js 15 (App Router) + React 19 + TypeScript + Tailwind.
- **DB:** PostgreSQL on Supabase (Sydney/Tokyo). `pgvector` + `pg_trgm`. Apache AGE optional — link traversal compiles to recursive CTEs.
- **ORM:** Drizzle.
- **Workspace UI:** MapLibre GL JS (basemap), Cytoscape.js (graph), Recharts (timeline), shadcn-style handwritten components.
- **AI Ask palette:** pluggable provider (Anthropic Claude Sonnet 4.6 / OpenAI GPT-4o / Google Gemini 2.5 Pro) — hand-rolled fetch clients, no SDKs.
- **Deploy:** Cloudflare Workers via `@opennextjs/cloudflare`. Bundle size ~1.04 MB gzipped (fits free 3 MB cap).
- **Tests:** Vitest (10 unit tests, all passing) + Playwright (scaffolded for workspace happy path, not running in CI yet).

## 3. Repository layout

```
.
├── apps/web                          Next.js 15 workspace
│   ├── src/app                       Routes
│   │   ├── page.tsx                  The workspace (grid layout)
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── api/
│   │       ├── query/route.ts        POST AST → SQL → rows
│   │       ├── ask/route.ts          SSE stream from configured provider
│   │       ├── objects/[id]/route.ts Detail panel data
│   │       └── connectors/csv/route.ts  CSV upload ingest
│   ├── src/ai/
│   │   ├── ask.ts                    Dispatcher; renders ontology into system prompt
│   │   └── providers/
│   │       ├── types.ts              AIProvider contract + SSE parser
│   │       ├── anthropic.ts
│   │       ├── openai.ts
│   │       ├── google.ts
│   │       └── index.ts              resolveProvider() reads AI_PROVIDER env
│   ├── src/components/               GraphView, TableView, MapView, TimelineView,
│   │                                 AskPalette, DetailPanel, Wordmark
│   ├── src/db/
│   │   ├── schema.ts                 objects, links, investigations, ask_log + pgvector
│   │   ├── client.ts                 Lazy Drizzle init via Proxy (Hyperdrive-aware)
│   │   ├── repository.ts             persistMaterialised, runCompiledQuery, linksFor
│   │   └── seed.ts                   Multi-source orchestrator
│   ├── src/lib/                      cn (clsx+tailwind-merge), url-state
│   ├── public/logo.svg               Aperture mark
│   ├── wrangler.toml                 Cloudflare config (HYPERDRIVE binding commented)
│   ├── open-next.config.ts
│   └── drizzle.config.ts
│
├── packages/ontology
│   └── src/
│       ├── classification.ts         Public | Restricted | Confidential enum
│       ├── provenance.ts             ProvenanceRecord shape
│       ├── types.ts                  Person, Organisation, Location, Asset, Event,
│       │                             Transaction, Document, NZCompany, Iwi, Hapū,
│       │                             RegionalCouncil, TerritorialAuthority, Suburb,
│       │                             LINZParcel + link types (DirectorOf, ShareholderOf,
│       │                             RegisteredAt, LocatedIn, PartyTo, Owns, MentionedIn)
│       ├── schema.ts                 ontologySchemaForPrompt() for the AI system prompt
│       └── index.ts
│
├── packages/query
│   └── src/
│       ├── ast.ts                    QueryAst Zod schema (filters, traversal, agg)
│       ├── compile.ts                AST → parameterised SQL (recursive CTEs)
│       └── index.ts
│
├── packages/connectors
│   └── src/
│       ├── base.ts                   Connector base + emit() contract
│       ├── opencorporates.ts         ✅ Real NZ data, anonymous tier works
│       ├── synthetic-companies.ts    ✅ Procedural demo data, no key needed
│       ├── csv-upload.ts             ✅ CSV → ontology via column mapping
│       ├── nz-companies-register.ts  ⚠ OAuth-protected, unlikely to be used
│       ├── mbie-base.ts              ⚠ URL PATTERN IS WRONG — see §4 bug
│       ├── nzbn.ts                   ⚠ Depends on broken mbie-base
│       ├── insolvency.ts             ⚠ Depends on broken mbie-base
│       ├── iponz.ts                  ⚠ Depends on broken mbie-base
│       ├── lbp.ts                    ⚠ Depends on broken mbie-base
│       ├── statsnz.ts                ⚪ Scaffolded, untested
│       ├── linz.ts                   ⚪ Scaffolded, untested
│       ├── ckan.ts                   ⚪ Scaffolded, untested
│       └── index.ts
│
├── .github/workflows/
│   ├── deploy.yml                    Build + deploy + attach secrets (split steps)
│   ├── db-migrate.yml                pnpm db:push (Drizzle)
│   └── db-seed.yml                   pnpm db:seed with source dropdown
│
├── DEPLOY.md                         Browser-only walkthrough
├── README.md
└── HANDOVER.md                       this file
```

## 4. KNOWN BUG — FIXED (kept for context)

**RESOLVED.** The MBIE connectors now build `/gateway/{apiPath}` (or
`/sandbox/` when `environment: 'sandbox'`) and each `apiPath` was corrected to
the gateway service form (e.g. `nzbn/v5`, `insolvency/v5`, `iponz/v5`,
`lbp/v2`). **You must still verify each exact service path and response shape**
against the api-portal.business.govt.nz operation docs before production — the
paths are best-effort. Original description below.

The MBIE connectors (NZBN, Insolvency, IPONZ, LBP) pointed at the **wrong base
URL pattern**. The MBIE portal docs (https://api-portal.business.govt.nz)
specify:

```
production:  https://api.business.govt.nz/gateway/<service-area>/<service>/<version>/<endpoint>
sandbox:     https://api.business.govt.nz/sandbox/<service-area>/<service>/<version>/<endpoint>
```

For example, Disqualified Directors:

```
https://api.business.govt.nz/gateway/companies-office/companies-register/disqualified-directors/v3/search
```

My `MbieConnector` base (`packages/connectors/src/mbie-base.ts`) builds URLs as
`https://api.business.govt.nz/services/<apiPath>` which doesn't exist. **All
four MBIE connectors will 404 until this is fixed.**

The fix:

1. In `mbie-base.ts`, change `baseUrl()` to read `https://api.business.govt.nz/gateway/${this.apiPath}` (or `/sandbox/...` based on an `environment` option).
2. In each subclass, change `apiPath` to the real service-area path:
   - `nzbn.ts`: `companies-office/nzbn/v5` (verify in portal — may differ).
   - `insolvency.ts`: `companies-office/insolvency/v5` (verify).
   - `iponz.ts`: `iponz/iponz/v5` (verify).
   - `lbp.ts`: `mbie/lbp/v2` (verify).
3. Add an `environment: 'production' | 'sandbox'` option to `MbieOptions`, defaulting to `production`.
4. Verify each connector's response-shape assumptions against the actual docs at https://api-portal.business.govt.nz — my parsing is best-effort and may need tweaks per endpoint.

There's a test scaffold for `NZCompaniesRegisterConnector` in
`packages/connectors/src/__tests__/`. Add equivalent mocked-fetch tests for
each MBIE connector after fixing.

## 5. What's deployed where

- **Source:** all on branch `claude/build-scopium-platform-ZBcpM`. Push the branch — workflows auto-run.
- **Cloudflare Worker:** **not yet successfully deployed.** Last attempt hit Cloudflare API error 7003 — wrong `CLOUDFLARE_ACCOUNT_ID` secret. User needs to verify the account ID (32-char hex from dashboard right sidebar, NOT email or zone ID) and that Workers is enabled on the account.
- **Supabase:** schema pushed successfully (db-migrate workflow has run green). Seed has only been run successfully against the `synthetic` source so far. `opencorporates` source has not been run yet but should work without any signup.
- **AI key:** `AI_API_KEY` secret is set. Provider defaults to `anthropic` via `wrangler.toml [vars]`.

## 6. Immediate next steps (in order)

1. **Verify deploy works at all.**
   - User needs to fix `CLOUDFLARE_ACCOUNT_ID` GitHub secret (32-char hex from Cloudflare dashboard, not email).
   - Re-run **Deploy to Cloudflare Workers** Actions workflow.
   - On success, the `https://scopium.<account>.workers.dev` URL prints in the deploy step. Site should render even with no data.

2. **Seed some real data.**
   - Actions → **Seed Companies** → `source=opencorporates`, `limit=200`. No new keys needed. Should land 200 real NZ companies + officers in Supabase. **This is the "first real demo" milestone.**

3. **Fix the MBIE URL bug** (§4 above).
   - One commit. Re-run tests (`pnpm test` should still show 10 passing).

4. **Add Companies + Disqualified Directors connectors** — the two highest-value MBIE APIs we haven't built yet. User has been told to subscribe to these on https://api-portal.business.govt.nz/.
   - Companies v2 — directors and shareholders → DirectorOf / ShareholderOf links.
   - Companies Disqualified Director Search v3 — *name-search* API (no list-all), so the connector needs to iterate over a list of common surname prefixes (e.g. all two-letter combinations) to enumerate the register.

5. **Wire those secrets:**
   ```
   COMPANIES_API_KEY                 → companies v2 connector
   DISQUALIFIED_DIRECTORS_API_KEY    → disqualified directors connector
   ```
   Update `.github/workflows/db-seed.yml` to thread them through.

6. **Run `source=all` seed.** Once all five MBIE keys (NZBN, Companies, Disqualified Directors, Insolvency, IPONZ) are set, the seed populates the full ontology graph: companies, directors, shareholders, IP assets, insolvency events.

## 7. Future work (lower priority)

In rough priority order:

- **CSV upload wizard UI.** `/api/connectors/csv` works; build the column-mapping wizard frontend in `apps/web/src/components/CsvUploadWizard.tsx` and a page at `/upload`.
- **Persist investigations.** The `investigations` table exists; `apps/web/src/lib/url-state.ts` only encodes state into the URL. Add a "Save" button that POSTs to a new `/api/investigations` route.
- **Semantic search.** `objects.embedding` pgvector column exists but no embedder is wired. Add an embedder for `Document` objects (use the configured AI provider's embeddings endpoint) and a `kind: "semantic"` filter in the query AST.
- **Additional MBIE connectors** (each ~30 min after the URL bug is fixed):
  - Companies Entity Role Search v3 — directors-by-person
  - MVTR, Disclose Public, Market Rent — niche but free
  - SKIP: PPSR (per-search fees), Tenancy Bond (restricted), Disclose Compliance (restricted), CERT NZ Phishing (org-only)
- **LINZ + StatsNZ connectors.** Scaffolded but untested. LINZ gives admin boundaries (Location objects with WKT polygons); StatsNZ gives demographic data attached to Locations.
- **Multi-user / auth.** No auth model yet. Easiest: Supabase Auth with email magic-link.
- **Playwright in CI.** Spec exists at `apps/web/e2e/workspace.spec.ts`. Add a workflow that runs `pnpm test:e2e` against a deployed preview.
- **Custom domain.** Cloudflare → Workers & Pages → scopium → Custom Domains.

## 8. Things that were dropped from the original spec

These were in the original brief but the user asked me to remove them:

- **Māori data sovereignty / kaitiaki review gate.** No `SovereigntyTag`, no `requiresKaitiakiReview`, no `docs/data-sovereignty.md`. The classification system (`Public | Restricted | Confidential`) remains.
- **Macron preservation as an explicit end-to-end requirement.** The ontology has `teReoName` fields (plain `z.string()`) but no special collation rules, no special UI handling. UTF-8 strings work because Postgres + JSONB + React all handle them natively.

Don't add them back unless the user asks.

## 9. Local dev (optional — user does everything via the GitHub Actions UI)

```bash
# Install
pnpm install

# Push schema to Supabase
DATABASE_URL="postgres://..." pnpm db:push

# Seed
DATABASE_URL="..." SEED_SOURCE=opencorporates pnpm db:seed -- --limit=200

# Run web app
DATABASE_URL="..." AI_API_KEY="..." AI_PROVIDER="anthropic" pnpm dev

# Tests
pnpm test           # 10 unit tests
pnpm typecheck      # all packages
```

The user's primary mode is the GitHub Actions UI — they don't run anything
locally. Keep `DEPLOY.md` accurate when you change the deploy workflow.

## 10. Environment variables / secrets

GitHub repo secrets currently set (verify in repo Settings):

| Name | Used by | Status |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | deploy workflow | set; "Edit Workers" template |
| `CLOUDFLARE_ACCOUNT_ID` | deploy workflow | **may be wrong — caused error 7003** |
| `DATABASE_URL` | all workflows + Worker | set; Supabase session pooler URL |
| `AI_API_KEY` | deploy workflow → Worker | set |
| `NZBN_API_KEY` | seed workflow | not yet set |
| `INSOLVENCY_API_KEY` | seed workflow | not yet set |
| `IPONZ_API_KEY` | seed workflow | not yet set |
| `LBP_API_KEY` | seed workflow | not yet set |
| `COMPANIES_API_KEY` | (future) | not yet set |
| `DISQUALIFIED_DIRECTORS_API_KEY` | (future) | not yet set |
| `OPENCORPORATES_API_TOKEN` | seed workflow | optional; anonymous tier works without |

GitHub repo Variables:

| Name | Used by | Status |
|---|---|---|
| `AI_PROVIDER` | deploy workflow | optional; defaults to `anthropic` in `wrangler.toml` |
| `AI_MODEL` | deploy workflow | optional; per-provider default in `providers/index.ts` |

## 11. Branding reference

| | |
|---|---|
| Product | scopium |
| Tagline | See the whole picture. |
| Bg | `#0B1220` navy |
| Accent | `#3DD9D6` signal cyan |
| Alert | `#F5A623` amber |
| Wordmark | Inter, lowercase, slight letter-spacing |
| Mark | aperture / concentric rings, see `apps/web/public/logo.svg` |

## 12. How to verify everything still works after changes

```bash
pnpm install
pnpm test                    # expect: 10 passed
pnpm --filter @scopium/web typecheck
pnpm --filter @scopium/web cf:build
cd apps/web && pnpm exec wrangler deploy --dry-run --outdir=/tmp/cf-out
# Bundle size should be ~1 MB gzipped — well under the 3 MB free-plan cap.
```

Anything else, ask the user — they're not technical but they know what state
their dashboards are in.
