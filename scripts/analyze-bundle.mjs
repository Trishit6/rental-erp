import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const distDir = path.resolve("dist/assets");
if (!fs.existsSync(distDir)) {
  console.error("dist/assets not found. Run pnpm build first.");
  process.exit(1);
}

// The initial JS the homepage blocks on is the entry chunk (index-*.js) plus
// everything it statically imports; Vite emits static imports as separate
// chunks only with manualChunks, so a single entry file is normal.
const files = fs.readdirSync(distDir).filter((f) => f.endsWith(".js"));
const results = [];
for (const file of files) {
  const full = path.join(distDir, file);
  const raw = fs.readFileSync(full);
  results.push({
    file,
    raw: raw.length,
    gzip: zlib.gzipSync(raw).length,
  });
}
results.sort((a, b) => b.gzip - a.gzip);

console.log("Bundle sizes (raw / gzip):");
for (const r of results) {
  console.log(`${r.file}: ${(r.raw / 1024).toFixed(2)} kB / ${(r.gzip / 1024).toFixed(2)} kB gzip`);
}

const initial = results.filter((r) => /^index.*\.js$/.test(r.file) || /^home.*\.js$/.test(r.file));
const initialGzip = initial.reduce((sum, r) => sum + r.gzip, 0);
if (initial.length > 0) {
  console.log(
    `Homepage initial JS: ${(initialGzip / 1024).toFixed(2)} kB gzip (budget 250 kB)`,
  );
}

const check = process.argv.includes("--check");
if (check) {
  let failed = false;
  for (const r of results) {
    if (r.raw > 500 * 1024) {
      console.error(`FAIL: ${r.file} exceeds 500 kB raw (${(r.raw / 1024).toFixed(2)} kB)`);
      failed = true;
    }
  }
  if (initial.length > 0 && initialGzip > 250 * 1024) {
    console.error(
      `FAIL: homepage initial JS ${(initialGzip / 1024).toFixed(2)} kB gzip exceeds 250 kB budget`,
    );
    failed = true;
  }
  if (failed) {
    console.error("Bundle budget check failed");
    process.exit(1);
  }
  console.log("Bundle budget check passed");
}
