import type { QueryAst } from "@scopium/query";

export type ToolDef = {
  name: string;
  description: string;
  /** JSON Schema for the tool's input. */
  schema: Record<string, unknown>;
};

export type AskEvent =
  | { kind: "thinking"; text: string }
  | { kind: "plan"; ast: QueryAst }
  | { kind: "results"; rows: unknown[]; ids: string[] }
  | { kind: "delta"; text: string }
  | { kind: "done" }
  | { kind: "error"; message: string };

export type RunTool = (ast: QueryAst) => Promise<{ rows: any[]; ids: string[] }>;

export type AskArgs = {
  system: string;
  question: string;
  tool: ToolDef;
  apiKey: string;
  model: string;
  runTool: RunTool;
};

/** Every provider implements this single async generator. */
export type AIProvider = (args: AskArgs) => AsyncGenerator<AskEvent>;

/**
 * Server-Sent Events parser. Workers fetch returns `body` as a ReadableStream
 * of Uint8Arrays; this decodes them into `event:` / `data:` records, one
 * record per double-newline.
 */
export async function* readSSE(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<{ event?: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event: string | undefined;
      let data = "";
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7).trim();
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (data) yield { event, data };
    }
  }
}
