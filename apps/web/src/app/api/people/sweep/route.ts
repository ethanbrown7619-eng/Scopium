import { NextResponse } from "next/server";
import { sweepPerson, type KnownFacts } from "@/db/sweep";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Person sweep: given a name (and optional known facts), run the live
 * name-driven connectors, persist, resolve, and return matches ranked by fit.
 * This is the search-first entry point — no pre-seeding needed.
 */
export async function POST(req: Request) {
  const { name, limit = 10, facts } = await req.json() as { name: string; limit?: number; facts?: KnownFacts };
  if (!name || name.trim().length < 2) {
    return NextResponse.json({ error: "name must be at least 2 characters" }, { status: 400 });
  }
  const outcome = await sweepPerson(name, { limit, facts });
  return NextResponse.json(outcome);
}
