import { NextResponse } from "next/server";
import { searchPeopleByName } from "@/db/repository";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ error: "query must be at least 2 characters" }, { status: 400 });
  }
  const rows = await searchPeopleByName(q, Number(url.searchParams.get("limit") ?? 25));
  return NextResponse.json({ query: q, people: rows });
}
