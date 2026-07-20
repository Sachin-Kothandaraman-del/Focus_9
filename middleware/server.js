/**
 * PROSAFE × EGA — Middleware / Business Logic Layer
 * Mobile app ⇄ THIS SERVER ⇄ ERP (Focus9 stub | ERPNext live)
 *
 * Security per "Mobile App security" doc:
 *  - JWT token auth (no ERP credentials ever reach the mobile app)
 *  - App never talks to the ERP directly; this layer validates + transforms
 *  - Serve behind HTTPS in production (reverse proxy e.g. nginx/Caddy)
 */
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const db = require("./db");
const { safeCall } = require("./erp");

const app = express();
app.use(cors());
app.use(express.json());

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const PORT = process.env.PORT || 4000;
const CANCEL_WINDOW_MIN = 15;

/* ---------------- auth ---------------- */
app.post("/api/auth/login", (req, res) => {
  const { empId, pin } = req.body || {};
  const e = db.emp(String(empId || "").toUpperCase().trim());
  if (!e || e.pin !== String(pin || "")) return res.status(401).json({ error: "Invalid Employee ID or PIN" });
  const token = jwt.sign({ id: e.id, role: e.role }, SECRET, { expiresIn: "12h" });
  const { pin: _p, ...user } = e;
  res.json({ token, user, customer: e.customer ? db.cust(e.customer) : null });
});

function auth(...roles) {
  return (req, res, next) => {
    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : null;
    try {
      const payload = jwt.verify(token, SECRET);
      req.user = db.emp(payload.id);
      if (!req.user) throw new Error("no user");
      if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error: "Forbidden for role " + req.user.role });
      next();
    } catch (e) {
      res.status(401).json({ error: "Unauthorized" });
    }
  };
}

/* ---------------- catalog (employee) ---------------- */
app.get("/api/catalog", auth("employee"), (req, res) => {
  const p = db.pl(req.user.priceList);
  if (!p) return res.status(404).json({ error: "No approved price list assigned" });
  const lines = p.lines.map(l => ({
    ...l, item: db.item(l.code),
    allocated: db.allocFor(req.user.id, l.code),
    used: db.consumed(req.user.id, l.code),
    balance: db.balanceFor(req.user.id, l.code)
  }));
  res.json({
    priceList: { id: p.id, name: p.name, contract: p.contract, validFrom: p.validFrom, validTill: p.validTill },
    customer: db.cust(p.customer),
    contracts: db.load().priceLists.map(x => ({ contract: x.contract, name: x.name })),
    lines
  });
});

app.get("/api/profile", auth(), (req, res) => {
  const { pin, ...user } = req.user;
  const p = user.priceList ? db.pl(user.priceList) : null;
  res.json({
    user, customer: user.customer ? db.cust(user.customer) : null,
    priceList: p ? { id: p.id, name: p.name, contract: p.contract } : null,
    approvedQtyList: p ? p.lines.map(l => ({
      code: l.code, name: db.item(l.code).name, uom: db.item(l.code).uom, restricted: l.restricted,
      allocated: db.allocFor(user.id, l.code), used: db.consumed(user.id, l.code), balance: db.balanceFor(user.id, l.code)
    })) : []
  });
});

/* ---------------- orders ---------------- */
function orderDTO(o) {
  const e = db.emp(o.emp);
  return { ...o, empName: e ? e.name : o.emp, customerName: db.cust(o.customer)?.name,
    cancellable: o.status === "in_progress" && (Date.now() - Date.parse(o.createdAt)) < CANCEL_WINDOW_MIN * 60000 };
}

