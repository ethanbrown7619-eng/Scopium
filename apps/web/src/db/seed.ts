/**
 * Seed Scopium with NZ companies + their directors.
 *
 *   SEED_SOURCE=opencorporates pnpm db:seed -- --limit=200    # REAL data
 *   SEED_SOURCE=synthetic      pnpm db:seed -- --limit=200    # fabricated
 *   SEED_SOURCE=api            pnpm db:seed -- --limit=200    # OAuth Companies Register
 *
 * Default is `opencorporates` — real NZ companies via the OpenCorporates
 * public API. No key needed for ~500 calls/month; set OPENCORPORATES_API_TOKEN
 * for higher quotas (free signup at https://opencorporates.com/users/sign_up).
 */
import "dotenv/config";
import {
  NZCompaniesRegisterConnector,
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
const source = (process.env.SEED_SOURCE || "opencorporates").toLowerCase();
const withOfficers = process.env.SEED_WITH_OFFICERS !== "false";

const connector: Connector = source === "opencorporates"
  ? new OpenCorporatesConnector({
      apiToken: process.env.OPENCORPORATES_API_TOKEN || undefined,
      limit,
      withOfficers,
    })
  : source === "api"
    ? new NZCompaniesRegisterConnector({
        baseUrl: process.env.NZ_COMPANIES_REGISTER_BASE || "https://api.companiesoffice.govt.nz/companies/v1",
        token: process.env.NZ_COMPANIES_REGISTER_TOKEN || undefined,
        search: "*",
        limit,
      })
    : new SyntheticCompaniesConnector({ count: limit });

console.log(`Scopium seed: source=${source} limit=${limit}${source === "opencorporates" ? ` withOfficers=${withOfficers}` : ""}`);

const startedAt = Date.now();
let totalObjects = 0;
let totalLinks = 0;

const result = await connector.sync({
  fetchedBy: "seed-script",
  emit: async batch => {
    await persistMaterialised(batch);
    totalObjects += batch.objects.length;
    totalLinks += batch.links.length;
    if (totalObjects > 0 && totalObjects % 200 === 0) {
      console.log(`...persisted ${totalObjects} objects, ${totalLinks} links`);
    }
  },
});

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`Done. Objects: ${result.objectsEmitted}, links: ${result.linksEmitted}, in ${elapsed}s`);
process.exit(0);
