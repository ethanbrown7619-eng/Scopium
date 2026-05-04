import { Connector, type SyncContext, type SyncResult } from "./base";
import type { ScopiumObject, ScopiumLink } from "@scopium/ontology";

export type SyntheticOptions = {
  /** How many companies to generate. */
  count: number;
  /** Deterministic seed for repeatable runs. */
  seed?: number;
};

const NAME_PREFIXES = [
  "Aotearoa", "Kiwi", "Pacific", "Southern", "Tasman", "Capital", "Auckland",
  "Wellington", "Canterbury", "Otago", "Manuka", "Tui", "Kauri", "Rata",
  "Pohutukawa", "Tawhiri", "Whangarei", "Coromandel", "Ruapehu",
];
const NAME_NOUNS = [
  "Holdings", "Trading", "Industries", "Logistics", "Software", "Capital",
  "Ventures", "Foods", "Engineering", "Properties", "Forestry", "Wines",
  "Health", "Media", "Energy", "Construction", "Marine", "Agriculture",
];
const NAME_SUFFIX = ["Ltd", "Limited", "Group Ltd", "Co. Ltd"];
const CITIES = [
  "Auckland", "Wellington", "Christchurch", "Hamilton", "Tauranga", "Dunedin",
  "Palmerston North", "Napier", "Nelson", "Rotorua", "Queenstown", "Whangārei",
];
const STREETS = [
  "Queen St", "Hobson St", "Lambton Quay", "Manchester St", "Victoria St",
  "Cuba St", "Ponsonby Rd", "Karangahape Rd", "Wakefield St", "Riccarton Rd",
];
const FIRST_NAMES = [
  "Aroha", "James", "Sarah", "Tāne", "Emma", "Hone", "Jess", "Kahu", "Liam",
  "Mere", "Nia", "Oliver", "Patricia", "Quinn", "Ruth", "Te Aroha", "Vaughn",
  "Wiremu", "Atawhai", "Charlotte", "Daniel", "Hinemoa", "Ngaire",
];
const LAST_NAMES = [
  "Smith", "Williams", "Brown", "Wilson", "Anderson", "Patel", "Singh",
  "Mitchell", "Stewart", "Walker", "Tipa", "Pou", "Reweti", "Ngata",
  "Te Wherowhero", "MacDonald", "Chen", "Tane",
];
const ANZSIC_CODES = ["L671100", "F361000", "C111100", "M692100", "I473100", "K624000", "H440000"];

class Mulberry32 {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0; }
  next(): number {
    let t = (this.s += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
const pick = <T,>(rng: Mulberry32, arr: readonly T[]): T => arr[Math.floor(rng.next() * arr.length)]!;
const pad = (n: number, w: number) => String(n).padStart(w, "0");

/**
 * SyntheticCompaniesConnector fabricates a plausible NZ company graph for
 * demos when you don't have a Companies Register API token. Output uses the
 * same ontology types and link shapes as the real connector, so the
 * workspace, query layer, and Ask palette behave identically.
 */
export class SyntheticCompaniesConnector extends Connector {
  readonly id = "synthetic-companies";
  readonly version = "0.1.0";
  readonly displayName = "Synthetic NZ Companies";
  readonly description = "Procedurally-generated NZ companies + directors for demos.";

  constructor(private readonly opts: SyntheticOptions) { super(); }

  async sync(ctx: SyncContext): Promise<SyncResult> {
    const start = Date.now();
    const rng = new Mulberry32(this.opts.seed ?? 42);
    let objects = 0;
    let links = 0;

    for (let i = 0; i < this.opts.count; i++) {
      ctx.signal?.throwIfAborted();
      const now = this.nowIso();
      const companyName = `${pick(rng, NAME_PREFIXES)} ${pick(rng, NAME_NOUNS)} ${pick(rng, NAME_SUFFIX)}`;
      const nzbn = "9429" + pad(Math.floor(rng.next() * 1e9), 9);
      const companyNumber = String(1_000_000 + Math.floor(rng.next() * 9_000_000));
      const city = pick(rng, CITIES);
      const incorpYear = 1990 + Math.floor(rng.next() * 35);
      const incorpDate = `${incorpYear}-${pad(1 + Math.floor(rng.next() * 12), 2)}-${pad(1 + Math.floor(rng.next() * 28), 2)}`;

      const companyId = this.newId();
      const company: ScopiumObject = {
        id: companyId,
        type: "NZCompany",
        classification: "Public",
        provenance: this.provenance(nzbn, undefined, { synthetic: true, index: i }, ctx.fetchedBy),
        createdAt: now, updatedAt: now,
        properties: {
          name: companyName,
          nzbn,
          companyNumber,
          status: "Registered",
          incorporationDate: incorpDate,
          anzsic: pick(rng, ANZSIC_CODES),
          registeredOffice: `${1 + Math.floor(rng.next() * 999)} ${pick(rng, STREETS)}, ${city}`,
        },
      };

      const dirCount = 1 + Math.floor(rng.next() * 3);
      const objs: ScopiumObject[] = [company];
      const lnks: ScopiumLink[] = [];
      for (let d = 0; d < dirCount; d++) {
        const personId = this.newId();
        const fullName = `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;
        objs.push({
          id: personId,
          type: "Person",
          classification: "Public",
          provenance: this.provenance(`director:${nzbn}:${d}`, undefined, { synthetic: true }, ctx.fetchedBy),
          createdAt: now, updatedAt: now,
          properties: { fullName, residentialLocality: city },
        });
        lnks.push({
          id: this.newId(),
          type: "DirectorOf",
          fromId: personId,
          toId: companyId,
          classification: "Public",
          provenance: this.provenance(`director:${nzbn}:${d}`, undefined, { synthetic: true }, ctx.fetchedBy),
          createdAt: now, updatedAt: now,
          properties: { startDate: incorpDate, appointmentSource: "Synthetic seed" },
        });
      }

      await ctx.emit({ objects: objs, links: lnks });
      objects += objs.length;
      links += lnks.length;
    }

    return { objectsEmitted: objects, linksEmitted: links, durationMs: Date.now() - start };
  }
}
