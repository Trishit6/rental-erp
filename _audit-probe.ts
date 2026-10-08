import "dotenv/config";
import fs from "node:fs";
import crypto from "node:crypto";
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
const conn = url
  ? await mysql.createConnection(url)
  : await mysql.createConnection({
      host: process.env.DB_HOST || "127.0.0.1",
      port: Number(process.env.DB_PORT || 3307),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || "reloop",
    });

const journal = JSON.parse(
  fs.readFileSync("drizzle/meta/_journal.json", "utf8"),
) as { entries: { idx: number; tag: string; when: number; breakpoints: boolean }[] };

const [rows] = await conn.query(
  "SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY id",
) as unknown as [{ id: number; hash: string; created_at: number }[]];

console.log("journal entries:", journal.entries.length);
console.log("db rows:", rows.length);

const byTag = new Map(journal.entries.map((e) => [e.tag, e]));

for (const row of rows) {
  const entry = byTag.get(
    journal.entries[row.id]?.tag ?? "?",
  );
  const file = `drizzle/${journal.entries[row.id]?.tag ?? "?"}.sql`;
  let fileHash = "MISSING";
  let size = 0;
  if (fs.existsSync(file)) {
    const buf = fs.readFileSync(file);
    size = buf.length;
    fileHash = crypto.createHash("sha256").update(buf).digest("hex");
  }
  const match = row.hash === fileHash;
  console.log(
    `${row.id}: ${journal.entries[row.id]?.tag ?? "?"} recorded=${row.hash.slice(0, 12)} file=${fileHash.slice(0, 12)} size=${size} ${match ? "OK" : "MISMATCH"}`,
  );
}
await conn.end();