/** Place an order. kind: "order" (within limits) | "approval" */
app.post("/api/orders", auth("employee"), async (req, res) => {
  const { kind, lines: reqLines, contract } = req.body || {};
  if (!["order", "approval"].includes(kind)) return res.status(400).json({ error: "kind must be order|approval" });
  if (!Array.isArray(reqLines) || !reqLines.length) return res.status(400).json({ error: "lines required" });
  const p = db.pl(req.user.priceList);
  if (!p) return res.status(400).json({ error: "No approved price list" });

  // validate + price every line server-side (never trust client prices)
  const built = [];
  for (const rl of reqLines) {
    const l = db.plLine(p.id, rl.code);
    const qty = Number(rl.qty);
    if (!l) return res.status(400).json({ error: `Item ${rl.code} is not on your approved price list` });
    if (!(qty > 0)) return res.status(400).json({ error: `Invalid qty for ${rl.code}` });
    built.push({ code: rl.code, qty, uom: db.item(rl.code).uom, price: l.price, restricted: l.restricted });
  }
  if (kind === "order") {
    for (const b of built) {
      if (b.restricted) return res.status(422).json({ error: `${b.code} is restricted — send via approval cart`, needsApproval: true });
      if (b.qty > db.balanceFor(req.user.id, b.code))
        return res.status(422).json({ error: `${b.code} exceeds allocated balance — send via approval cart`, needsApproval: true });
    }
  }

  const d = db.load();
  const ref = db.nextSeq("or", "OR");
  const lines = built.map((b, ix) => ({
    lineRef: `${ref}/${String(ix + 1).padStart(3, "0")}`,
    code: b.code, qty: b.qty, uom: b.uom, price: b.price,
    amount: +(b.qty * b.price).toFixed(2), received: 0
  }));
  const order = {
    ref, contract: contract || p.contract, emp: req.user.id, dept: req.user.dept,
    customer: p.customer, priceList: p.id, createdAt: new Date().toISOString(),
    status: kind === "order" ? "in_progress" : "pending_approval",
    lines, total: +lines.reduce((s, l) => s + l.amount, 0).toFixed(2),
    so: null, dns: [],
    history: [{ at: new Date().toISOString(), ev: `Order placed (${kind === "order" ? "Order Cart" : "Approval Cart"})` }]
  };
  d.orders.unshift(order);

  if (kind === "order") {
    lines.forEach(l => db.addConsumption(req.user.id, l.code, l.qty));
    const r = await safeCall("createSalesOrder", order);
    if (r && r.soRef) { order.so = r.soRef; order.history.push({ at: new Date().toISOString(), ev: `ERP SO ${r.soRef} created` }); }
  } else {
    db.erpLog(`Order ${ref} (${req.user.name}) held in middleware — awaiting EGA client approval`);
  }
  db.save();
  res.status(201).json(orderDTO(order));
});

app.get("/api/orders", auth(), (req, res) => {
  const d = db.load();
  let list = d.orders;
  if (req.user.role === "employee") list = list.filter(o => o.emp === req.user.id);
  if (req.user.role === "approver" && req.query.pending === "1") list = list.filter(o => o.status === "pending_approval");
  res.json(list.map(orderDTO));
});

app.get("/api/orders/:ref", auth(), (req, res) => {
  const o = db.load().orders.find(x => x.ref === req.params.ref);
  if (!o) return res.status(404).json({ error: "Not found" });
  if (req.user.role === "employee" && o.emp !== req.user.id) return res.status(403).json({ error: "Not your order" });
  res.json(orderDTO(o));
});

/* cancel within 15 minutes */
app.post("/api/orders/:ref/cancel", auth("employee"), async (req, res) => {
  const o = db.load().orders.find(x => x.ref === req.params.ref && x.emp === req.user.id);
  if (!o) return res.status(404).json({ error: "Not found" });
  if (o.status !== "in_progress") return res.status(422).json({ error: "Only in-progress orders can be cancelled" });
  if (Date.now() - Date.parse(o.createdAt) >= CANCEL_WINDOW_MIN * 60000)
    return res.status(422).json({ error: `The ${CANCEL_WINDOW_MIN}-minute cancellation window has passed` });
  o.status = "cancelled";
  o.history.push({ at: new Date().toISOString(), ev: "Cancelled by employee within 15-min window" });
  o.lines.forEach(l => db.addConsumption(o.emp, l.code, -l.qty));
  if (o.so) await safeCall("cancelSalesOrder", o.so);
  db.save();
  res.json(orderDTO(o));
});

/* approve / reject (approver) */
app.post("/api/orders/:ref/approve", auth("approver"), async (req, res) => {
  const o = db.load().orders.find(x => x.ref === req.params.ref);
  if (!o || o.status !== "pending_approval") return res.status(422).json({ error: "Order is not awaiting approval" });
  o.lines.forEach(l => {
    const bal = db.balanceFor(o.emp, l.code);
    if (l.qty > bal) db.addExtra(o.emp, l.code, l.qty - bal); // raise approved qty list
    db.addConsumption(o.emp, l.code, l.qty);
  });
  o.status = "in_progress";
  o.history.push({ at: new Date().toISOString(), ev: `Approved by ${req.user.name} (EGA) — approved qty list updated` });
  const r = await safeCall("createSalesOrder", o);
  if (r && r.soRef) { o.so = r.soRef; o.history.push({ at: new Date().toISOString(), ev: `ERP SO ${r.soRef} created` }); }
  db.save();
  res.json(orderDTO(o));
});

app.post("/api/orders/:ref/reject", auth("approver"), (req, res) => {
  const o = db.load().orders.find(x => x.ref === req.params.ref);
  if (!o || o.status !== "pending_approval") return res.status(422).json({ error: "Order is not awaiting approval" });
  o.status = "rejected";
  o.history.push({ at: new Date().toISOString(), ev: `Rejected by ${req.user.name} (EGA)${req.body?.reason ? " — " + req.body.reason : ""}` });
  db.erpLog(`Order ${o.ref} rejected by ${req.user.name}`);
  db.save();
  res.json(orderDTO(o));
});

