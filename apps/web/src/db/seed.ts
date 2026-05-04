/**
 * Seed Scopium with NZ public-sector data from one or more sources.
 *
 *   SEED_SOURCE=opencorporates pnpm db:seed -- --limit=200
 *   SEED_SOURCE=nzbn,iponz,insolvency,lbp pnpm db:seed -- --limit=500
 *   SEED_SOURCE=all pnpm db:seed -- --limit=200       # every source with a key set
 *
 * Each source pulls up to `--limit` records. Sources that need an API key
 * are skipped (with a warning) when their key is missing.
 *
 * Sources & required env keys:
 *   opencorporates    OPENCORPORATES_API_TOKEN  (optional; works at low volume w/o)
 *   nzbn              NZBN_API_KEY              (subscribe to NZBN on api.business.govt.nz)
 *   insolvency        INSOLVENCY_API_KEY        (subscribe to Insolvency Register)
 *   iponz             IPONZ_API_KEY             (subscribe to IPONZ)
 *   lbp               LBP_API_KEY               (subscribe to Licensed Building Practitioners)
 *   api               NZ_COMPANIES_REGISTER_TOKEN (legacy OAuth)
 *   synthetic         (no key)                  procedurally-generated demo data
 */
import "dotenv/config";
import {
  NZCompaniesRegisterConnector,
  NzbnConnector,
  InsolvencyConnector,
  IponzConnector,
  LicensedBuildingPractitionersConnector,
  OpenCorporatesConnector,
  SyntheticCompaniesConnector,
  type Connector,
} from "@scopium/connectors";
import { persistMaterialised } from "./repository";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. In CI, set it as a repo secret. Locally, put it in .env.");
  process.exit(1);
}

const limitArg = process.argv.find(a => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 5000;
const requested = (process.env.SEED_SOURCE || "opencorporates").toLowerCase();
const sources = requested === "all"
  ? ["opencorporates", "nzbn", "insolvency", "iponz", "lbp"]
  : requested.split(",").map(s => s.trim()).filter(Boolean);

const connectors: Connector[] = [];
for (const source of sources) {
  switch (source) {
    case "opencorporates":
      connectors.push(new OpenCorporatesConnector({
        apiToken: process.env.OPENCORPORATES_API_TOKEN || undefined,
        limit,
        withOfficers: process.env.SEED_WITH_OFFICERS !== "false",
      }));
      break;
    case "nzbn":
      if (!process.env.NZBN_API_KEY) { console.warn("⚠ Skipping nzbn — NZBN_API_KEY not set"); break; }
      connectors.push(new NzbnConnector({ apiKey: process.env.NZBN_API_KEY, limit }));
      break;
    case "insolvency":
      if (!process.env.INSOLVENCY_API_KEY) { console.warn("⚠ Skipping insolvency — INSOLVENCY_API_KEY not set"); break; }
      connectors.push(new InsolvencyConnector({ apiKey: process.env.INSOLVENCY_API_KEY, limit }));
      break;
    case "iponz":
      if (!process.env.IPONZ_API_KEY) { console.warn("⚠ Skipping iponz — IPONZ_API_KEY not set"); break; }
      connectors.push(new IponzConnector({ apiKey: process.env.IPONZ_API_KEY, limit }));
      break;
    case "lbp":
      if (!process.env.LBP_API_KEY) { console.warn("⚠ Skipping lbp — LBP_API_KEY not set"); break; }
      connectors.push(new LicensedBuildingPractitionersConnector({ apiKey: process.env.LBP_API_KEY, limit }));
      break;
    case "api":
      connectors.push(new NZCompaniesRegisterConnector({
        baseUrl: process.env.NZ_COMPANIES_REGISTER_BASE || "https://api.companiesoffice.govt.nz/companies/v1",
        token: process.env.NZ_COMPANIES_REGISTER_TOKEN || undefined,
        search: "*",
        limit,
      }));
      break;
    case "synthetic":
      connectors.push(new SyntheticCompaniesConnector({ count: limit }));
      break;
    default:
      console.warn(`⚠ Unknown source "${source}" — skipping`);
  }
}

if (connectors.length === 0) {
  console.error("No usable sources. Set at least one API key, or use SEED_SOURCE=synthetic.");
  process.exit(1);
}

console.log(`Scopium seed: limit=${limit} sources=[${connectors.map(c => c.id).join(", ")}]`);

const startedAt = Date.now();
let totalObjects = 0;
let totalLinks = 0;

for (const connector of connectors) {
  const before = totalObjects;
  console.log(`→ ${connector.id} (${connector.displayName})`);
  try {
    const res = await connector.sync({
      fetchedBy: "seed-script",
      emit: async batch => {
        await persistMaterialised(batch);
        totalObjects += batch.objects.length;
        totalLinks += batch.links.length;
      },
    });
    console.log(`  ✓ ${res.objectsEmitted} objects, ${res.linksEmitted} links in ${(res.durationMs / 1000).toFixed(1)}s`);
  } catch (err) {
    console.error(`  ✗ ${connector.id} failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error(`  (continuing with other sources)`);
  }
}

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`Done. Total: ${totalObjects} objects, ${totalLinks} links in ${elapsed}s`);
process.exit(0);
