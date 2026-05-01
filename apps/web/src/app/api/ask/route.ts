import { askStream } from "@/ai/ask";
import { compile, type QueryAst } from "@scopium/query";
import { runCompiledQuery, linksFor } from "@/db/repository";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { question } = await req.json() as { question: string };

  const executor = async (ast: QueryAst) => {
    const c = compile(ast);
    const { rows } = await runCompiledQuery(c.sql, c.params);
    return { rows, ids: rows.map(r => r.id) };
  };

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        for await (const ev of askStream(question, executor)) {
          send(ev);
          if (ev.kind === "results") {
            // also fetch links for graph hydration
            const lnks = await linksFor(ev.ids);
            send({ kind: "links", links: lnks });
          }
        }
      } catch (err) {
        send({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
