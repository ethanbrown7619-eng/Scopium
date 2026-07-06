import { NextResponse } from "next/server";
import { resolvePeople } from "@/db/resolve";

export const runtime = "nodejs";

/** Re-run entity resolution across all Person records. Returns merge stats. */
export async function POST() {
  const result = await resolvePeople();
  return NextResponse.json(result);
}
