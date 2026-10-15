// Temporary read-only audit for R10 Step 0. Only ever runs SELECT/EXPLAIN.
import "dotenv/config";
import mysql from "mysql2/promise";

const conn = await mysql.createConnection({
  uri: process.env.DATABASE_URL,
  timezone: "Z",
  multipleStatements: false,
});

const q = async (sql, params = []) => {
  const [rows] = await conn.query(sql, params);
  return rows;
};

async function counts() {
  const tables = [
    "products",
    "categories",
    "brands",
    "tags",
    "product_tags",
    "attribute_definitions",
    "category_attributes",
    "product_attribute_values",
    "category_slug_redirects",
    "category_rules",
  ];
  const out = {};
  for (const t of tables) {
    try {
      const rows = await q(`SELECT COUNT(*) AS n FROM \`${t}\``);
      out[t] = Number(rows[0].n);
    } catch (e) {
      out[t] = `ERR ${e.code ?? e.message}`;
    }
  }
  return out;
}

const PUBLIC = "('PUBLISHED','OUT_OF_STOCK')";

const queries = {
  // Baseline browse: category slug filter, default (recommended) sort.
  browseCategoryRecommended: {
    sql: `SELECT p.id, p.title, p.slug, p.condition, p.listing_type, p.status,
      p.purchase_price, p.rental_price_per_day, p.rating_average, p.rating_count,
      p.favorite_count, p.view_count, p.available_quantity, c.name AS category_name,
      (SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order ASC LIMIT 1) AS primary_image
      FROM products p INNER JOIN categories c ON p.category_id = c.id
      WHERE p.status IN ${PUBLIC} AND c.slug = ? AND c.is_active = 1
      ORDER BY (p.rating_average * LOG10(p.rating_count + 2)) DESC
      LIMIT 12 OFFSET 0`,
    params: ["electronics"],
  },
  browseCategoryCount: {
    sql: `SELECT COUNT(*) AS total FROM products p
      INNER JOIN categories c ON p.category_id = c.id
      WHERE p.status IN ${PUBLIC} AND c.slug = ? AND c.is_active = 1`,
    params: ["electronics"],
  },
  browseNoFilterNewest: {
    sql: `SELECT p.id, p.title, p.slug FROM products p
      INNER JOIN categories c ON p.category_id = c.id
      WHERE p.status IN ${PUBLIC}
      ORDER BY p.created_at DESC LIMIT 12 OFFSET 0`,
    params: [],
  },
  browsePriceSort: {
    sql: `SELECT p.id, p.title FROM products p
      INNER JOIN categories c ON p.category_id = c.id
      WHERE p.status IN ${PUBLIC}
      ORDER BY COALESCE(p.purchase_price, p.rental_price_per_day, 999999999) ASC
      LIMIT 12 OFFSET 0`,
    params: [],
  },
  browseCategoryPriceSort: {
    sql: `SELECT p.id, p.title FROM products p
      INNER JOIN categories c ON p.category_id = c.id
      WHERE p.status IN ${PUBLIC} AND c.slug = ? AND c.is_active = 1
      ORDER BY COALESCE(p.purchase_price, p.rental_price_per_day, 999999999) ASC
      LIMIT 12 OFFSET 0`,
    params: ["electronics"],
  },
  // Category subtree via path prefix (R10 requirement) — no index on path today.
  browseSubtreePathPrefix: {
    sql: `SELECT p.id, p.title FROM products p
      INNER JOIN categories c ON p.category_id = c.id
      WHERE p.status IN ${PUBLIC} AND c.is_active = 1 AND c.path LIKE ?
      ORDER BY p.created_at DESC LIMIT 12 OFFSET 0`,
    params: ["/%/"],
  },
  // Attribute EXISTS filter (what R10 will add).
  browseAttrExists: {
    sql: `SELECT p.id, p.title FROM products p
      INNER JOIN categories c ON p.category_id = c.id
      WHERE p.status IN ${PUBLIC}
        AND EXISTS (SELECT 1 FROM product_attribute_values pav
                    WHERE pav.product_id = p.id AND pav.attribute_id = ?
                      AND pav.value_key = ?)
      ORDER BY (p.rating_average * LOG10(p.rating_count + 2)) DESC
      LIMIT 12 OFFSET 0`,
    params: [1, "samsung"],
  },
  // Brand slug filter (R10: brand list).
  browseBrandSlug: {
    sql: `SELECT p.id, p.title FROM products p
      INNER JOIN categories c ON p.category_id = c.id
      INNER JOIN brands b ON p.brand_id = b.id
      WHERE p.status IN ${PUBLIC} AND b.slug = ?
      ORDER BY p.created_at DESC LIMIT 12 OFFSET 0`,
    params: ["samsung"],
  },
  // Tag list filter.
  browseTagSlug: {
    sql: `SELECT p.id, p.title FROM products p
      INNER JOIN categories c ON p.category_id = c.id
      WHERE p.status IN ${PUBLIC}
        AND EXISTS (SELECT 1 FROM product_tags pt WHERE pt.product_id = p.id AND pt.tag = ?)
      ORDER BY p.created_at DESC LIMIT 12 OFFSET 0`,
    params: ["camera"],
  },
  // Facet-style count: brands for a category (what /facets will run).
  facetBrands: {
    sql: `SELECT b.slug, b.name, COUNT(*) AS n FROM products p
      INNER JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE p.status IN ${PUBLIC} AND c.is_active = 1 AND c.path LIKE ?
      GROUP BY b.id, b.slug, b.name ORDER BY n DESC LIMIT 30`,
    params: ["/%/"],
  },
  // Facet-style count: values of one filterable attribute inside a category.
  facetAttributeValues: {
    sql: `SELECT pav.value_key, COUNT(DISTINCT p.id) AS n
      FROM products p
      INNER JOIN categories c ON p.category_id = c.id
      INNER JOIN product_attribute_values pav ON pav.product_id = p.id
      WHERE p.status IN ${PUBLIC} AND c.is_active = 1 AND c.path LIKE ?
        AND pav.attribute_id = ?
      GROUP BY pav.value_key ORDER BY n DESC LIMIT 50`,
    params: ["/%/", 1],
  },
};

