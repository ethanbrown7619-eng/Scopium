import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { objects, links } from "@/db/schema";
import { eq, or } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [obj] = await db.select().from(objects).where(eq(objects.id, id)).limit(1);
  if (!obj) return NextResponse.json({ error: "not found" }, { status: 404 });

  const adj = await db.select().from(links).where(or(eq(links.fromId, id), eq(links.toId, id))).limit(200);
  const otherIds = adj.map(l => (l.fromId === id ? l.toId : l.fromId));
  const others = otherIds.length
    ? await db.select().from(objects).where(or(...otherIds.map(i => eq(objects.id, i))))
    : [];

  return NextResponse.json({ object: obj, links: adj, neighbours: others });
}
