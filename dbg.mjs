const BASE = "http://localhost:3001/api";
let cookie = "";
async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, { method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = res.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const login = await call("POST", "/auth/login", { email: "buyer@revaro.local", password: "revaro-dev-2026" });
console.log("login", login.status);
const list = await call("GET", "/products?pageSize=10");
const items = list.body.data ?? [];
console.log("products returned:", items.length, "total", list.body.pagination?.total);
for (const p of items.slice(0,8)) {
  console.log(" -", p.id, p.title, "| type:", p.listingType, "| buy:", p.purchasePrice, "| rent/day:", p.rentalPricePerDay, "| availQty:", p.availableQuantity, "| qty:", p.quantity, "| status:", p.status);
}
