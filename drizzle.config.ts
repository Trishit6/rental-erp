import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * Uses DATABASE_URL when present, otherwise composes the URL from
 * DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME. Credentials stay in .env.
 */
function databaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  const host = process.env.DB_HOST ?? "localhost";
  const port = process.env.DB_PORT ?? "3307";
  const user = process.env.DB_USER ?? "root";
  const password = process.env.DB_PASSWORD ?? "";
  const database = process.env.DB_NAME ?? "reloop";
  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

export default defineConfig({
  schema: "./server/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: databaseUrl(),
  },
  verbose: true,
  strict: false,
});
