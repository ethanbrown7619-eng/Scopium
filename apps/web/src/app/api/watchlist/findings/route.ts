import { NextResponse } from "next/server";
import { listFindings, markFindingSeen } from "@/db/watchlist";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const findings = await listFindings(
    url.searchParams.get("watchId") ?? undefined,
    url.searchParams.get("unseen") === "true",
  );
  return NextResponse.json({ findings });
}

/** Mark a finding as seen. Body: { id }. */
export async function POST(req: Request) {
  const { id } = await req.json() as { id: string };
  await markFindingSeen(id);
  return NextResponse.json({ ok: true });
}
