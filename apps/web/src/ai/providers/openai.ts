import { QueryAst } from "@scopium/query";
import { type AIProvider, readSSE } from "./types";

/**
 * OpenAI Chat Completions API — https://platform.openai.com/docs/api-reference/chat
 *  1. Forced tool call to extract the QueryAst (arguments are a JSON string).
 *  2. Run the tool.
 *  3. Streamed continuation; choices[].delta.content carries the text.
 */
export const openai: AIProvider = async function* ({ system, question, tool, apiKey, model, runTool }) {
  const headers = {
    "content-type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  const toolSpec = {
    type: "function" as const,
    function: { name: tool.name, description: tool.description, parameters: tool.schema },
  };
  const baseMessages = [
    { role: "system", content: system },
    { role: "user", content: question },
  ];

  yield { kind: "thinking", text: "Planning query against ontology..." };

  const planRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: baseMessages,
      tools: [toolSpec],
      tool_choice: { type: "function", function: { name: tool.name } },
    }),
  });
  if (!planRes.ok) {
    yield { kind: "error", message: `OpenAI plan failed: ${planRes.status} ${await planRes.text()}` };
    return;
  }
  const planBody = await planRes.json() as any;
  const message = planBody.choices?.[0]?.message;
  const call = message?.tool_calls?.[0];
  if (!call) {
    yield { kind: "error", message: "OpenAI did not emit a tool call" };
    return;
  }
  let astInput: unknown;
  try {
    astInput = JSON.parse(call.function.arguments);
  } catch {
    yield { kind: "error", message: "OpenAI returned non-JSON tool arguments" };
    return;
  }
  const parsed = QueryAst.safeParse(astInput);
  if (!parsed.success) {
    yield { kind: "error", message: `Invalid query plan: ${parsed.error.message}` };
    return;
  }
  yield { kind: "plan", ast: parsed.data };
  yield { kind: "thinking", text: "Executing query..." };

  const { rows, ids } = await runTool(parsed.data);
  yield { kind: "results", rows, ids };

  const streamRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        ...baseMessages,
        message,
        {
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ rows: rows.slice(0, 50), totalRows: rows.length, ids }),
        },
      ],
    }),
  });
  if (!streamRes.ok || !streamRes.body) {
    yield { kind: "error", message: `OpenAI stream failed: ${streamRes.status}` };
    return;
  }

  for await (const ev of readSSE(streamRes.body)) {
    if (ev.data === "[DONE]") break;
    try {
      const j = JSON.parse(ev.data);
      const text = j.choices?.[0]?.delta?.content;
      if (text) yield { kind: "delta", text };
    } catch {}
  }
  yield { kind: "done" };
};
