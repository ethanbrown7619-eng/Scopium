import { NextResponse } from "next/server";
import { pendingMerges, setMergeStatus } from "@/db/repository";

export const runtime = "nodejs";

/** List candidate person merges awaiting analyst review. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const merges = await pendingMerges(Number(url.searchParams.get("limit") ?? 50));
  return NextResponse.json({ merges });
}

/** Confirm or reject a candidate merge. Body: { linkId, status, by? }. */
export async function POST(req: Request) {
  const { linkId, status, by } = await req.json() as { linkId: string; status: "confirmed" | "rejected"; by?: string };
  if (!linkId || (status !== "confirmed" && status !== "rejected")) {
    return NextResponse.json({ error: "linkId and status (confirmed|rejected) required" }, { status: 400 });
  }
  await setMergeStatus(linkId, status, by ?? "analyst");
  return NextResponse.json({ ok: true });
}