/* delivery note (admin) */
app.post("/api/orders/:ref/delivery-note", auth("admin"), async (req, res) => {
  const o = db.load().orders.find(x => x.ref === req.params.ref);
  if (!o || o.status !== "in_progress") return res.status(422).json({ error: "Order has no open SO awaiting delivery" });
  const dnRef = db.nextSeq("dn", "DO");
  const r = await safeCall("createDeliveryNote", o, dnRef);
  const finalRef = (r && r.dnRef) || dnRef;
  o.dns.push(finalRef);
  o.status = "do_created";
  o.history.push({ at: new Date().toISOString(), ev: `Delivery Note ${finalRef} created — delivery to the person` });
  db.save();
  res.json(orderDTO(o));
});

/* receipt acknowledgement (employee) */
app.post("/api/orders/:ref/receive", auth("employee"), (req, res) => {
  const o = db.load().orders.find(x => x.ref === req.params.ref && x.emp === req.user.id);
  if (!o) return res.status(404).json({ error: "Not found" });
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
  db.erpLog(`Receipt acknowledgement for ${o.ref} (${full ? "full" : "partial"}) — order quantities updated`);
  db.save();
  res.json(orderDTO(o));
});

/* material return (employee) */
app.post("/api/orders/:ref/return", auth("employee"), async (req, res) => {
  const o = db.load().orders.find(x => x.ref === req.params.ref && x.emp === req.user.id);
  if (!o) return res.status(404).json({ error: "Not found" });
  if (o.status !== "complete") return res.status(422).json({ error: "Only completed orders can be returned" });
  const retLines = [];
  for (const rl of req.body?.lines || []) {
    const l = o.lines.find(x => x.lineRef === rl.lineRef);
    if (!l) continue;
    const v = Math.max(0, Math.min(l.received, Number(rl.qty) || 0));
    if (v > 0) retLines.push({ lineRef: l.lineRef, code: l.code, qty: v, uom: l.uom, price: l.price });
  }
  if (!retLines.length) return res.status(400).json({ error: "No returnable quantities supplied" });
  const ref = db.nextSeq("ret", "RT");
  retLines.forEach(rl => {
    db.addConsumption(o.emp, rl.code, -rl.qty);
    const ol = o.lines.find(x => x.lineRef === rl.lineRef);
    ol.received -= rl.qty; ol.qty -= rl.qty; ol.amount = +(ol.qty * ol.price).toFixed(2);
  });
  o.total = +o.lines.reduce((s, l) => s + l.amount, 0).toFixed(2);
  o.history.push({ at: new Date().toISOString(), ev: `Return ${ref} submitted — approved qty list credited` });
  const ret = { ref, at: new Date().toISOString(), order: o.ref, so: o.so, emp: o.emp, customer: o.customer,
    lines: retLines, total: +retLines.reduce((s, l) => s + l.qty * l.price, 0).toFixed(2) };
  await safeCall("postReturn", ret);
  db.save();
  res.json(orderDTO(o));
});

/* DO consolidation → invoice to EGA (admin) */
app.post("/api/invoices/consolidate", auth("admin"), async (req, res) => {
  const d = db.load();
  const pend = d.erp.dn.filter(x => !x.invoiced);
  if (!pend.length) return res.status(422).json({ error: "No delivery notes pending invoicing" });
  const byCust = {};
  pend.forEach(x => { (byCust[x.customer] = byCust[x.customer] || []).push(x); });
  const created = [];
  for (const [cid, dns] of Object.entries(byCust)) {
    const ref = db.nextSeq("inv", "INV");
    const lines = dns.flatMap(x => x.lines);
    const inv = { ref, at: new Date().toISOString(), customer: cid, dns: dns.map(x => x.ref),
      lines, total: +dns.reduce((s, x) => s + x.total, 0).toFixed(2) };
    await safeCall("postInvoice", inv);
    dns.forEach(x => { x.invoiced = true; });
    created.push(inv);
  }
  db.save();
  res.json({ invoices: created });
});

/* ---------------- ERP console & masters (admin) ---------------- */
app.get("/api/erp/documents", auth("admin", "approver"), (req, res) => {
  res.json(db.load().erp);
});
app.get("/api/masters", auth("admin"), (req, res) => {
  const d = db.load();
  res.json({
    customers: d.customers, departments: d.departments, locations: d.locations,
    uoms: d.uoms, items: d.items, priceLists: d.priceLists,
    employees: d.employees.map(({ pin, ...e }) => e)
  });
});
app.post("/api/admin/reset-demo", auth("admin"), (req, res) => { db.reset(); res.json({ ok: true }); });

app.get("/api/health", (req, res) => res.json({ ok: true, erp: process.env.ERP_PROVIDER || "focus9-stub" }));

app.listen(PORT, () => {
  db.load();
  console.log(`PROSAFE middleware listening on http://0.0.0.0:${PORT}  (ERP: ${process.env.ERP_PROVIDER || "focus9-stub"})`);
});