const indexTables = [
  "products",
  "categories",
  "brands",
  "tags",
  "product_tags",
  "attribute_definitions",
  "category_attributes",
  "product_attribute_values",
];

async function timeQuery(spec, runs = 5) {
  // Warm-up (fills InnoDB buffer pool) then best-of-N, reported in ms.
  await q(spec.sql, spec.params).catch(() => {});
  let best = Infinity;
  let rows = 0;
  for (let i = 0; i < runs; i++) {
    const t0 = process.hrtime.bigint();
    const r = await q(spec.sql, spec.params);
    const t1 = process.hrtime.bigint();
    best = Math.min(best, Number(t1 - t0) / 1e6);
    rows = Array.isArray(r) ? r.length : 1;
  }
  return { best, rows };
}

async function explain(spec) {
  const rows = await q(`EXPLAIN ${spec.sql}`, spec.params);
  return rows.map((r) => ({
    select_type: r.select_type,
    table: r.table,
    type: r.type,
    possible_keys: r.possible_keys,
    key: r.key,
    key_len: r.key_len,
    ref: r.ref,
    rows: r.rows,
    Extra: r.Extra,
  }));
}

const report = { counts: await counts(), schemaVersion: null, timings: [], plans: {}, indexes: {} };

try {
  const v = await q("SELECT MAX(version) AS v FROM drizzle.__drizzle_migrations");
  report.schemaVersion = v?.[0]?.v ?? null;
} catch {
  report.schemaVersion = "unknown";
}

for (const [name, spec] of Object.entries(queries)) {
  const { best, rows } = await timeQuery(spec);
  report.timings.push({ name, ms: Math.round(best * 100) / 100, rows });
  report.plans[name] = await explain(spec);
}

for (const t of indexTables) {
  report.indexes[t] = (await q(`SHOW INDEX FROM \`${t}\``)).map(
    (i) => `${i.Key_name}(${i.Column_name}${i.Non_unique ? "" : ",unique"})`,
  );
}

// Attribute definitions + whether they are filterable, so the audit names real keys.
report.attributeDefinitions = (
  await q(
    "SELECT `key`, label, type, unit, is_filterable, is_active, group_label, sort_order FROM attribute_definitions ORDER BY sort_order",
  )
).map((r) => ({ ...r }));
report.categoryAttributes = await q(
  "SELECT category_id, attribute_id, is_required, sort_order FROM category_attributes ORDER BY sort_order LIMIT 50",
);
report.topCategories = await q(
  "SELECT id, name, slug, depth, path, is_active, product_count FROM categories ORDER BY depth, sort_order LIMIT 40",
);
report.brandSample = await q(
  "SELECT id, name, slug, status, product_count FROM brands ORDER BY product_count DESC LIMIT 20",
);

console.log(JSON.stringify(report, null, 2));
await conn.end();
