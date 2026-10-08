import "dotenv/config";

/**
 * The connection details to reach MariaDB from a Node process, resolved the same
 * way `drizzle.config.ts` and `server/db.ts` resolve them: `DATABASE_URL` wins
 * when present, otherwise the individual `DB_*` variables.
 *
 * Every script that opens its own connection should go through this. Building
 * the options from `DB_*` alone looks equivalent and is not — when a `.env`
 * provides a full URL instead of separate variables, the fallbacks silently
 * produce *different* credentials, which fails as an auth plugin error rather
 * than as an obvious "wrong password" and wastes a debugging session.
 */
export interface DatabaseCredentials {
  host: string;
  port: number;
  user: string;
  password: string;
  /** Present only when it can be determined. */
  database?: string;
}

export function databaseCredentials(): DatabaseCredentials {
  const fallback: DatabaseCredentials = {
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 3307),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME,
  };

  if (!process.env.DATABASE_URL) return fallback;

  try {
    const url = new URL(process.env.DATABASE_URL);
    return {
      host: url.hostname || fallback.host,
      port: url.port ? Number(url.port) : fallback.port,
      user: decodeURIComponent(url.username || fallback.user),
      password: decodeURIComponent(url.password || fallback.password),
      database: url.pathname.replace(/^\//, "") || fallback.database,
    };
  } catch {
    return fallback;
  }
}

/** Hosts a destructive or throwaway-database script is allowed to touch. */
export function isLocalHost(host: string): boolean {
  return new Set(["localhost", "127.0.0.1", "::1"]).has(host);
}
