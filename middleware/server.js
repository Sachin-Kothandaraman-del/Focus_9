/**
 * PROSAFE × EGA — Middleware / Business Logic Layer  v2
 *   Mobile app + Web portal ⇄ THIS SERVER ⇄ Supabase (DB + Auth) ⇄ ERP (ERPNext live / Focus9 stub)
 *
 * Modes (auto-detected from .env):
 *   SUPABASE_URL set   → production: Supabase Postgres + Supabase Auth
 *   SUPABASE_URL empty → local demo: JSON-file DB + demo logins (password "prosafe1")
 */
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const store = require("./store");
const authsvc = require("./auth");
const { safeCall } = require("./erp");

const app = express();
app.use(cors());
app.use(express.json());

/* Serverless-friendly init gate: ensure the store is ready before any route
   (on Vercel there is no boot phase — init runs on first request). */
let _ready = null;
app.use((req, res, next) => {
  _ready = _ready || store.init();
  _ready.then(() => next()).catch(e => {
    _ready = null;
    res.status(503).json({ error: "Database not ready: " + e.message + ". If using Supabase, run supabase/schema.sql and seed.sql first." });
  });
});

const PORT = process.env.PORT || 4000;
const CANCEL_WINDOW_MIN = 15;
const requireAuth = authsvc.requireAuth;

/* masters cache (60 s) */
let mCache = null, mCacheAt = 0;
async function masters() {
  if (!mCache || Date.now() - mCacheAt > 60000) { mCache = await store.masters(); mCacheAt = Date.now(); }
  return mCache;
}
const wrap = fn => (req, res) => fn(req, res).catch(e => {
  console.error(e);
  res.status(e.status || 500).json({ error: e.message || "Server error" });
});

async function balancesFor(userId, plId) {
  const m = await masters();
  const p = m.priceLists.find(x => x.id === plId);
  if (!p) return { pl: null, lines: [] };
  const { consumption, extra } = await store.getAlloc(userId);
  const lines = p.lines.map(l => {
    const allocated = l.alloc + (extra[l.code] || 0);
    const used = consumption[l.code] || 0;
    return { ...l, allocated, used, balance: allocated - used };
  });
  return { pl: p, lines };
}
function pub(profile) {
  const { id, email, name, phone, empId, role, customer, dept, priceList, active } = profile;
  return { id, email, name, phone, empId, role, customer, dept, priceList, active };
}
function orderDTO(o) {
  return {
    ...o,
    cancellable: o.status === "in_progress" && Date.now() - Date.parse(o.createdAt) < CANCEL_WINDOW_MIN * 60000
  };
}

/* ══════════════════ AUTH & ACCOUNT LIFECYCLE ══════════════════ */
app.post("/api/auth/signup", wrap(async (req, res) => {
  const { profile, session, pendingActivation } = await authsvc.signup(req.body || {});
  res.status(201).json({
    user: pub(profile),
    token: session ? session.token : null,
    refreshToken: session ? session.refreshToken : null,
    pendingActivation,
    emailConfirmationRequired: !session && authsvc.SUPA,
    message: pendingActivation
      ? "Account created. A PROSAFE admin must assign your company and price list before you can order."
      : "Admin account created and activated."
  });
}));

app.post("/api/auth/login", wrap(async (req, res) => {
  const { profile, session } = await authsvc.login(req.body || {});
  const m = await masters();
  res.json({
    user: pub(profile),
    token: session.token, refreshToken: session.refreshToken,
    customer: profile.customer ? m.customers.find(c => c.id === profile.customer) : null,
    pendingActivation: profile.role === "employee" && (!profile.active || !profile.priceList)
  });
}));

app.post("/api/auth/refresh", wrap(async (req, res) => {
  res.json(await authsvc.refresh((req.body || {}).refreshToken));
}));

