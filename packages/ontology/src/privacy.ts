/**
 * Privacy Act 2020 guardrails, applied uniformly at materialisation.
 *
 * The core rule: full residential addresses of individuals are personal
 * information and MUST NOT be stored in the ontology. Connectors pass raw
 * address strings through `sanitiseAddress`, which keeps only a coarse
 * locality (suburb/city/region) — enough to disambiguate people, not enough
 * to locate them. Business/service addresses and company registered offices
 * are not individuals' homes and are kept in full.
 */

/** NZ towns/cities/regions we allow through as a coarse locality. */
const NZ_LOCALITIES = [
  "Auckland", "Wellington", "Christchurch", "Hamilton", "Tauranga", "Napier",
  "Hastings", "Dunedin", "Palmerston North", "Nelson", "Rotorua", "New Plymouth",
  "Whangārei", "Whangarei", "Invercargill", "Whanganui", "Gisborne", "Timaru",
  "Blenheim", "Queenstown", "Levin", "Masterton", "Pukekohe", "Taupō", "Taupo",
  "Cambridge", "Ashburton", "Feilding", "Oamaru", "Tokoroa", "Northland",
  "Waikato", "Bay of Plenty", "Taranaki", "Manawatū", "Manawatu", "Hawke's Bay",
  "Wairarapa", "Marlborough", "Tasman", "West Coast", "Canterbury", "Otago",
  "Southland", "North Shore", "Manukau", "Waitākere", "Waitakere", "Porirua",
  "Lower Hutt", "Upper Hutt", "Papakura", "Franklin",
];

/**
 * Reduce an individual's address to a coarse locality string, or undefined.
 * We never keep street/number. Matches a known NZ locality anywhere in the
 * string; falls back to the last comma-separated component if it looks like a
 * place name (letters only), otherwise drops it entirely.
 */
export const sanitiseAddress = (raw: string | null | undefined): string | undefined => {
  if (!raw) return undefined;
  const hit = NZ_LOCALITIES.find(loc => raw.toLowerCase().includes(loc.toLowerCase()));
  if (hit) return hit;
  const tail = raw.split(",").map(s => s.trim()).filter(Boolean).pop();
  if (tail && /^[\p{L}\s'-]+$/u.test(tail) && tail.length <= 40) return tail;
  return undefined;
};

/**
 * Reduce a full DOB to a privacy-preserving form for storage/display when the
 * source exposes a full date. We keep the full DOB ONLY internally for
 * resolution; the display layer should call `displayDob` to coarsen to a year.
 */
export const displayDob = (dob: string | null | undefined): string | undefined => {
  if (!dob) return undefined;
  const m = /^(\d{4})/.exec(dob);
  return m ? m[1] : undefined;
};

/** Classification a source-scoped person record should carry by default. */
export const personDefaultClassification = "Public" as const;
