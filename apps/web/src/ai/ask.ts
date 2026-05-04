import { ontologySchemaForPrompt } from "@scopium/ontology";
import type { QueryAst } from "@scopium/query";
import { resolveProvider, type AskEvent, type ToolDef } from "./providers";

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
\`traverse\` for relationship hops.
`;

const QUERY_PLAN_TOOL: ToolDef = {
  name: "query_plan",
  description: "Execute a typed Scopium query AST against the ontology store. Always use this rather than guessing.",
  schema: {
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

export type { AskEvent };
export type AskExecutor = (ast: QueryAst) => Promise<{ rows: any[]; ids: string[] }>;

/**
 * Stream an answer for a free-form question. Provider (Anthropic / OpenAI /
 * Gemini) is selected via env: see apps/web/src/ai/providers/index.ts.
 */
export async function* askStream(question: string, executor: AskExecutor): AsyncGenerator<AskEvent> {
  const resolved = resolveProvider();
  if (!resolved) {
    yield {
      kind: "error",
      message:
        "No AI provider configured. Set AI_PROVIDER (anthropic|openai|google) and AI_API_KEY, or set ANTHROPIC_API_KEY / OPENAI_API_KEY / GOOGLE_API_KEY.",
    };
    return;
  }

  yield* resolved.provider({
    system: SYSTEM_PROMPT(),
    question,
    tool: QUERY_PLAN_TOOL,
    apiKey: resolved.apiKey,
    model: resolved.model,
    runTool: executor,
  });
}