app.delete("/api/auth/account", requireAuth(), wrap(async (req, res) => {
  await authsvc.deleteAccount(req.user.id);
  await store.erpLog(`Account deleted on user request: ${req.user.email} (${req.user.empId})`);
  res.json({ ok: true, message: "Your account and personal data have been deleted." });
}));

/* ══════════════════ PROFILE ══════════════════ */
app.get("/api/profile", requireAuth(), wrap(async (req, res) => {
  const m = await masters();
  const u = req.user;
  const { lines, pl } = u.priceList ? await balancesFor(u.id, u.priceList) : { lines: [], pl: null };
  res.json({
    user: pub(u),
    customer: u.customer ? m.customers.find(c => c.id === u.customer) : null,
    priceList: pl ? { id: pl.id, name: pl.name, contract: pl.contract } : null,
    pendingActivation: u.role === "employee" && (!u.active || !u.priceList),
    approvedQtyList: lines.map(l => {
      const i = m.items.find(x => x.code === l.code);
      return { code: l.code, name: i.name, uom: i.uom, restricted: l.restricted, allocated: l.allocated, used: l.used, balance: l.balance };
    })
  });
}));

/* ══════════════════ CATALOG ══════════════════ */
app.get("/api/catalog", requireAuth("employee"), wrap(async (req, res) => {
  const u = req.user;
  if (!u.active || !u.priceList)
    return res.status(403).json({ error: "Your account is awaiting activation by the PROSAFE admin", pendingActivation: true });
  const m = await masters();
  const { pl, lines } = await balancesFor(u.id, u.priceList);
  res.json({
    priceList: { id: pl.id, name: pl.name, contract: pl.contract, validFrom: pl.validFrom, validTill: pl.validTill },
    customer: m.customers.find(c => c.id === pl.customer),
    lines: lines.map(l => ({ ...l, item: m.items.find(i => i.code === l.code) }))
  });
}));

/* ══════════════════ ORDERS ══════════════════ */
app.post("/api/orders", requireAuth("employee"), wrap(async (req, res) => {
  const u = req.user;
  if (!u.active || !u.priceList)
    return res.status(403).json({ error: "Account awaiting activation", pendingActivation: true });
  const { kind, lines: reqLines, contract } = req.body || {};
  if (!["order", "approval"].includes(kind)) return res.status(400).json({ error: "kind must be order|approval" });
  if (!Array.isArray(reqLines) || !reqLines.length) return res.status(400).json({ error: "lines required" });

  const m = await masters();
  const { pl, lines: balLines } = await balancesFor(u.id, u.priceList);
  const built = [];
  for (const rl of reqLines) {
    const l = balLines.find(x => x.code === rl.code);
    const qty = Number(rl.qty);
    if (!l) return res.status(400).json({ error: `Item ${rl.code} is not on your approved price list` });
    if (!(qty > 0)) return res.status(400).json({ error: `Invalid qty for ${rl.code}` });
    built.push({ code: rl.code, qty, uom: m.items.find(i => i.code === rl.code).uom, price: l.price, restricted: l.restricted, balance: l.balance });
  }
  if (kind === "order") {
    for (const b of built) {
      if (b.restricted) return res.status(422).json({ error: `${b.code} is restricted — send via approval cart`, needsApproval: true });
      if (b.qty > b.balance) return res.status(422).json({ error: `${b.code} exceeds allocated balance — send via approval cart`, needsApproval: true });
    }
  }

  const ref = "OR" + (await store.nextSeq("or"));
  const lines = built.map((b, ix) => ({
    lineRef: `${ref}/${String(ix + 1).padStart(3, "0")}`,
    code: b.code, qty: b.qty, uom: b.uom, price: b.price,
    amount: +(b.qty * b.price).toFixed(2), received: 0
  }));
  const order = {
    ref, contract: contract || pl.contract,
    emp: u.id, empId: u.empId, empName: u.name, dept: u.dept,
    customer: pl.customer, customerName: m.customers.find(c => c.id === pl.customer).name,
    priceList: pl.id, createdAt: new Date().toISOString(),
    status: kind === "order" ? "in_progress" : "pending_approval",
    lines, total: +lines.reduce((s, l) => s + l.amount, 0).toFixed(2),
    so: null, dns: [],
    history: [{ at: new Date().toISOString(), ev: `Order placed (${kind === "order" ? "Order Cart" : "Approval Cart"})` }]
  };
  await store.createOrder(order);

  if (kind === "order") {
    for (const l of lines) await store.addConsumption(u.id, l.code, l.qty);
    const r = await safeCall("createSalesOrder", order);
    if (r && r.soRef) {
      order.so = r.soRef;
      order.history.push({ at: new Date().toISOString(), ev: `ERP SO ${r.soRef} created` });
      await store.saveOrder(order);
    }
  } else {
    await store.erpLog(`Order ${ref} (${u.name}) held in middleware — awaiting EGA client approval`);
  }
  res.status(201).json(orderDTO(order));
}));

