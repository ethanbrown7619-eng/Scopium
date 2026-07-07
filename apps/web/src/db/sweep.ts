/**
 * Live person sweep — the search-first core. Given a name (and optional known
 * facts), run every name-driven connector, persist with raw-capture
 * provenance, re-run entity resolution, and return the matching people ranked
 * by how well they fit the known facts. No pre-seeding required.
 */
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
import { canonicalName } from "@scopium/ontology";
import { persistMaterialised, persistRawCapture, searchPeopleByName, type ObjectRow } from "./repository";
import { resolvePeople } from "./resolve";

export type KnownFacts = {
  dateOfBirth?: string;
  locality?: string;
  occupation?: string;
  /** A company/charity/context term the analyst already associates with them. */
  associatedWith?: string;
};

export type SweepOutcome = {
  name: string;
  sourceResults: { source: string; ok: boolean; objects?: number; error?: string }[];
  resolution: unknown;
  people: (ObjectRow & { fitScore: number })[];
};

const buildConnectors = (name: string, limit: number): Connector[] => [
  new CompaniesOfficePublicConnector({ query: name, mode: "director", limit }),
  new CharitiesConnector({ limit: 100, officerName: name }),
  new CourtDecisionsConnector({ query: name, limit }),
  new SanctionsConnector({ query: name, limit }),
  ...Object.values(LICENCE_REGISTERS).map(d => new LicenceRegisterConnector({ descriptor: d, query: name, limit })),
  ...(process.env.DISQUALIFIED_DIRECTORS_API_KEY
    ? [new DisqualifiedDirectorsConnector({ apiKey: process.env.DISQUALIFIED_DIRECTORS_API_KEY, query: name, limit })]
    : []),
];

/** Score how well a person record fits the known facts (0..1). */
const fitScore = (row: ObjectRow, facts: KnownFacts): number => {
  let score = 0.5;
  const p = row.properties;
  if (facts.dateOfBirth && p.dateOfBirth) {
    const a = String(p.dateOfBirth), b = facts.dateOfBirth;
    if (a.slice(0, Math.min(a.length, b.length)) === b.slice(0, Math.min(a.length, b.length))) score += 0.3;
  }
  if (facts.locality && p.residentialLocality &&
      String(p.residentialLocality).toLowerCase() === facts.locality.toLowerCase()) score += 0.15;
  if (facts.occupation && p.occupation &&
      String(p.occupation).toLowerCase().includes(facts.occupation.toLowerCase())) score += 0.15;
  return Math.min(1, score);
};

export const sweepPerson = async (
  name: string,
  opts: { limit?: number; facts?: KnownFacts; actor?: string } = {},
): Promise<SweepOutcome> => {
  const limit = opts.limit ?? 10;
  const facts = opts.facts ?? {};
  const connectors = buildConnectors(name, limit);
  const sourceResults: SweepOutcome["sourceResults"] = [];

  for (const connector of connectors) {
    try {
      const res = await connector.sync({
        fetchedBy: opts.actor ?? `sweep:${name}`,
        emit: persistMaterialised,
        emitRaw: persistRawCapture,
      });
      sourceResults.push({ source: connector.id, ok: true, objects: res.objectsEmitted });
    } catch (err) {
      sourceResults.push({ source: connector.id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  let resolution: unknown = null;
  try { resolution = await resolvePeople(); } catch { /* best-effort */ }

  const rows = await searchPeopleByName(name, 25);
  // Prefer exact canonical-name matches, then known-fact fit.
  const cn = canonicalName(name);
  const people = rows
    .map(r => ({ ...r, fitScore: fitScore(r, facts) + (canonicalName(String(r.properties.fullName ?? "")) === cn ? 0.2 : 0) }))
    .sort((a, b) => b.fitScore - a.fitScore);

  return { name, sourceResults, resolution, people };
};
