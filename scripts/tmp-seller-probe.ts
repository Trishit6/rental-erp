import "dotenv/config";
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  waitForConnections: true,
  connectionLimit: 2,
  timezone: "Z",
});

async function q(label: string, sql: string) {
  const [rows] = await pool.query(sql);
  console.log(label, JSON.stringify(rows));
}

await q("product statuses:", "SELECT status, COUNT(*) n FROM products GROUP BY status");
await q("listing types:", "SELECT listing_type, COUNT(*) n FROM products GROUP BY listing_type");
await q("users by role:", "SELECT role, COUNT(*) n FROM users GROUP BY role");
await q("sellers:", `SELECT u.id, u.name, u.role, p.user_id IS NOT NULL AS has_profile
  FROM users u LEFT JOIN seller_profiles p ON p.user_id = u.id
  WHERE u.role IN ('SELLER','ADMIN') LIMIT 20`);
await q("orphan SOLD/OUT_OF_STOCK:", `SELECT COUNT(*) n FROM products WHERE status NOT IN ('DRAFT','PUBLISHED','OUT_OF_STOCK','PAUSED','ARCHIVED')`);
await q("products per seller (top):", `SELECT seller_id, COUNT(*) n FROM products GROUP BY seller_id ORDER BY n DESC LIMIT 8`);
await q("orders w/ seller lines:", `SELECT seller_id, COUNT(DISTINCT order_id) n FROM order_items GROUP BY seller_id ORDER BY n DESC LIMIT 8`);
await q("rentals per owner:", `SELECT owner_id, COUNT(*) n FROM rentals GROUP BY owner_id ORDER BY n DESC LIMIT 8`);
await q("reviews per seller:", `SELECT seller_id, COUNT(*) n FROM reviews GROUP BY seller_id ORDER BY n DESC LIMIT 8`);
await q("order modes:", "SELECT mode, COUNT(*) n FROM order_items GROUP BY mode");
await q("orders status:", "SELECT status, COUNT(*) n FROM orders GROUP BY status");
await q("line fulfillment:", "SELECT fulfillment_status, COUNT(*) n FROM order_items GROUP BY fulfillment_status");
await q("total products:", "SELECT COUNT(*) n FROM products");

await pool.end();