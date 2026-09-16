import postgres from "postgres";

export type Sql = postgres.Sql<{ bigint: bigint }>;

let _sql: Sql | undefined;

/**
 * Lazily-created shared connection. Pool is small on purpose: Supabase's
 * session pooler has a modest connection ceiling and the worker, the web app
 * and any one-off script all draw from it.
 */
export function db(url = process.env.DATABASE_URL): Sql {
  if (_sql) return _sql;
  if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");
  _sql = postgres(url, {
    max: Number(process.env.PGPOOL_MAX ?? 8),
    idle_timeout: 20,
    connect_timeout: 15,
    // Supabase and Fly both terminate TLS with their own CA.
    ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : "require",
    transform: { undefined: null },
  }) as Sql;
  return _sql;
}

export async function closeDb(): Promise<void> {
  await _sql?.end({ timeout: 5 });
  _sql = undefined;
}