app.get("/api/orders", requireAuth(), wrap(async (req, res) => {
  let list = await store.listOrders();
  if (req.user.role === "employee") list = list.filter(o => o.emp === req.user.id);
  if (req.user.role === "approver" && req.query.pending === "1") list = list.filter(o => o.status === "pending_approval");
  res.json(list.map(orderDTO));
}));

app.get("/api/orders/:ref", requireAuth(), wrap(async (req, res) => {
  const o = await store.getOrder(req.params.ref);
  if (!o) return res.status(404).json({ error: "Not found" });
  if (req.user.role === "employee" && o.emp !== req.user.id) return res.status(403).json({ error: "Not your order" });
  res.json(orderDTO(o));
}));

app.post("/api/orders/:ref/cancel", requireAuth("employee"), wrap(async (req, res) => {
  const o = await store.getOrder(req.params.ref);
  if (!o || o.emp !== req.user.id) return res.status(404).json({ error: "Not found" });
  if (o.status !== "in_progress") return res.status(422).json({ error: "Only in-progress orders can be cancelled" });
  if (Date.now() - Date.parse(o.createdAt) >= CANCEL_WINDOW_MIN * 60000)
    return res.status(422).json({ error: `The ${CANCEL_WINDOW_MIN}-minute cancellation window has passed` });
  o.status = "cancelled";
  o.history.push({ at: new Date().toISOString(), ev: "Cancelled by employee within 15-min window" });
  for (const l of o.lines) await store.addConsumption(o.emp, l.code, -l.qty);
  if (o.so) await safeCall("cancelSalesOrder", o.so);
  await store.saveOrder(o);
  res.json(orderDTO(o));
}));

app.post("/api/orders/:ref/approve", requireAuth("approver"), wrap(async (req, res) => {
  const o = await store.getOrder(req.params.ref);
  if (!o || o.status !== "pending_approval") return res.status(422).json({ error: "Order is not awaiting approval" });
  const { lines: balLines } = await balancesFor(o.emp, o.priceList);
  for (const l of o.lines) {
    const bal = balLines.find(x => x.code === l.code)?.balance ?? 0;
    if (l.qty > bal) await store.addExtra(o.emp, l.code, l.qty - bal);   // raise approved qty list
    await store.addConsumption(o.emp, l.code, l.qty);
  }
  o.status = "in_progress";
  o.history.push({ at: new Date().toISOString(), ev: `Approved by ${req.user.name} (EGA) — approved qty list updated` });
  const r = await safeCall("createSalesOrder", o);
  if (r && r.soRef) { o.so = r.soRef; o.history.push({ at: new Date().toISOString(), ev: `ERP SO ${r.soRef} created` }); }
  await store.saveOrder(o);
  res.json(orderDTO(o));
}));

