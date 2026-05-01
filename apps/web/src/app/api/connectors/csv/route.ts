import { NextResponse } from "next/server";
import { CsvUploadConnector, ColumnMapping } from "@scopium/connectors";
import { z } from "zod";
import { persistMaterialised } from "@/db/repository";

export const runtime = "nodejs";

const Body = z.object({
  csv: z.string(),
  objectType: z.string(),
  sourceLabel: z.string(),
  mappings: z.array(ColumnMapping),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  const connector = new CsvUploadConnector({
    csv: parsed.data.csv,
    objectType: parsed.data.objectType as any,
    mappings: parsed.data.mappings,
    sourceLabel: parsed.data.sourceLabel,
  });

  const result = await connector.sync({
    fetchedBy: "csv-upload",
    emit: persistMaterialised,
  });

  return NextResponse.json(result);
}
