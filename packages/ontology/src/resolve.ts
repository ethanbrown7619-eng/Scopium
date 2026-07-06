/**
 * Person entity-resolution primitives.
 *
 * NZ has no public person identifier, so resolution is evidence accumulation.
 * These are the pure, testable scoring functions; the DB-side driver that runs
 * them over materialised records lives in apps/web/src/db/resolve.ts.
 */

export const RESOLVER_VERSION = "person-resolver@1";

/** Normalise a name for comparison: lowercase, strip punctuation, collapse ws. */
export const normaliseName = (name: string): string =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics for comparison only
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Reorder "SMITH, John Andrew" → "john andrew smith". Handles the
 * comma-surname-first convention common in NZ registers.
 */
export const canonicalName = (name: string): string => {
  const trimmed = name.trim();
  if (trimmed.includes(",")) {
    const [surname, rest] = trimmed.split(",", 2);
    return normaliseName(`${rest} ${surname}`);
  }
  return normaliseName(trimmed);
};

const tokens = (name: string): string[] => canonicalName(name).split(" ").filter(Boolean);

/** Surname + first initial — the standard resolution blocking key. */
export const blockingKey = (name: string): string => {
  const t = tokens(name);
  if (t.length === 0) return "";
  const surname = t[t.length - 1]!;
  const firstInitial = t[0]![0] ?? "";
  return `${surname}:${firstInitial}`;
};

/** Jaccard similarity over name tokens (0..1). */
export const nameTokenSimilarity = (a: string, b: string): number => {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
};

export type PersonAttributes = {
  fullName: string;
  dateOfBirth?: string;
  residentialLocality?: string;
  /** IDs of entities (companies, charities, properties) this record links to. */
  linkedEntityIds?: string[];
};

export type MatchResult = {
  score: number;
  signals: string[];
  method: "deterministic" | "probabilistic";
  /** True if this pair should auto-merge without human review. */
  autoMerge: boolean;
};

const dobMatches = (a?: string, b?: string): boolean => {
  if (!a || !b) return false;
  // Compare on the longest common prefix that both fully specify.
  const min = Math.min(a.length, b.length);
  if (min < 4) return false;
  return a.slice(0, min) === b.slice(0, min);
};

/**
 * Score whether two person records are the same human.
 *
 * Deterministic auto-merge only when the evidence is overwhelming:
 *   - exact canonical name AND matching DOB, or
 *   - exact canonical name AND shared locality AND ≥1 shared linked entity.
 * Everything else is a probabilistic candidate for analyst confirmation.
 */
export const scorePersonMatch = (a: PersonAttributes, b: PersonAttributes): MatchResult => {
  const signals: string[] = [];
  const nameSim = nameTokenSimilarity(a.fullName, b.fullName);
  const exactName = canonicalName(a.fullName) === canonicalName(b.fullName) && canonicalName(a.fullName) !== "";
  const dob = dobMatches(a.dateOfBirth, b.dateOfBirth);
  const sharedLocality =
    !!a.residentialLocality && a.residentialLocality === b.residentialLocality;
  const sharedEntities = (a.linkedEntityIds ?? []).filter(id => (b.linkedEntityIds ?? []).includes(id));

  let score = nameSim * 0.5;
  if (exactName) signals.push("exact-name");
  if (dob) { score += 0.4; signals.push("dob-match"); }
  if (sharedLocality) { score += 0.15; signals.push("shared-locality"); }
  if (sharedEntities.length > 0) { score += 0.2; signals.push(`shared-entity×${sharedEntities.length}`); }
  score = Math.min(1, score);

  const autoMerge =
    (exactName && dob) ||
    (exactName && sharedLocality && sharedEntities.length > 0);

  return {
    score: Number(score.toFixed(3)),
    signals,
    method: autoMerge ? "deterministic" : "probabilistic",
    autoMerge,
  };
};