app.post("/api/orders/:ref/reject", requireAuth("approver"), wrap(async (req, res) => {
  const o = await store.getOrder(req.params.ref);
  if (!o || o.status !== "pending_approval") return res.status(422).json({ error: "Order is not awaiting approval" });
  o.status = "rejected";
  o.history.push({ at: new Date().toISOString(), ev: `Rejected by ${req.user.name} (EGA)${req.body?.reason ? " — " + req.body.reason : ""}` });
  await store.saveOrder(o);
  await store.erpLog(`Order ${o.ref} rejected by ${req.user.name}`);
  res.json(orderDTO(o));
}));

app.post("/api/orders/:ref/delivery-note", requireAuth("admin"), wrap(async (req, res) => {
  const o = await store.getOrder(req.params.ref);
  if (!o || o.status !== "in_progress") return res.status(422).json({ error: "Order has no open SO awaiting delivery" });
  const dnRef = "DO" + (await store.nextSeq("dn"));
  const r = await safeCall("createDeliveryNote", o, dnRef);
  const finalRef = (r && r.dnRef) || dnRef;
  o.dns.push(finalRef);
  o.status = "do_created";
  o.history.push({ at: new Date().toISOString(), ev: `Delivery Note ${finalRef} created — delivery to the person` });
  await store.saveOrder(o);
  res.json(orderDTO(o));
}));

app.post("/api/orders/:ref/receive", requireAuth("employee"), wrap(async (req, res) => {
  const o = await store.getOrder(req.params.ref);
  if (!o || o.emp !== req.user.id) return res.status(404).json({ error: "Not found" });
  if (!["do_created", "partially_received"].includes(o.status))
    return res.status(422).json({ error: "Order is not awaiting receipt" });
  let any = false;
  for (const rl of req.body?.lines || []) {
    const l = o.lines.find(x => x.lineRef === rl.lineRef);
    if (!l) continue;
    const v = Math.max(0, Math.min(l.qty - l.received, Number(rl.qty) || 0));
    if (v > 0) { l.received += v; any = true; }
  }
  if (!any) return res.status(400).json({ error: "No receivable quantities supplied" });
  const full = o.lines.every(l => l.received >= l.qty);
  o.status = full ? "complete" : "partially_received";
  o.history.push({ at: new Date().toISOString(), ev: full ? "Receipt acknowledged in full — order complete" : "Partial receipt acknowledged" });
  await store.saveOrder(o);
  await store.erpLog(`Receipt acknowledgement for ${o.ref} (${full ? "full" : "partial"}) — order quantities updated`);
  res.json(orderDTO(o));
}));

app.post("/api/orders/:ref/return", requireAuth("employee"), wrap(async (req, res) => {
  const o = await store.getOrder(req.params.ref);
  if (!o || o.emp !== req.user.id) return res.status(404).json({ error: "Not found" });
  if (o.status !== "complete") return res.status(422).json({ error: "Only completed orders can be returned" });
  const retLines = [];
  for (const rl of req.body?.lines || []) {
    const l = o.lines.find(x => x.lineRef === rl.lineRef);
    if (!l) continue;
    const v = Math.max(0, Math.min(l.received, Number(rl.qty) || 0));
    if (v > 0) retLines.push({ lineRef: l.lineRef, code: l.code, qty: v, uom: l.uom, price: l.price });
  }
  if (!retLines.length) return res.status(400).json({ error: "No returnable quantities supplied" });
  const ref = "RT" + (await store.nextSeq("ret"));
  for (const rl of retLines) {
    await store.addConsumption(o.emp, rl.code, -rl.qty);
    const ol = o.lines.find(x => x.lineRef === rl.lineRef);
    ol.received -= rl.qty; ol.qty -= rl.qty; ol.amount = +(ol.qty * ol.price).toFixed(2);
  }
  o.total = +o.lines.reduce((s, l) => s + l.amount, 0).toFixed(2);
  o.history.push({ at: new Date().toISOString(), ev: `Return ${ref} submitted — approved qty list credited` });
  await store.saveOrder(o);
  await safeCall("postReturn", {
    ref, at: new Date().toISOString(), order: o.ref, so: o.so, dn: o.dns[0] || null,
    emp: o.emp, empName: o.empName, customer: o.customer, customerName: o.customerName,
    lines: retLines, total: +retLines.reduce((s, l) => s + l.qty * l.price, 0).toFixed(2)
  });
  res.json(orderDTO(o));
}));

