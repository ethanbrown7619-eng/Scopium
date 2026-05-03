/**
 * Seed Scopium with ~5,000 real NZ companies plus their directors.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... DATABASE_URL=... pnpm db:seed
 *
 * If NZ_COMPANIES_REGISTER_BASE/TOKEN are unset, this will hit the public
 * endpoint, which will rate-limit. For demos, point the env at a local
 * cache or pass --limit to keep things small.
 */
import "dotenv/config";
import { NZCompaniesRegisterConnector } from "@scopium/connectors";
import { persistMaterialised } from "./repository";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. In CI, set it as a repo secret. Locally, put it in .env.");
  process.exit(1);
}

const limitArg = process.argv.find(a => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 5000;

const connector = new NZCompaniesRegisterConnector({
  baseUrl: process.env.NZ_COMPANIES_REGISTER_BASE ?? "https://api.companiesoffice.govt.nz/companies/v1",
  token: process.env.NZ_COMPANIES_REGISTER_TOKEN,
  search: "*",
  limit,
});

console.log(`Scopium seed: pulling up to ${limit} NZ companies...`);

const startedAt = Date.now();
let totalObjects = 0, totalLinks = 0;

const result = await connector.sync({
  fetchedBy: "seed-script",
  emit: async batch => {
    await persistMaterialised(batch);
    totalObjects += batch.objects.length;
    totalLinks += batch.links.length;
    if (totalObjects % 200 === 0) {
      console.log(`...persisted ${totalObjects} objects, ${totalLinks} links`);
    }
  },
});

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`Done. Objects: ${result.objectsEmitted}, links: ${result.linksEmitted}, in ${elapsed}s`);
process.exit(0);
