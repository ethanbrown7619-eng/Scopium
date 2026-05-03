import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * The DB client is initialised lazily so module imports don't crash during
 * Cloudflare/Vercel build steps where DATABASE_URL isn't available. Workers
 * also expose Hyperdrive bindings on `process.env.HYPERDRIVE` (the Cloudflare
 * adapter forwards them) — we prefer those when present so the connection
 * runs through the edge connection pool.
 */
let _client: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

const resolveUrl = (): string => {
  const hyperdrive = (globalThis as any).HYPERDRIVE?.connectionString as string | undefined;
  const url = hyperdrive ?? process.env.HYPERDRIVE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL (or Hyperdrive binding) is not set");
  return url;
};

const init = () => {
  if (_db) return _db;
  _client = postgres(resolveUrl(), { max: 5, prepare: false, idle_timeout: 20 });
  _db = drizzle(_client, { schema });
  return _db;
};

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get: (_t, prop) => Reflect.get(init(), prop),
});

export { schema };
export type Db = ReturnType<typeof drizzle>;
