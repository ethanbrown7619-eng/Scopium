import { NextResponse } from "next/server";
import { addWatch, listWatches, removeWatch } from "@/db/watchlist";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json({ watches: await listWatches() });
}

/** Add a person to the watchlist. Body: { name, facts?, notifyEmail? }. */
export async function POST(req: Request) {
  const { name, facts, notifyEmail } = await req.json() as {
    name: string; facts?: Record<string, string>; notifyEmail?: string;
  };
  if (!name || name.trim().length < 2) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const id = await addWatch(name, facts ?? {}, notifyEmail);
  return NextResponse.json({ id });
}

/** Remove a watch. Body: { id }. */
export async function DELETE(req: Request) {
  const { id } = await req.json() as { id: string };
  await removeWatch(id);
  return NextResponse.json({ ok: true });
}
