import { NextResponse } from "next/server";
import { QueryAst, compile } from "@scopium/query";
import { runCompiledQuery, linksFor } from "@/db/repository";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = QueryAst.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }
  const compiled = compile(parsed.data);
  const { rows } = await runCompiledQuery(compiled.sql, compiled.params);
  const ids = rows.map(r => r.id);
  const links = await linksFor(ids);
  return NextResponse.json({ rows, links, shape: compiled.shape, ids });
}
