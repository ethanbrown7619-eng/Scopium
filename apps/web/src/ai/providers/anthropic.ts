import { QueryAst } from "@scopium/query";
import { type AIProvider, readSSE } from "./types";

/**
 * Anthropic Messages API — https://docs.anthropic.com/en/api/messages
 *  1. Forced tool_use call to extract the QueryAst.
 *  2. Run the tool.
 *  3. Streamed continuation, parsing content_block_delta events.
 */
export const anthropic: AIProvider = async function* ({ system, question, tool, apiKey, model, runTool }) {
  const headers = {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };

  yield { kind: "thinking", text: "Planning query against ontology..." };

  const planRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system,
      tools: [{ name: tool.name, description: tool.description, input_schema: tool.schema }],
      tool_choice: { type: "tool", name: tool.name },
      messages: [{ role: "user", content: question }],
    }),
  });
  if (!planRes.ok) {
    yield { kind: "error", message: `Anthropic plan failed: ${planRes.status} ${await planRes.text()}` };
    return;
  }
  const planBody = await planRes.json() as any;
  const toolUse = planBody.content?.find((b: any) => b.type === "tool_use");
  if (!toolUse) {
    yield { kind: "error", message: "Anthropic did not emit a tool_use" };
    return;
  }

  const parsed = QueryAst.safeParse(toolUse.input);
  if (!parsed.success) {
    yield { kind: "error", message: `Invalid query plan: ${parsed.error.message}` };
    return;
  }
  yield { kind: "plan", ast: parsed.data };
  yield { kind: "thinking", text: "Executing query..." };

  const { rows, ids } = await runTool(parsed.data);
  yield { kind: "results", rows, ids };

  const streamRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system,
      tools: [{ name: tool.name, description: tool.description, input_schema: tool.schema }],
      stream: true,
      messages: [
        { role: "user", content: question },
        { role: "assistant", content: planBody.content },
        {
          role: "user",
          content: [{
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify({ rows: rows.slice(0, 50), totalRows: rows.length, ids }),
          }],
        },
      ],
    }),
  });
  if (!streamRes.ok || !streamRes.body) {
    yield { kind: "error", message: `Anthropic stream failed: ${streamRes.status}` };
    return;
  }

  for await (const ev of readSSE(streamRes.body)) {
    if (ev.event !== "content_block_delta") continue;
    try {
      const j = JSON.parse(ev.data);
      if (j.delta?.type === "text_delta" && j.delta.text) {
        yield { kind: "delta", text: j.delta.text };
      }
    } catch {}
  }
  yield { kind: "done" };
};
