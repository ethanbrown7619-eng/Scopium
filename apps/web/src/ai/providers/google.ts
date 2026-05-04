import { QueryAst } from "@scopium/query";
import { type AIProvider, readSSE } from "./types";

/**
 * Google Gemini generateContent — https://ai.google.dev/gemini-api/docs/function-calling
 *  1. Forced functionCallingConfig to AUTO with tool_choice ANY for the plan.
 *  2. Run the tool.
 *  3. streamGenerateContent for the final answer (alt=sse so we can reuse the
 *     standard SSE reader).
 *
 * Gemini's JSON Schema dialect for function declarations is a subset; we keep
 * the QUERY_PLAN_TOOL schema simple enough that it round-trips.
 */
export const google: AIProvider = async function* ({ system, question, tool, apiKey, model, runTool }) {
  const base = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`;
  const headers = { "content-type": "application/json", "x-goog-api-key": apiKey };
  const toolDecl = {
    functionDeclarations: [{ name: tool.name, description: tool.description, parameters: tool.schema }],
  };
  const systemInstruction = { role: "system", parts: [{ text: system }] };

  yield { kind: "thinking", text: "Planning query against ontology..." };

  const planRes = await fetch(`${base}:generateContent`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      systemInstruction,
      contents: [{ role: "user", parts: [{ text: question }] }],
      tools: [toolDecl],
      toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [tool.name] } },
    }),
  });
  if (!planRes.ok) {
    yield { kind: "error", message: `Gemini plan failed: ${planRes.status} ${await planRes.text()}` };
    return;
  }
  const planBody = await planRes.json() as any;
  const parts = planBody.candidates?.[0]?.content?.parts ?? [];
  const fnCall = parts.find((p: any) => p.functionCall)?.functionCall;
  if (!fnCall) {
    yield { kind: "error", message: "Gemini did not emit a function call" };
    return;
  }
  const parsed = QueryAst.safeParse(fnCall.args);
  if (!parsed.success) {
    yield { kind: "error", message: `Invalid query plan: ${parsed.error.message}` };
    return;
  }
  yield { kind: "plan", ast: parsed.data };
  yield { kind: "thinking", text: "Executing query..." };

  const { rows, ids } = await runTool(parsed.data);
  yield { kind: "results", rows, ids };

  const streamRes = await fetch(`${base}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      systemInstruction,
      contents: [
        { role: "user", parts: [{ text: question }] },
        { role: "model", parts: [{ functionCall: fnCall }] },
        {
          role: "user",
          parts: [{
            functionResponse: {
              name: tool.name,
              response: { rows: rows.slice(0, 50), totalRows: rows.length, ids },
            },
          }],
        },
      ],
      tools: [toolDecl],
    }),
  });
  if (!streamRes.ok || !streamRes.body) {
    yield { kind: "error", message: `Gemini stream failed: ${streamRes.status}` };
    return;
  }

  for await (const ev of readSSE(streamRes.body)) {
    try {
      const j = JSON.parse(ev.data);
      const partsOut = j.candidates?.[0]?.content?.parts ?? [];
      for (const p of partsOut) if (p.text) yield { kind: "delta", text: p.text };
    } catch {}
  }
  yield { kind: "done" };
};
