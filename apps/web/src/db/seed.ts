/**
 * Seed Scopium with NZ companies + their directors.
 *
 *   pnpm db:seed -- --limit=200            # synthetic data (default)
 *   SEED_SOURCE=api pnpm db:seed -- --limit=200    # real Companies Register
 *
 * The real Companies Register API requires registration with Companies Office
 * for an OAuth token. Without `NZ_COMPANIES_REGISTER_TOKEN`, stick to the
 * synthetic source — it produces the same ontology shape so the workspace,
 * query layer, and Ask palette work identically.
 */
import "dotenv/config";
import {
  NZCompaniesRegisterConnector,
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
const source = (process.env.SEED_SOURCE || "synthetic").toLowerCase();

const connector: Connector = source === "api"
  ? new NZCompaniesRegisterConnector({
      // `||` not `??` so an empty repo-var doesn't override the default.
      baseUrl: process.env.NZ_COMPANIES_REGISTER_BASE || "https://api.companiesoffice.govt.nz/companies/v1",
      token: process.env.NZ_COMPANIES_REGISTER_TOKEN || undefined,
      search: "*",
      limit,
    })
  : new SyntheticCompaniesConnector({ count: limit });

console.log(`Scopium seed: source=${source} limit=${limit}`);

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
