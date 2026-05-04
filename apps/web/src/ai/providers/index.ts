import type { AIProvider } from "./types";
import { anthropic } from "./anthropic";
import { openai } from "./openai";
import { google } from "./google";

export type ProviderName = "anthropic" | "openai" | "google";

export type ResolvedProvider = {
  name: ProviderName;
  provider: AIProvider;
  apiKey: string;
  model: string;
};

const DEFAULT_MODELS: Record<ProviderName, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o",
  google: "gemini-2.5-pro",
};

const KEY_ENV: Record<ProviderName, string[]> = {
  anthropic: ["ANTHROPIC_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  google: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
};

const PROVIDERS: Record<ProviderName, AIProvider> = { anthropic, openai, google };

/**
 * Resolve the configured provider from env. Picks `AI_PROVIDER` first; falls
 * back to whichever provider key is present (Anthropic > OpenAI > Google) so
 * users who only set ANTHROPIC_API_KEY keep working without re-config.
 */
export const resolveProvider = (env: Record<string, string | undefined> = process.env as any): ResolvedProvider | null => {
  const explicit = (env.AI_PROVIDER ?? "").toLowerCase() as ProviderName | "";
  const candidates: ProviderName[] = explicit ? [explicit] : ["anthropic", "openai", "google"];
  for (const name of candidates) {
    if (!PROVIDERS[name]) continue;
    const apiKey = env.AI_API_KEY ?? KEY_ENV[name].map(k => env[k]).find(Boolean);
    if (!apiKey) continue;
    const model = env.AI_MODEL ?? DEFAULT_MODELS[name];
    return { name, provider: PROVIDERS[name], apiKey, model };
  }
  return null;
};

export type { AIProvider, AskEvent, RunTool, ToolDef } from "./types";
