/**
 * Watchlist monitor entry point. Run on a schedule (GitHub Actions cron) to
 * re-sweep every watched person and record findings for new information.
 *
 *   DATABASE_URL=... pnpm --filter @scopium/web monitor
 */
import "dotenv/config";
import { runMonitor } from "./watchlist";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

console.log("Scopium monitor: re-sweeping watched people…");
const report = await runMonitor();
console.log(`Done. Watched: ${report.watched}, swept: ${report.swept}, new findings: ${report.newFindings}`);
for (const w of report.perWatch) {
  if (w.newFindings > 0) console.log(`  • ${w.name}: ${w.newFindings} new`);
}
process.exit(0);
