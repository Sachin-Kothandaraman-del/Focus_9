/**
 * One-shot seeder: creates the app's master data inside your ERPNext site
 * (UOMs, Item Groups, Customers, all Items) via the REST API. Idempotent —
 * anything that already exists is skipped, so re-running is safe.
 *
 * Usage:
 *   1. Fill ERPNEXT_URL, ERPNEXT_API_KEY, ERPNEXT_API_SECRET in middleware/.env
 *   2. node erp/seed-erpnext.js          (from the middleware folder)
 *      node erp/seed-erpnext.js --dry    (preview without creating anything)
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const seed = require("../store/seed-data");

const URL_ = process.env.ERPNEXT_URL;
const DRY = process.argv.includes("--dry");

if (!URL_ || !process.env.ERPNEXT_API_KEY) {
  console.error("Set ERPNEXT_URL, ERPNEXT_API_KEY and ERPNEXT_API_SECRET in middleware/.env first.");
  process.exit(1);
}

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `token ${process.env.ERPNEXT_API_KEY}:${process.env.ERPNEXT_API_SECRET}`
  };
}
async function exists(doctype, name) {
  const res = await fetch(`${URL_}/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, { headers: headers() });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`${doctype}/${name} check → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return true;
}
async function create(doctype, payload) {
  const res = await fetch(`${URL_}/api/resource/${encodeURIComponent(doctype)}`, {
    method: "POST", headers: headers(), body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`${doctype} create → HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).data;
}
async function ensure(doctype, name, payload, stats) {
  if (await exists(doctype, name)) { stats.skipped++; console.log(`  = ${doctype}: ${name} (exists)`); return; }
  if (DRY) { stats.created++; console.log(`  + ${doctype}: ${name} (would create)`); return; }
  await create(doctype, payload);
  stats.created++;
  console.log(`  + ${doctype}: ${name}`);
}

(async () => {
  console.log(`Seeding ERPNext at ${URL_} ${DRY ? "(DRY RUN — nothing will be created)" : ""}\n`);
  const stats = { created: 0, skipped: 0 };

  console.log("Units of Measure:");
  for (const u of seed.uoms) {
    await ensure("UOM", u, { uom_name: u, enabled: 1 }, stats);
  }

  console.log("\nItem Groups:");
  const groups = [...new Set(seed.items.map(i => i.group))];
  for (const g of groups) {
    await ensure("Item Group", g, { item_group_name: g, parent_item_group: "All Item Groups", is_group: 0 }, stats);
  }

  console.log("\nCustomers:");
  for (const c of seed.customers) {
    await ensure("Customer", c.name, {
      customer_name: c.name,
      customer_type: "Company",
      customer_group: "Commercial",
      territory: "All Territories"
    }, stats);
  }

  console.log("\nItems:");
  for (const i of seed.items) {
    await ensure("Item", i.code, {
      item_code: i.code,
      item_name: i.name,
      description: i.desc,
      stock_uom: i.uom,
      item_group: i.group,
      is_stock_item: 1,
      include_item_in_manufacturing: 0
    }, stats);
  }

  console.log(`\nDone. Created: ${stats.created}, already existed: ${stats.skipped}.`);
  console.log("Next: generate an API key was already done; place a test order in the app and check Selling → Sales Order in ERPNext.");
})().catch(e => {
  console.error("\nSeeding failed:", e.message);
  console.error("Check ERPNEXT_URL is reachable and the API key/secret are correct (avatar → My Settings → API Access).");
  process.exit(1);
});