/* ══════════════════ INVOICING (admin) ══════════════════ */
app.post("/api/invoices/consolidate", requireAuth("admin"), wrap(async (req, res) => {
  const docs = await store.listErpDocs();
  const pend = docs.dn.filter(d => !d.invoiced);
  if (!pend.length) return res.status(422).json({ error: "No delivery notes pending invoicing" });
  const byCust = {};
  pend.forEach(d => { (byCust[d.customer] = byCust[d.customer] || []).push(d); });
  const created = [];
  for (const [cid, dns] of Object.entries(byCust)) {
    const ref = "INV" + (await store.nextSeq("inv"));
    const inv = {
      ref, at: new Date().toISOString(), customer: cid, customerName: dns[0].customerName,
      dns: dns.map(d => d.ref), lines: dns.flatMap(d => d.lines),
      total: +dns.reduce((s, d) => s + d.total, 0).toFixed(2)
    };
    await safeCall("postInvoice", inv);
    for (const d of dns) await store.updateErpDoc("dn", d.ref, { invoiced: true });
    created.push(inv);
  }
  res.json({ invoices: created });
}));

/* ══════════════════ ADMIN: users & masters, ERP console ══════════════════ */
app.get("/api/admin/users", requireAuth("admin"), wrap(async (req, res) => {
  res.json((await store.listProfiles()).map(pub));
}));

app.patch("/api/admin/users/:id", requireAuth("admin"), wrap(async (req, res) => {
  const allowed = ["role", "customer", "dept", "priceList", "active", "empId", "name", "phone"];
  const patch = {};
  for (const k of allowed) if (k in (req.body || {})) patch[k] = req.body[k];
  if (patch.role && !["employee", "approver", "admin"].includes(patch.role))
    return res.status(400).json({ error: "role must be employee|approver|admin" });
  const p = await store.updateProfile(req.params.id, patch);
  if (!p) return res.status(404).json({ error: "User not found" });
  res.json(pub(p));
}));

app.delete("/api/admin/users/:id", requireAuth("admin"), wrap(async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: "Use account deletion for your own account" });
  await authsvc.deleteAccount(req.params.id);
  res.json({ ok: true });
}));

app.get("/api/masters", requireAuth("admin", "approver"), wrap(async (req, res) => {
  res.json(await masters());
}));

app.get("/api/erp/documents", requireAuth("admin", "approver"), wrap(async (req, res) => {
  res.json(await store.listErpDocs());
}));

app.get("/api/health", wrap(async (req, res) => {
  res.json({ ok: true, storage: store.mode, auth: authsvc.SUPA ? "supabase" : "local-demo", erp: process.env.ERP_PROVIDER || "focus9-stub" });
}));

/* ══════════════════ boot ══════════════════ */
if (require.main === module) {
  // Run as a normal server (local dev / VPS). On Vercel this file is imported
  // by api/index.js instead and requests are handled serverlessly.
  store.init().then(() => {
    app.listen(PORT, () => {
      console.log(`PROSAFE middleware v2 on http://0.0.0.0:${PORT}`);
      console.log(`  storage: ${store.mode}   auth: ${authsvc.SUPA ? "supabase" : "local-demo (password: prosafe1)"}   erp: ${process.env.ERP_PROVIDER || "focus9-stub"}`);
    });
  }).catch(e => {
    console.error("Store init failed:", e.message);
    console.error("If using Supabase: run supabase/schema.sql and seed.sql in the SQL editor first.");
    process.exit(1);
  });
}

module.exports = app;
