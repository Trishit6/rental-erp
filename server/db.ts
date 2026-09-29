import "dotenv/config";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "./schema";

/**
 * Connection details come from env (DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME),
 * with optional single-URL override via DATABASE_URL. Never hardcode credentials.
 */
function buildPoolConfig(): mysql.PoolOptions {
  if (process.env.DATABASE_URL) {
    return {
      uri: process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 10,
      timezone: "Z",
    };
  }
  return {
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 3307),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "reloop",
    waitForConnections: true,
    connectionLimit: 10,
    timezone: "Z",
  };
}

export const pool = mysql.createPool(buildPoolConfig());

export const db = drizzle(pool, { schema, mode: "default" });

export type Database = typeof db;
