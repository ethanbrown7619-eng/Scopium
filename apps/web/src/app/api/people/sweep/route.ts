import { NextResponse } from "next/server";
import {
  CompaniesOfficePublicConnector,
  CharitiesConnector,
  CourtDecisionsConnector,
  SanctionsConnector,
  DisqualifiedDirectorsConnector,
  LicenceRegisterConnector,
  LICENCE_REGISTERS,
  type Connector,
} from "@scopium/connectors";
import { persistMaterialised, persistRawCapture, searchPeopleByName } from "@/db/repository";
import { resolvePeople } from "@/db/resolve";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Person sweep: given a name, run the on-demand connectors that accept a name
 * query, materialise everything into the ontology with raw-capture provenance,
 * re-run entity resolution, and return the matching people so the client can
 * open a profile.
 *
 * Connectors that require an API key or a live public endpoint are best-effort:
 * a failure in one source never aborts the sweep.
 */
export async function POST(req: Request) {
  const { name, limit = 10 } = await req.json() as { name: string; limit?: number };
  if (!name || name.trim().length < 2) {
    return NextResponse.json({ error: "name must be at least 2 characters" }, { status: 400 });
  }

  const connectors: Connector[] = [
    new CompaniesOfficePublicConnector({ query: name, mode: "director", limit }),
    new CharitiesConnector({ limit: 100, officerName: name }),
    new CourtDecisionsConnector({ query: name, limit }),
    new SanctionsConnector({ query: name, limit }),
    ...Object.values(LICENCE_REGISTERS).map(
      d => new LicenceRegisterConnector({ descriptor: d, query: name, limit }),
    ),
    // Companies Office disqualified-directors needs a subscription key.
    ...(process.env.DISQUALIFIED_DIRECTORS_API_KEY
      ? [new DisqualifiedDirectorsConnector({ apiKey: process.env.DISQUALIFIED_DIRECTORS_API_KEY, query: name, limit })]
      : []),
  ];

  const sourceResults: { source: string; ok: boolean; objects?: number; error?: string }[] = [];

  for (const connector of connectors) {
    try {
      const res = await connector.sync({
        fetchedBy: `sweep:${name}`,
        emit: persistMaterialised,
        emitRaw: persistRawCapture,
      });
      sourceResults.push({ source: connector.id, ok: true, objects: res.objectsEmitted });
    } catch (err) {
      sourceResults.push({ source: connector.id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Re-resolve so newly-swept records cluster with any existing ones.
  let resolution = null;
  try { resolution = await resolvePeople(); } catch { /* resolution is best-effort */ }

  const people = await searchPeopleByName(name, 25);

  return NextResponse.json({ name, sourceResults, resolution, people });
}
