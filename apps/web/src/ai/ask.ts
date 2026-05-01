import Anthropic from "@anthropic-ai/sdk";
import { ontologySchemaForPrompt } from "@scopium/ontology";
import { QueryAst, type QueryAst as QueryAstT } from "@scopium/query";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

const SYSTEM_PROMPT = (): string => `You are the Scopium analyst assistant. You help an analyst explore an
ontology of NZ public-sector and business data.

Rules:
1. You never make claims about data that are not grounded in a query result.
2. To answer, you emit a JSON \`query_plan\` tool call with a typed Scopium QueryAst.
3. The platform runs the query, returns rows, and you then write a short
   answer that cites entities by their object IDs in the form [scopium:<id>].
4. Never invent IDs. Only cite IDs returned by the query result.

The ontology schema available to you:

${ontologySchemaForPrompt()}

Geographic terms in queries may use NZ region/territory/suburb names. If the
user asks for a count or aggregate, set \`aggregate\` accordingly. Use
\`traverse\` for relationship hops (e.g. directors of a company → other
companies they direct).
`;

const QUERY_PLAN_TOOL: Anthropic.Tool = {
  name: "query_plan",
  description: "Execute a typed Scopium query AST against the ontology store. Always use this rather than guessing.",
  input_schema: {
    type: "object",
    properties: {
      from: { type: "string", description: "Starting object type, e.g. NZCompany" },
      where: { type: "array", items: { type: "object" } },
      traverse: { type: "array", items: { type: "object" } },
      aggregate: { type: "object" },
      limit: { type: "number" },
      rationale: { type: "string", description: "One sentence explaining what this query answers" },
    },
    required: ["from"],
  },
};

export type AskEvent =
  | { kind: "thinking"; text: string }
  | { kind: "plan"; ast: QueryAstT }
  | { kind: "results"; rows: unknown[]; ids: string[] }
  | { kind: "delta"; text: string }
  | { kind: "done" }
  | { kind: "error"; message: string };

export type AskExecutor = (ast: QueryAstT) => Promise<{ rows: any[]; ids: string[] }>;

/**
 * Stream an answer for a free-form question.
 *  1. Ask Claude to emit a query_plan tool call.
 *  2. Validate AST, run it via `executor`.
 *  3. Feed results back to Claude, stream the natural-language answer.
 */
export async function* askStream(question: string, executor: AskExecutor): AsyncGenerator<AskEvent> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    yield { kind: "error", message: "ANTHROPIC_API_KEY is not set" };
    return;
  }
  const client = new Anthropic({ apiKey });

  yield { kind: "thinking", text: "Planning query against ontology..." };

  const planMsg = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT(),
    tools: [QUERY_PLAN_TOOL],
    tool_choice: { type: "tool", name: "query_plan" },
    messages: [{ role: "user", content: question }],
  });

  const toolUse = planMsg.content.find(b => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    yield { kind: "error", message: "Model did not emit a query plan" };
    return;
  }

  const parsed = QueryAst.safeParse(toolUse.input);
  if (!parsed.success) {
    yield { kind: "error", message: `Invalid query plan: ${parsed.error.message}` };
    return;
  }

  yield { kind: "plan", ast: parsed.data };
  yield { kind: "thinking", text: "Executing query..." };

  const { rows, ids } = await executor(parsed.data);
  yield { kind: "results", rows, ids };

  // Stream the written answer with the rows fed back as a tool result.
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT(),
    tools: [QUERY_PLAN_TOOL],
    messages: [
      { role: "user", content: question },
      { role: "assistant", content: planMsg.content },
      {
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify({ rows: rows.slice(0, 50), totalRows: rows.length, ids }),
        }],
      },
    ],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield { kind: "delta", text: event.delta.text };
    }
  }

  yield { kind: "done" };
}
