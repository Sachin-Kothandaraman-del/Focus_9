/**
 * PROSAFE × EGA — Middleware / Business Logic Layer  v3 (Mobile App SRS2, 25-08-26)
 *   Mobile app + Web portal ⇄ THIS SERVER ⇄ Supabase (DB + Auth) ⇄ ERP (ERPNext live / Focus9 stub)
 *
 * SRS2 highlights implemented here:
 *   · Masters: Customer, Contract, Employee, Department, Location, Division,
 *     Stores (Main + Reservation), Groups & Categories, UOM, Item, Price List
 *     (header: code/description/validity/delivery period + allocation table)
 *   · Server-side carts that RESERVE stock from the Main store on picking,
 *     with a 10-minute window — expired carts are emptied and stock released
 *   · Within-limit → Order Cart · over-limit → Approval Cart (both debit Used Qty)
 *   · Order placement stock-transfers reserved qty Main → Reservation store
 *     through Issue + Receipt vouchers; DOs are created from the Reservation store
 *   · Delivery-period rules: stock available → delivery date = order date +
 *     delivery period; no stock → "DOD to be advised"; partial stock → line split
 *   · Approval window 3 days — expired approvals auto-cancel and credit back
 *   · Re-save (single + bulk): fills DOD lines when Main-store stock arrives
 *   · Receipt Voucher process REMOVED (employee acknowledges the DO directly)
 *   · Returns (RMA): within 3 days of receipt, store confirms ("Return
 *     Confirmation") → credits price list + stock, raises a Credit Note
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
/* Real product photos (data URIs) keyed by item code. Kept in code rather than
   in the database so master data stays small; see tools/build-item-images.py. */
const ITEM_IMAGES = require("./store/item-images");
const imgOf = item => (item && (item.img || ITEM_IMAGES[item.code])) || null;

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const CART_WINDOW_MIN = 10;      // SRS2: max 10 minutes to place the order after picking
const CANCEL_WINDOW_MIN = 15;    // employee self-cancellation window
const APPROVAL_WINDOW_DAYS = 3;  // SRS2: max 3 days for EGA approval
const RETURN_WINDOW_DAYS = 3;    // SRS2: returns allowed within 3 days of receipt
const requireAuth = authsvc.requireAuth;

/* Roles = the SRS2 modules, kept strictly separate:
     employee — Employee Module:  Shopping, Carts, My Orders, My Limits
     approver — EGA client approval
     store    — Store Module:     Fulfilment, Inventory, All Orders
     admin    — Admin Module:     Users (log-in control & shopping profiles)
                                  and Masters. NOT the Store Module — an admin
                                  who also needs to fulfil orders is given a
                                  separate account with the store role. */
const STORES_ROLES = ["store"];
const isStores = u => !!u && STORES_ROLES.includes(u.role);

/* One log-in may hold BOTH the employee and the approver role (SRS2 Sept-26:
   "assign the role either as Employee (OR) Approver (OR) Both") and switch
   between the two modules with POST /api/profile/role. The Store and Admin
   modules stay standalone — a store or admin log-in holds that role alone.
     profile.roles — every module this log-in may use
     profile.role  — the module currently in use (always a member of roles) */
const ALL_ROLES = ["employee", "approver", "store", "admin"];
const SWITCHABLE = ["employee", "approver"];
const rolesOf = u => {
  const r = Array.isArray(u && u.roles) && u.roles.length ? u.roles : [u && u.role].filter(Boolean);
  return ALL_ROLES.filter(x => r.includes(x));           // de-duplicated, in module order
};
function validateRoles(list) {
  if (!Array.isArray(list) || !list.length) return "Assign at least one role";
  for (const r of list) if (!ALL_ROLES.includes(r)) return `Unknown role '${r}' — use ${ALL_ROLES.join("|")}`;
  const uniq = [...new Set(list)];
  if (uniq.length > 1 && uniq.some(r => !SWITCHABLE.includes(r)))
    return "Only the employee and approver roles can be combined in one log-in — store and admin log-ins hold that role alone";
  return null;
}

/* Serverless-friendly init gate + periodic sweeps (cart expiry / approval expiry). */
let _ready = null;
app.use((req, res, next) => {
  _ready = _ready || store.init();
  _ready
    .then(() => sweepAll().catch(() => {}))
    .then(() => next())
    .catch(e => {
      _ready = null;
      res.status(503).json({ error: "Database not ready: " + e.message + ". If using Supabase, run supabase/schema.sql and seed.sql first." });
    });
});

const wrap = fn => (req, res) => fn(req, res).catch(e => {
  console.error(e);
  res.status(e.status || 500).json({ error: e.message || "Server error" });
});

const masters = () => store.masters();
const round2 = n => +Number(n || 0).toFixed(2);
const nowIso = () => new Date().toISOString();
const addDays = (iso, days) => {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const targetQty = l => Math.max(0, Number(l.approvedQty ?? l.orderedQty ?? l.qty) || 0);
const userPls = u => Array.isArray(u.priceLists) && u.priceLists.length ? u.priceLists
  : (u.priceList ? [u.priceList] : []);
const isPending = u => u.role === "employee" && (!u.active || !userPls(u).length);

function pub(profile) {
  const { id, email, name, phone, telephone, username, empId, role, customer, dept, location, priceList, fromStore, toStore, active } = profile;
  return {
    id, email, name, phone, telephone: telephone || "", username: username || "", empId,
    role, roles: rolesOf(profile), customer, dept, location,
    priceLists: userPls(profile), priceList, fromStore, toStore, active
  };
}

async function findItem(m, code) { return m.items.find(i => i.code === code); }
function plById(m, id) { return m.priceLists.find(p => p.id === id); }
function plLineFor(pl, code) { return pl.lines.find(l => (l.codes || []).includes(code)); }
const lineKey = (plId, line) => `${plId}#${line.sl}`;
function mainStoreOf(m, u) {
  return (u && u.fromStore) || (m.stores.find(s => s.type === "main") || {}).code || null;
}
function resStoreOf(m, u) {
  return (u && u.toStore) || (m.stores.find(s => s.type === "reservation") || {}).code || null;
}
function plValidToday(pl) {
  const today = new Date().toISOString().slice(0, 10);
  return (!pl.validFrom || pl.validFrom <= today) && (!pl.validTill || today <= pl.validTill);
}

/* Allocation balances per price list line ("Approved Price List" accounting). */
async function balancesFor(userId, plId) {
  const m = await masters();
  const p = plById(m, plId);
  if (!p) return { pl: null, lines: [], totals: { allocatedAmount: 0, usedAmount: 0 } };
  const { consumption, extra } = await store.getAlloc(userId);
  const lines = p.lines.map(l => {
    const key = lineKey(p.id, l);
    const allocated = (Number(l.alloc) || 0) + (extra[key] || 0);
    const used = consumption[key] || 0;
    return {
      ...l, key, allocated, used, balance: allocated - used,
      allocatedAmount: round2(allocated * l.price), usedAmount: round2(used * l.price)
    };
  });
  const totals = {
    allocatedAmount: round2(lines.reduce((s, l) => s + l.allocatedAmount, 0)),
    usedAmount: round2(lines.reduce((s, l) => s + l.usedAmount, 0))
  };
  return { pl: p, lines, totals };
}

/* ══════════════════ stock helpers (Issue + Receipt voucher transfers) ══════════════════ */
async function stockTransfer({ from, to, lines, order, reason, by }) {
  const moved = lines.filter(l => l.qty > 0);
  if (!moved.length) return null;
  for (const l of moved) await store.adjustStock(from, l.code, -l.qty);
  for (const l of moved) await store.adjustStock(to, l.code, +l.qty);
  const n = await store.nextSeq("stv");
  const doc = {
    ref: `ST${n}`, issueRef: `IS${n}`, receiptRef: `RC${n}`,
    at: nowIso(), from, to, order: order || null, reason: reason || "", by: by || "system",
    lines: moved.map(l => ({ code: l.code, qty: l.qty, uom: l.uom || "" })),
    total: null
  };
  await store.addErpDoc("stv", doc);
  await safeCall("createStockTransfer", doc);
  return doc;
}

/* ══════════════════ sweeps: cart expiry (10 min) + approval expiry (3 days) ══════════════════ */
let lastSweep = 0;
async function sweepAll() {
  if (Date.now() - lastSweep < 15000) return;
  lastSweep = Date.now();
  await sweepCarts();
  await sweepApprovals();
}

async function sweepCarts() {
  const carts = await store.allCarts();
  for (const [userId, cart] of Object.entries(carts || {})) {
    if (!cart.startedAt || Date.now() - Date.parse(cart.startedAt) < CART_WINDOW_MIN * 60000) continue;
    const release = {};
    for (const l of cart.lines) {
      if (l.reservedQty > 0) release[l.code] = (release[l.code] || 0) + l.reservedQty;
    }
    for (const [code, qty] of Object.entries(release)) await store.adjustStock(cart.fromStore, code, qty);
    await store.saveCart(userId, null);
    await store.addNotification(userId,
      `Your shopping cart expired (${CART_WINDOW_MIN}-minute limit). The picked quantities were released back to the Main store — please shop again.`);
    await store.erpLog(`Cart of user ${userId} expired after ${CART_WINDOW_MIN} min — reserved stock released to ${cart.fromStore}`);
  }
}

async function sweepApprovals() {
  const orders = await store.listOrders();
  for (const o of orders) {
    if (o.status !== "pending_approval") continue;
    const deadline = o.approvalDeadline ? Date.parse(o.approvalDeadline)
      : Date.parse(o.createdAt) + APPROVAL_WINDOW_DAYS * 86400000;
    if (Date.now() < deadline) continue;
    await releaseOrder(o, { cancelUndelivered: true });
    o.status = "cancelled";
    o.history.push({ at: nowIso(), ev: `Auto-cancelled — the ${APPROVAL_WINDOW_DAYS}-day approval window expired; quantities credited back to the Main store and price list` });
    await store.saveOrder(o);
    await store.addNotification(o.emp, `Order ${o.ref} was cancelled automatically: not approved within ${APPROVAL_WINDOW_DAYS} days. Quantities were credited back.`);
    await store.erpLog(`Order ${o.ref} auto-cancelled (approval window expired)`);
  }
}

/* Credit consumption for undelivered qtys + return remaining reserved stock to Main. */
async function releaseOrder(o, { cancelUndelivered }) {
  const back = [];
  for (const l of o.lines) {
    const undelivered = Math.max(0, targetQty(l) - (l.delivered || 0));
    if (cancelUndelivered && undelivered > 0 && l.key) await store.addConsumption(o.emp, l.key, -undelivered);
    if ((l.reservedQty || 0) > 0) {
      back.push({ code: l.code, qty: l.reservedQty, uom: l.uom });
      l.reservedQty = 0;
    }
  }
  if (back.length) {
    await stockTransfer({
      from: o.toStore, to: o.fromStore, lines: back, order: o.ref,
      reason: "Release reserved stock back to Main store"
    });
  }
}

/* ══════════════════ order shaping ══════════════════ */
function normalizeOrder(o) {
  o.dns = Array.isArray(o.dns) ? o.dns : [];
  o.deliveries = Array.isArray(o.deliveries) ? o.deliveries : [];
  o.returns = Array.isArray(o.returns) ? o.returns : [];
  for (const l of o.lines || []) {
    l.orderedQty = Math.max(0, Number(l.orderedQty ?? l.qty) || 0);
    l.approvedQty = Math.max(0, Math.min(l.orderedQty, Number(l.approvedQty ?? l.orderedQty) || 0));
    l.delivered = Math.max(0, Number(l.delivered) || 0);
    l.received = Math.max(0, Number(l.received) || 0);
    l.returned = Math.max(0, Number(l.returned) || 0);
    l.reservedQty = Math.max(0, Number(l.reservedQty) || 0);
    l.stock = l.stock === true || l.stock === "Yes";
    l.deliveryDate = l.deliveryDate || null;
    l.remark = l.remark || (l.stock ? "" : "DOD to be advised");
  }
  return o;
}

function fulfilmentStatus(o) {
  if (o.lines.every(l => l.received >= targetQty(l))) return "complete";
  if (o.lines.some(l => l.received > 0)) return "partially_received";
  if (o.lines.every(l => l.delivered >= targetQty(l))) return "do_created";
  if (o.lines.some(l => l.delivered > 0)) return "partially_delivered";
  return "in_progress";
}

function orderDTO(o) {
  normalizeOrder(o);
  const lines = o.lines.map(l => ({
    ...l,
    stock: l.stock ? "Yes" : "No",
    awaitingReceipt: Math.max(0, l.delivered - l.received),
    notDelivered: Math.max(0, targetQty(l) - l.delivered)
  }));
  return {
    ...o, lines,
    pendingReturns: o.returns.filter(r => r.status === "pending").length,
    cancellable: o.status === "in_progress" &&
      o.lines.every(l => (l.delivered || 0) === 0) &&
      Date.now() - Date.parse(o.createdAt) < CANCEL_WINDOW_MIN * 60000,
    resavable: ["in_progress", "partially_delivered", "do_created", "partially_received"].includes(o.status) &&
      o.lines.some(l => targetQty(l) - l.delivered - l.reservedQty > 0)
  };
}

/* ══════════════════ AUTH & ACCOUNT LIFECYCLE ══════════════════ */

/* SRS2 registration screen: the employee types Employee ID + Mobile Phone and
   the rest of the form is filled in from the Employee Master. Two data points
   must match; if they do not, registration is refused. */
app.post("/api/auth/employee-lookup", wrap(async (req, res) => {
  const { empId, phone } = req.body || {};
  const emp = await authsvc.matchEmployee({ empId, phone });
  const m = await masters();
  res.json({
    ok: true,
    employee: {
      empId: emp.empId, name: emp.name || "", phone: emp.phone || "",
      telephone: emp.telephone || "", email: emp.email || "",
      customer: emp.customer || null,
      customerName: (m.customers.find(c => c.id === emp.customer) || {}).name || emp.customer || "",
      dept: emp.dept || null,
      deptName: (m.departments.find(d => d.code === emp.dept) || {}).name || emp.dept || "",
      location: emp.location || null,
      locationName: (m.locations.find(l => l.code === emp.location) || {}).name || emp.location || ""
    },
    limits: authsvc.LIMITS,
    minPassword: authsvc.MIN_PASSWORD
  });
}));

app.post("/api/auth/signup", wrap(async (req, res) => {
  const { profile, session, pendingActivation } = await authsvc.signup(req.body || {});
  res.status(201).json({
    user: pub(profile),
    token: session ? session.token : null,
    refreshToken: session ? session.refreshToken : null,
    pendingActivation,
    emailConfirmationRequired: !session && authsvc.SUPA,
    message: pendingActivation
      ? "Registration complete — your profile is Pending for Activation. A PROSAFE admin will assign your price list and stores."
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
    pendingActivation: isPending(profile)
  });
}));

app.post("/api/auth/refresh", wrap(async (req, res) => {
  res.json(await authsvc.refresh((req.body || {}).refreshToken));
}));

app.delete("/api/auth/account", requireAuth(), wrap(async (req, res) => {
  await clearCartInternal(req.user, null);
  await authsvc.deleteAccount(req.user.id);
  await store.erpLog(`Account deleted on user request: ${req.user.email} (${req.user.empId})`);
  res.json({ ok: true, message: "Your account and personal data have been deleted." });
}));

/* ══════════════════ PROFILE (My Limits) ══════════════════ */
app.get("/api/profile", requireAuth(), wrap(async (req, res) => {
  const m = await masters();
  const u = req.user;
  const priceLists = [];
  for (const plId of userPls(u)) {
    const { pl, lines, totals } = await balancesFor(u.id, plId);
    if (!pl) continue;
    priceLists.push({
      id: pl.id, name: pl.name, desc: pl.desc, contract: pl.contract,
      validFrom: pl.validFrom, validTill: pl.validTill, deliveryPeriod: pl.deliveryPeriod,
      totals,
      approvedQtyList: lines.map(l => ({
        key: l.key, sl: l.sl, uom: l.uom, price: l.price, restricted: l.restricted,
        allocated: l.allocated, used: l.used, balance: l.balance,
        allocatedAmount: l.allocatedAmount, usedAmount: l.usedAmount,
        items: l.codes.map(c => {
          const i = m.items.find(x => x.code === c) || { code: c, name: c };
          return { code: i.code, name: i.name };
        })
      }))
    });
  }
  res.json({
    user: pub(u),
    customer: u.customer ? m.customers.find(c => c.id === u.customer) : null,
    department: u.dept ? m.departments.find(d => d.code === u.dept || d.name === u.dept) : null,
    location: u.location ? m.locations.find(l => l.code === u.location) : null,
    priceLists,
    pendingActivation: isPending(u)
  });
}));

/* Switch between the modules this log-in holds (employee ⇄ approver).
   requireAuth() checks the ACTIVE role, so the switch is what opens or closes
   each module for the session. */
app.post("/api/profile/role", requireAuth(), wrap(async (req, res) => {
  const role = String((req.body || {}).role || "").trim();
  const held = rolesOf(req.user);
  if (!held.includes(role))
    return res.status(403).json({ error: `This log-in does not hold the ${role || "requested"} role` });
  if (role === req.user.role) return res.json(pub(req.user));
  await clearCartInternal(req.user, null);      // leaving the Employee Module releases any held stock
  const p = await store.updateProfile(req.user.id, { role });
  res.json(pub(p));
}));

/* ══════════════════ NOTIFICATIONS ══════════════════ */
app.get("/api/notifications", requireAuth(), wrap(async (req, res) => {
  const list = await store.listNotifications(req.user.id);
  res.json({ notifications: list.slice(0, 50), unread: list.filter(n => !n.read).length });
}));
app.post("/api/notifications/read", requireAuth(), wrap(async (req, res) => {
  await store.markNotificationsRead(req.user.id);
  res.json({ ok: true });
}));

/* ══════════════════ CATALOG — one shopping profile per assigned price list ══════════════════ */
app.get("/api/catalog", requireAuth("employee"), wrap(async (req, res) => {
  const u = req.user;
  if (isPending(u))
    return res.status(403).json({ error: "Your account is awaiting activation by the PROSAFE admin", pendingActivation: true });
  const m = await masters();
  const inv = await store.getInventory();
  const mainStore = mainStoreOf(m, u);
  const stockOf = code => (inv[mainStore] && inv[mainStore][code]) || 0;
  const profiles = [];
  for (const plId of userPls(u)) {
    const { pl, lines, totals } = await balancesFor(u.id, plId);
    if (!pl) continue;
    const contract = m.contracts.find(c => c.ref === pl.contract);
    profiles.push({
      priceList: {
        id: pl.id, name: pl.name, desc: pl.desc, contract: pl.contract,
        validFrom: pl.validFrom, validTill: pl.validTill,
        deliveryPeriod: pl.deliveryPeriod, validToday: plValidToday(pl)
      },
      contract: contract || null,
      customer: m.customers.find(c => c.id === (pl.customer || u.customer)) || null,
      fromStore: mainStore, toStore: resStoreOf(m, u),
      totals,
      lines: lines.map(l => ({
        key: l.key, sl: l.sl, uom: l.uom, price: l.price, restricted: l.restricted,
        allocated: l.allocated, used: l.used, balance: l.balance,
        allocatedAmount: l.allocatedAmount, usedAmount: l.usedAmount,
        /* Group and Category come straight off the item — there is no Group or
           Category master; the shopping screen groups by these labels. */
        group: (m.items.find(i => i.code === l.codes[0]) || {}).group || null,
        cat: (m.items.find(i => i.code === l.codes[0]) || {}).cat || null,
        items: l.codes.map(c => {
          const i = m.items.find(x => x.code === c) || { code: c, name: c, uom: l.uom, pic: "📦" };
          return { code: i.code, name: i.name, uom: i.uom, pic: i.pic, img: imgOf(i), stock: stockOf(c) };
        })
      }))
    });
  }
  res.json({ profiles });
}));

/* ══════════════════ SERVER-SIDE CART (reserves Main-store stock, 10-min window) ══════════════════ */
async function cartDTO(u) {
  const m = await masters();
  const cart = (await store.getCart(u.id)) || { startedAt: null, lines: [] };
  const shape = l => {
    const item = m.items.find(i => i.code === l.code) || { name: l.code, pic: "📦" };
    const pl = plById(m, l.plId);
    const dp = pl ? pl.deliveryPeriod : 0;
    return {
      ...l, name: item.name, pic: item.pic, img: imgOf(item),
      amount: round2(l.qty * l.price),
      stockStatus: l.reservedQty >= l.qty ? "yes" : l.reservedQty > 0 ? "partial" : "no",
      deliveryDate: l.reservedQty > 0 ? addDays(nowIso(), dp) : null,
      dodQty: Math.max(0, l.qty - l.reservedQty)
    };
  };
  const expiresAt = cart.startedAt ? new Date(Date.parse(cart.startedAt) + CART_WINDOW_MIN * 60000).toISOString() : null;
  return {
    startedAt: cart.startedAt, expiresAt,
    remainingSec: expiresAt ? Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000)) : null,
    fromStore: cart.fromStore || null, toStore: cart.toStore || null,
    order: cart.lines.filter(l => l.kind === "order").map(shape),
    approval: cart.lines.filter(l => l.kind === "approval").map(shape)
  };
}

async function clearCartInternal(u, kind) {
  const cart = await store.getCart(u.id);
  if (!cart) return;
  const keep = [], release = {};
  for (const l of cart.lines) {
    if (kind && l.kind !== kind) { keep.push(l); continue; }
    if (l.reservedQty > 0) release[l.code] = (release[l.code] || 0) + l.reservedQty;
  }
  for (const [code, qty] of Object.entries(release)) await store.adjustStock(cart.fromStore, code, qty);
  cart.lines = keep;
  if (!keep.length) await store.saveCart(u.id, null);
  else await store.saveCart(u.id, cart);
}

app.get("/api/cart", requireAuth("employee"), wrap(async (req, res) => {
  res.json(await cartDTO(req.user));
}));

/* Add (qty>0) or reduce (qty<0) an item. Body: { plId, code, qty, toApproval } */
app.post("/api/cart/items", requireAuth("employee"), wrap(async (req, res) => {
  const u = req.user;
  if (isPending(u)) return res.status(403).json({ error: "Account awaiting activation", pendingActivation: true });
  const { plId, code, toApproval } = req.body || {};
  const qty = Number((req.body || {}).qty);
  if (!plId || !code || !Number.isFinite(qty) || qty === 0)
    return res.status(400).json({ error: "plId, code and a non-zero qty are required" });

  const m = await masters();
  if (!userPls(u).includes(plId)) return res.status(403).json({ error: "This price list is not assigned to you" });
  const pl = plById(m, plId);
  if (!pl) return res.status(404).json({ error: "Price list not found" });
  const line = plLineFor(pl, code);
  if (!line) return res.status(400).json({ error: `Item ${code} is not on price list ${plId}` });
  if (qty > 0 && !plValidToday(pl))
    return res.status(422).json({ error: `Price list ${pl.name} is not valid today (${pl.validFrom} → ${pl.validTill})` });

  const key = lineKey(plId, line);
  const mainStore = mainStoreOf(m, u);
  let cart = (await store.getCart(u.id)) || { startedAt: null, fromStore: mainStore, toStore: resStoreOf(m, u), lines: [] };
  cart.fromStore = cart.fromStore || mainStore;
  cart.toStore = cart.toStore || resStoreOf(m, u);

  /* ---- reduce ---- */
  if (qty < 0) {
    const ln = cart.lines.find(l => l.code === code && (l.kind === (toApproval ? "approval" : "order"))) ||
               cart.lines.find(l => l.code === code);
    if (!ln) return res.status(404).json({ error: "Item is not in your cart" });
    ln.qty += qty;
    if (ln.qty <= 0) cart.lines = cart.lines.filter(l => l !== ln);
    const release = Math.max(0, ln.reservedQty - Math.max(0, ln.qty));
    if (release > 0) { await store.adjustStock(cart.fromStore, code, release); ln.reservedQty -= release; }
    if (!cart.lines.length) cart = null;
    await store.saveCart(u.id, cart);
    return res.json(await cartDTO(u));
  }

  /* ---- add ---- */
  const { lines: balLines } = await balancesFor(u.id, plId);
  const bal = balLines.find(l => l.key === key);
  const inOrderCart = cart.lines.filter(l => l.key === key && l.kind === "order").reduce((s, l) => s + l.qty, 0);
  const inApprovalCart = cart.lines.some(l => l.code === code && l.kind === "approval");

  let kind = "order";
  const overLimit = line.restricted && (inOrderCart + qty) > bal.balance;
  if (toApproval || inApprovalCart) kind = "approval";
  else if (overLimit) {
    // SRS2: alert "Do you want to send the Order for approval?" — client re-posts with toApproval:true
    return res.status(409).json({
      needsApproval: true,
      error: `Requested qty exceeds your approved balance for this item (balance ${bal.balance}). Send it for approval?`
    });
  }

  // Reserve from Main store (reduce stocks on picking). Partial stock → the
  // unreserved part becomes a "DOD to be advised" split when the order is placed.
  const available = await store.stockOf(cart.fromStore, code);
  const take = Math.min(qty, Math.max(0, available));
  if (take > 0) await store.adjustStock(cart.fromStore, code, -take);

  let ln = cart.lines.find(l => l.code === code && l.kind === kind);
  if (ln) { ln.qty += qty; ln.reservedQty += take; }
  else {
    ln = {
      id: "L" + Date.now() + Math.random().toString(36).slice(2, 6),
      kind, plId, key, sl: line.sl, code, uom: line.uom, price: line.price,
      qty, reservedQty: take, addedAt: nowIso()
    };
    cart.lines.push(ln);
  }
  if (!cart.startedAt) cart.startedAt = nowIso();
  await store.saveCart(u.id, cart);
  const dto = await cartDTO(u);
  res.json({
    ...dto,
    notice: take < qty
      ? (take === 0
          ? "No stock in the Main store — this quantity will be ordered with delivery date to be advised (DOD)."
          : `Only ${take} available in the Main store — the remaining ${qty - take} will be a separate line with DOD to be advised.`)
      : null,
    addedTo: kind
  });
}));

app.delete("/api/cart/items/:id", requireAuth("employee"), wrap(async (req, res) => {
  const cart = await store.getCart(req.user.id);
  if (!cart) return res.json(await cartDTO(req.user));
  const ln = cart.lines.find(l => l.id === req.params.id);
  if (ln) {
    if (ln.reservedQty > 0) await store.adjustStock(cart.fromStore, ln.code, ln.reservedQty);
    cart.lines = cart.lines.filter(l => l !== ln);
    await store.saveCart(req.user.id, cart.lines.length ? cart : null);
  }
  res.json(await cartDTO(req.user));
}));

app.post("/api/cart/clear", requireAuth("employee"), wrap(async (req, res) => {
  await clearCartInternal(req.user, (req.body || {}).kind || null);
  res.json(await cartDTO(req.user));
}));

/* ══════════════════ ORDERS ══════════════════ */
app.post("/api/orders", requireAuth("employee"), wrap(async (req, res) => {
  const u = req.user;
  if (isPending(u)) return res.status(403).json({ error: "Account awaiting activation", pendingActivation: true });
  const { kind } = req.body || {};
  if (!["order", "approval"].includes(kind)) return res.status(400).json({ error: "kind must be order|approval" });

  const cart = await store.getCart(u.id);
  const cartLines = (cart?.lines || []).filter(l => l.kind === kind);
  if (!cartLines.length) return res.status(400).json({ error: "That cart is empty (it may have expired after 10 minutes)" });
  if (cart.startedAt && Date.now() - Date.parse(cart.startedAt) >= CART_WINDOW_MIN * 60000) {
    await sweepCarts();
    return res.status(422).json({ error: `The ${CART_WINDOW_MIN}-minute shopping window has expired — the cart was emptied and stock released. Please shop again.` });
  }

  const m = await masters();
  const plId = cartLines[0].plId;
  const pl = plById(m, plId);
  if (!pl) return res.status(400).json({ error: "Price list no longer exists" });
  if (cartLines.some(l => l.plId !== plId))
    return res.status(422).json({ error: "One order can only contain items of one price list — place them separately" });

  /* re-verify limits for the Order Cart */
  if (kind === "order") {
    const { lines: balLines } = await balancesFor(u.id, plId);
    const byKey = {};
    for (const l of cartLines) byKey[l.key] = (byKey[l.key] || 0) + l.qty;
    for (const [key, q] of Object.entries(byKey)) {
      const bal = balLines.find(x => x.key === key);
      if (bal && bal.restricted && q > bal.balance)
        return res.status(422).json({ error: `Quantity for line ${key} now exceeds your approved balance — send it via the Approval Cart`, needsApproval: true });
    }
  }

  const dp = Number(pl.deliveryPeriod) || 0;
  const createdAt = nowIso();
  const ref = "OR" + (await store.nextSeq("or"));

  /* Build order lines — split partial-stock picks into a stocked line (delivery
     date per delivery-period rule) + a DOD line, per SRS2. */
  const lines = [];
  let ix = 0;
  const push = (cl, qty, reserved) => {
    ix += 1;
    const item = m.items.find(i => i.code === cl.code) || { name: cl.code };
    lines.push({
      lineRef: `${ref}/${String(ix).padStart(3, "0")}`,
      code: cl.code, name: item.name, uom: cl.uom, price: cl.price,
      key: cl.key, plId: cl.plId,
      orderedQty: qty, approvedQty: qty, qty,
      amount: round2(qty * cl.price),
      delivered: 0, received: 0, returned: 0,
      reservedQty: reserved,
      stock: reserved >= qty && qty > 0,
      deliveryDate: reserved >= qty && qty > 0 ? addDays(createdAt, dp) : null,
      remark: reserved >= qty && qty > 0 ? "" : "DOD to be advised"
    });
  };
  for (const cl of cartLines) {
    if (cl.reservedQty >= cl.qty) push(cl, cl.qty, cl.qty);
    else if (cl.reservedQty <= 0) push(cl, cl.qty, 0);
    else { push(cl, cl.reservedQty, cl.reservedQty); push(cl, cl.qty - cl.reservedQty, 0); }
  }

  const order = {
    ref, contract: pl.contract, plId,
    emp: u.id, empId: u.empId, empName: u.name, dept: u.dept, location: u.location,
    customer: pl.customer || u.customer,
    customerName: (m.customers.find(c => c.id === (pl.customer || u.customer)) || {}).name || "",
    fromStore: cart.fromStore, toStore: cart.toStore,
    deliveryPeriod: dp,
    createdAt,
    status: kind === "order" ? "in_progress" : "pending_approval",
    approvalDeadline: kind === "approval" ? new Date(Date.parse(createdAt) + APPROVAL_WINDOW_DAYS * 86400000).toISOString() : null,
    lines, total: round2(lines.reduce((s, l) => s + l.amount, 0)),
    so: null, dns: [], deliveries: [], returns: [],
    history: [{ at: createdAt, ev: kind === "order" ? "Order placed (Order Cart)" : `Order placed (Approval Cart — awaiting EGA approval, max ${APPROVAL_WINDOW_DAYS} days)` }]
  };

  /* Debit the ordered qty in "Used Qty" of the price list (both carts, per SRS2). */
  for (const l of lines) await store.addConsumption(u.id, l.key, l.orderedQty);

  /* Secure the ordered qtys: stock-transfer the reserved qty Main → Reservation
     store (Issue + Receipt vouchers). Cart already took it out of Main. */
  const reserved = lines.filter(l => l.reservedQty > 0)
    .map(l => ({ code: l.code, qty: l.reservedQty, uom: l.uom }));
  if (reserved.length) {
    for (const r of reserved) await store.adjustStock(cart.toStore, r.code, r.qty); // Main already debited at pick time
    const n = await store.nextSeq("stv");
    const stv = {
      ref: `ST${n}`, issueRef: `IS${n}`, receiptRef: `RC${n}`, at: createdAt,
      from: cart.fromStore, to: cart.toStore, order: ref,
      reason: "Reservation of ordered quantities", by: u.name, lines: reserved
    };
    await store.addErpDoc("stv", stv);
    await safeCall("createStockTransfer", stv);
    order.history.push({ at: createdAt, ev: `Stock transferred ${cart.fromStore} → ${cart.toStore} (Issue ${stv.issueRef} / Receipt ${stv.receiptRef}) to secure the ordered qtys` });
  }

  await store.createOrder(order);

  if (kind === "order") {
    const r = await safeCall("createSalesOrder", order);
    if (r && r.soRef) {
      order.so = r.soRef;
      order.history.push({ at: nowIso(), ev: `ERP SO ${r.soRef} created` });
      await store.saveOrder(order);
    }
  } else {
    await store.erpLog(`Order ${ref} (${u.name}) held in middleware — awaiting EGA client approval (deadline ${order.approvalDeadline})`);
  }

  /* clear the placed cart lines */
  cart.lines = cart.lines.filter(l => l.kind !== kind);
  await store.saveCart(u.id, cart.lines.length ? cart : null);

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

/* Cancel — employee: own in-progress order, nothing delivered, 15-min window.
   Stores/admin: any in-progress or partial order → cancel the undelivered balance,
   stock-transfer reserved qtys Reservation → Main, credit the price list. */
app.post("/api/orders/:ref/cancel", requireAuth(), wrap(async (req, res) => {
  const o = await store.getOrder(req.params.ref);
  if (!o) return res.status(404).json({ error: "Not found" });
  normalizeOrder(o);
  const fromStores = isStores(req.user);
  if (!fromStores) {
    if (o.emp !== req.user.id) return res.status(403).json({ error: "Not your order" });
    if (o.status !== "in_progress") return res.status(422).json({ error: "Only in-progress orders can be cancelled" });
    if (o.lines.some(l => l.delivered > 0)) return res.status(422).json({ error: "Delivery has started — ask PROSAFE Stores to cancel the balance" });
    if (Date.now() - Date.parse(o.createdAt) >= CANCEL_WINDOW_MIN * 60000)
      return res.status(422).json({ error: `The ${CANCEL_WINDOW_MIN}-minute cancellation window has passed — ask PROSAFE Stores to cancel` });
  } else if (!["in_progress", "pending_approval", "partially_delivered", "do_created", "partially_received"].includes(o.status)) {
    return res.status(422).json({ error: "This order can no longer be cancelled" });
  }

  const anyDelivered = o.lines.some(l => l.delivered > 0);
  await releaseOrder(o, { cancelUndelivered: true });
  for (const l of o.lines) {
    if (anyDelivered) {
      l.approvedQty = Math.min(l.approvedQty, l.delivered); // cancel only the undelivered balance
      l.amount = round2(targetQty(l) * l.price);
      l.remark = l.remark || "Balance cancelled";
    }
  }
  if (anyDelivered) {
    o.total = round2(o.lines.reduce((s, l) => s + l.amount, 0));
    o.status = fulfilmentStatus(o);
    o.history.push({ at: nowIso(), ev: `Undelivered balance cancelled by ${req.user.name} — reserved qtys returned to Main store, price list credited` });
  } else {
    o.status = "cancelled";
    o.history.push({ at: nowIso(), ev: `Cancelled by ${req.user.name}${fromStores ? " (Stores)" : ` within the ${CANCEL_WINDOW_MIN}-minute window`}` });
    if (o.so) await safeCall("cancelSalesOrder", o.so);
  }
  await store.saveOrder(o);
  if (fromStores && o.emp !== req.user.id)
    await store.addNotification(o.emp, `Order ${o.ref}: ${anyDelivered ? "the undelivered balance was cancelled" : "the order was cancelled"} by PROSAFE Stores.`);
  res.json(orderDTO(o));
}));

/* EGA approval — line-wise approved qtys. */
app.post("/api/orders/:ref/approve", requireAuth("approver"), wrap(async (req, res) => {
  const o = await store.getOrder(req.params.ref);
  if (!o || o.status !== "pending_approval") return res.status(422).json({ error: "Order is not awaiting approval" });
  normalizeOrder(o);
  const requestedLines = Array.isArray(req.body?.lines) ? req.body.lines : [];
  for (const l of o.lines) {
    const requested = requestedLines.find(x => x.lineRef === l.lineRef) || {};
    const approvedQty = Number(requested.approvedQty ?? l.orderedQty);
    if (!Number.isFinite(approvedQty) || approvedQty < 0 || approvedQty > l.orderedQty)
      return res.status(422).json({ error: `Approved quantity for ${l.code} must be between 0 and ${l.orderedQty}` });
    const reduction = l.orderedQty - approvedQty;
    if (reduction > 0 && l.key) await store.addConsumption(o.emp, l.key, -reduction); // credit Used Qty for the unapproved part
    l.approvedQty = approvedQty;
    l.amount = round2(approvedQty * l.price);
    /* release any excess reservation back to the Main store */
    if (l.reservedQty > approvedQty) {
      const excess = l.reservedQty - approvedQty;
      await stockTransfer({
        from: o.toStore, to: o.fromStore, order: o.ref, by: req.user.name,
        reason: "Release of unapproved reserved qty", lines: [{ code: l.code, qty: excess, uom: l.uom }]
      });
      l.reservedQty = approvedQty;
      if (approvedQty === 0) { l.stock = false; l.deliveryDate = null; l.remark = "Not approved"; }
    }
  }
  if (!o.lines.some(l => targetQty(l) > 0))
    return res.status(422).json({ error: "Approve at least one line, or reject the order" });
  o.total = round2(o.lines.reduce((s, l) => s + l.amount, 0));
  o.status = "in_progress";
  /* Stamped so the approver's "Approved Orders" bucket keeps the order even
     after it moves on to delivery. */
  o.approvedAt = nowIso();
  o.approvedBy = req.user.name;
  o.history.push({
    at: nowIso(),
    ev: `Approved line-wise by ${req.user.name} (EGA) — ${o.lines.map(l => `${l.code}: ${targetQty(l)}/${l.orderedQty}`).join(", ")}`
  });
  const r = await safeCall("createSalesOrder", o);
  if (r && r.soRef) { o.so = r.soRef; o.history.push({ at: nowIso(), ev: `ERP SO ${r.soRef} created` }); }
  await store.saveOrder(o);
  await store.addNotification(o.emp, `Order ${o.ref} was approved by EGA and is now in progress.`);
  res.json(orderDTO(o));
}));

app.post("/api/orders/:ref/reject", requireAuth("approver"), wrap(async (req, res) => {
  const o = await store.getOrder(req.params.ref);
  if (!o || o.status !== "pending_approval") return res.status(422).json({ error: "Order is not awaiting approval" });
  normalizeOrder(o);
  await releaseOrder(o, { cancelUndelivered: true });
  o.status = "rejected";
  o.history.push({ at: nowIso(), ev: `Rejected by ${req.user.name} (EGA)${req.body?.reason ? " — " + req.body.reason : ""}. Reserved qtys returned to Main store, price list credited.` });
  await store.saveOrder(o);
  await store.addNotification(o.emp, `Order ${o.ref} was rejected by EGA${req.body?.reason ? ": " + req.body.reason : ""}.`);
  await store.erpLog(`Order ${o.ref} rejected by ${req.user.name}`);
  res.json(orderDTO(o));
}));

/* Re-save — SRS2 delivery-date update mechanism for DOD lines.
   For each line with stock "No": if the Main store now has the remaining qty,
   transfer it to the Reservation store, apply the delivery-period rule and
   notify the employee. */
async function resaveOrder(o, byName) {
  normalizeOrder(o);
  const m = await masters();
  const updated = [];
  for (const l of o.lines) {
    const needed = targetQty(l) - l.delivered - l.reservedQty;
    if (l.stock || needed <= 0) continue;
    const available = await store.stockOf(o.fromStore, l.code);
    if (available >= needed) {
      await stockTransfer({
        from: o.fromStore, to: o.toStore, order: o.ref, by: byName,
        reason: "Re-save: stock now available — reserving DOD line", lines: [{ code: l.code, qty: needed, uom: l.uom }]
      });
      l.reservedQty += needed;
      l.stock = true;
      l.deliveryDate = addDays(nowIso(), Number(o.deliveryPeriod) || 0);
      l.remark = "";
      updated.push(`${l.code}: ${needed} (deliver by ${l.deliveryDate})`);
    }
  }
  if (updated.length) {
    o.history.push({ at: nowIso(), ev: `Re-saved by ${byName} — stock secured & delivery dates updated: ${updated.join(", ")}` });
    if (o.so) await safeCall("updateSalesOrderPlanning", o);
    await store.saveOrder(o);
    await store.addNotification(o.emp, `Order ${o.ref}: stock is now reserved for ${updated.join(", ")}.`);
  }
  return updated;
}

app.post("/api/orders/:ref/resave", requireAuth("store"), wrap(async (req, res) => {
  const o = await store.getOrder(req.params.ref);
  if (!o) return res.status(404).json({ error: "Order not found" });
  if (!["in_progress", "partially_delivered", "do_created", "partially_received"].includes(o.status))
    return res.status(422).json({ error: "Only open orders can be re-saved" });
  const updated = await resaveOrder(o, req.user.name);
  res.json({ order: orderDTO(o), updated });
}));

app.post("/api/orders/resave-all", requireAuth("store"), wrap(async (req, res) => {
  const orders = await store.listOrders();
  const results = [];
  for (const o of orders) {
    if (!["in_progress", "partially_delivered", "do_created", "partially_received"].includes(o.status)) continue;
    const updated = await resaveOrder(o, req.user.name + " (bulk re-save)");
    if (updated.length) results.push({ ref: o.ref, updated });
  }
  res.json({ resaved: results });
}));

/* Delivery Note — created from the RESERVATION store; only reserved qtys can ship. */
app.post("/api/orders/:ref/delivery-note", requireAuth("store"), wrap(async (req, res) => {
  const o = await store.getOrder(req.params.ref);
  if (!o) return res.status(404).json({ error: "Order not found" });
  normalizeOrder(o);
  if (!["in_progress", "partially_delivered", "partially_received"].includes(o.status))
    return res.status(422).json({ error: "Order has no quantities available for another delivery note" });
  if (!Array.isArray(req.body?.lines) || !req.body.lines.length)
    return res.status(400).json({ error: "Select at least one quantity to deliver" });

  const seen = new Set();
  const dnLines = [];
  for (const rl of req.body.lines) {
    if (seen.has(rl.lineRef)) return res.status(400).json({ error: `Duplicate line ${rl.lineRef}` });
    seen.add(rl.lineRef);
    const l = o.lines.find(x => x.lineRef === rl.lineRef);
    if (!l) return res.status(400).json({ error: `Unknown order line ${rl.lineRef}` });
    const qty = Number(rl.qty);
    const remaining = targetQty(l) - l.delivered;
    if (!Number.isFinite(qty) || qty <= 0)
      return res.status(400).json({ error: `Delivery quantity for ${l.code} must be greater than zero` });
    if (qty > remaining)
      return res.status(422).json({ error: `${l.code} has only ${remaining} remaining to deliver` });
    if (qty > l.reservedQty)
      return res.status(422).json({ error: `${l.code}: only ${l.reservedQty} is reserved in ${o.toStore} — re-save the order once Main-store stock arrives` });
    dnLines.push({
      lineRef: l.lineRef, code: l.code, qty, uom: l.uom, price: l.price,
      amount: round2(qty * l.price), received: 0,
      deliveryDate: l.deliveryDate, remark: l.remark
    });
  }

  const dnRef = "DO" + (await store.nextSeq("dn"));
  const delivery = {
    ref: dnRef, at: nowIso(), store: o.toStore, lines: dnLines,
    total: round2(dnLines.reduce((sum, l) => sum + l.amount, 0)),
    status: "awaiting_receipt", ackAt: null
  };
  const r = await safeCall("createDeliveryNote", o, delivery);
  if (!r || r.error) return res.status(502).json({ error: `Delivery Note was not created in ERP: ${r?.error || "Unknown ERP error"}` });
  delivery.ref = (r && r.dnRef) || dnRef;

  for (const dl of dnLines) {
    const l = o.lines.find(x => x.lineRef === dl.lineRef);
    l.delivered += dl.qty;
    l.reservedQty -= dl.qty;                    // leaves the Reservation store
    await store.adjustStock(o.toStore, dl.code, -dl.qty);
  }
  o.dns.push(delivery.ref);
  o.deliveries.push(delivery);
  o.status = fulfilmentStatus(o);
  o.history.push({
    at: delivery.at,
    ev: `Delivery Note ${delivery.ref} created from ${o.toStore} — ${dnLines.map(l => `${l.code}: ${l.qty}`).join(", ")}`
  });
  await store.saveOrder(o);
  await store.addNotification(o.emp, `Delivery Note ${delivery.ref} was created for order ${o.ref} — please acknowledge receipt when the items arrive.`);
  res.json(orderDTO(o));
}));

/* Employee acknowledges the DO quantities (the separate Receipt Voucher
   process is REMOVED per SRS2). */
app.post("/api/orders/:ref/deliveries/:dnRef/receive", requireAuth("employee"), wrap(async (req, res) => {
  const o = await store.getOrder(req.params.ref);
  if (!o || o.emp !== req.user.id) return res.status(404).json({ error: "Not found" });
  normalizeOrder(o);
  const delivery = o.deliveries.find(d => d.ref === req.params.dnRef);
  if (!delivery) return res.status(404).json({ error: "Delivery Note not found" });
  if (!delivery.lines.some(l => l.qty > (l.received || 0)))
    return res.status(422).json({ error: "Delivery Note is already fully acknowledged" });
  const seen = new Set();
  const ackLines = [];
  for (const rl of req.body?.lines || []) {
    if (seen.has(rl.lineRef)) return res.status(400).json({ error: `Duplicate line ${rl.lineRef}` });
    seen.add(rl.lineRef);
    const l = delivery.lines.find(x => x.lineRef === rl.lineRef);
    if (!l) return res.status(400).json({ error: `Line ${rl.lineRef} is not on Delivery Note ${delivery.ref}` });
    const v = Number(rl.qty);
    const available = l.qty - (l.received || 0);
    if (!Number.isFinite(v) || v <= 0) continue;
    if (v > available)
      return res.status(422).json({ error: `${l.code} has only ${available} awaiting acknowledgement on ${delivery.ref}` });
    ackLines.push({ lineRef: l.lineRef, code: l.code, qty: v });
  }
  if (!ackLines.length) return res.status(400).json({ error: "No receivable quantities supplied" });
  const at = nowIso();
  for (const al of ackLines) {
    const dl = delivery.lines.find(l => l.lineRef === al.lineRef);
    dl.received = (dl.received || 0) + al.qty;
    const ol = o.lines.find(l => l.lineRef === al.lineRef);
    ol.received += al.qty;
    ol.lastReceivedAt = at;                    // starts the 3-day return window
  }
  delivery.ackAt = at;
  const received = delivery.lines.reduce((s, l) => s + (l.received || 0), 0);
  const qty = delivery.lines.reduce((s, l) => s + l.qty, 0);
  delivery.status = received >= qty ? "received" : "partially_received";
  o.status = fulfilmentStatus(o);
  o.history.push({ at, ev: `Employee acknowledged ${delivery.ref} — ${ackLines.map(l => `${l.code}: ${l.qty}`).join(", ")}` });
  await store.saveOrder(o);
  res.json({ order: orderDTO(o) });
}));

/* ══════════════════ RETURNS (RMA) — SRS2 ══════════════════ */
app.post("/api/orders/:ref/return", requireAuth("employee"), wrap(async (req, res) => {
  const o = await store.getOrder(req.params.ref);
  if (!o || o.emp !== req.user.id) return res.status(404).json({ error: "Not found" });
  normalizeOrder(o);
  if (!["complete", "partially_received"].includes(o.status))
    return res.status(422).json({ error: "Returns are allowed for partially received or completed orders" });

  const pendingByLine = {};
  for (const r of o.returns.filter(r => r.status === "pending"))
    for (const rl of r.lines) pendingByLine[rl.lineRef] = (pendingByLine[rl.lineRef] || 0) + rl.qty;

  const retLines = [];
  for (const rl of req.body?.lines || []) {
    const l = o.lines.find(x => x.lineRef === rl.lineRef);
    if (!l) continue;
    const qty = Number(rl.qty) || 0;
    if (qty <= 0) continue;
    const returnable = l.received - l.returned - (pendingByLine[l.lineRef] || 0);
    if (qty > returnable)
      return res.status(422).json({ error: `${l.code}: return qty ${qty} exceeds the received qty available to return (${returnable})` });
    if (l.lastReceivedAt && Date.now() - Date.parse(l.lastReceivedAt) > RETURN_WINDOW_DAYS * 86400000)
      return res.status(422).json({ error: `Exceeded ${RETURN_WINDOW_DAYS} days time period — ${l.code} was received on ${l.lastReceivedAt.slice(0, 10)} and can no longer be returned` });
    retLines.push({ lineRef: l.lineRef, code: l.code, name: l.name, qty, uom: l.uom, price: l.price, remark: String(rl.remark || "") });
  }
  if (!retLines.length) return res.status(400).json({ error: "No returnable quantities supplied" });

  const rma = {
    ref: "RT" + (await store.nextSeq("ret")),
    at: nowIso(), status: "pending",
    emp: o.emp, empName: o.empName,
    lines: retLines,
    total: round2(retLines.reduce((s, l) => s + l.qty * l.price, 0))
  };
  o.returns.push(rma);
  o.history.push({ at: rma.at, ev: `Return ${rma.ref} submitted — awaiting Return Confirmation by PROSAFE Stores` });
  await store.saveOrder(o);
  await store.erpLog(`Return ${rma.ref} submitted for order ${o.ref} — pending store confirmation`);
  res.json(orderDTO(o));
}));

app.delete("/api/orders/:ref/returns/:rt", requireAuth("employee"), wrap(async (req, res) => {
  const o = await store.getOrder(req.params.ref);
  if (!o || o.emp !== req.user.id) return res.status(404).json({ error: "Not found" });
  normalizeOrder(o);
  const rma = o.returns.find(r => r.ref === req.params.rt);
  if (!rma || rma.status !== "pending") return res.status(422).json({ error: "Only pending returns can be withdrawn" });
  o.returns = o.returns.filter(r => r !== rma);
  o.history.push({ at: nowIso(), ev: `Return ${rma.ref} withdrawn by employee` });
  await store.saveOrder(o);
  res.json(orderDTO(o));
}));

/* Stores acknowledges physical receipt of the returned items ("Return
   Confirmation") → credit Used Qty, credit the Main store, raise a Credit Note. */
app.post("/api/orders/:ref/returns/:rt/confirm", requireAuth("store"), wrap(async (req, res) => {
  const o = await store.getOrder(req.params.ref);
  if (!o) return res.status(404).json({ error: "Order not found" });
  normalizeOrder(o);
  const rma = o.returns.find(r => r.ref === req.params.rt);
  if (!rma || rma.status !== "pending") return res.status(422).json({ error: "Return is not awaiting confirmation" });

  const at = nowIso();
  for (const rl of rma.lines) {
    const l = o.lines.find(x => x.lineRef === rl.lineRef);
    if (!l) continue;
    l.returned += rl.qty;
    if (l.key) await store.addConsumption(o.emp, l.key, -rl.qty);   // debit Used Qty / credit balance
    await store.adjustStock(o.fromStore, rl.code, rl.qty);          // items back into the Main store
  }
  rma.status = "confirmed";
  rma.confirmedAt = at;
  rma.confirmedBy = req.user.name;

  const cnRef = "CN" + (await store.nextSeq("cn"));
  const cn = {
    ref: cnRef, at, order: o.ref, so: o.so, rma: rma.ref,
    customer: o.customer, customerName: o.customerName, emp: o.emp, empName: o.empName,
    lines: rma.lines.map(l => ({ ...l })), total: rma.total, status: "Issued"
  };
  await store.addErpDoc("cn", cn);
  await safeCall("postReturn", { ...rma, order: o.ref, so: o.so, customer: o.customer, customerName: o.customerName, status: "Confirmed" });
  await safeCall("postCreditNote", cn);

  o.history.push({ at, ev: `Return ${rma.ref} confirmed by ${req.user.name} — stock credited to ${o.fromStore}, price list credited, Credit Note ${cnRef} raised` });
  await store.saveOrder(o);
  await store.addNotification(o.emp, `Your return ${rma.ref} (order ${o.ref}) was confirmed — your approved qty list has been credited. Credit Note ${cnRef}.`);
  res.json(orderDTO(o));
}));

/* ══════════════════ INVOICING (admin) ══════════════════ */
app.post("/api/invoices/consolidate", requireAuth("store"), wrap(async (req, res) => {
  const docs = await store.listErpDocs();
  const pend = docs.dn.filter(d => !d.invoiced);
  if (!pend.length) return res.status(422).json({ error: "No delivery notes pending invoicing" });
  const byCust = {};
  pend.forEach(d => { (byCust[d.customer] = byCust[d.customer] || []).push(d); });
  const created = [];
  for (const [cid, dns] of Object.entries(byCust)) {
    const ref = "INV" + (await store.nextSeq("inv"));
    const inv = {
      ref, at: nowIso(), customer: cid, customerName: dns[0].customerName,
      dns: dns.map(d => d.ref), lines: dns.flatMap(d => d.lines),
      total: round2(dns.reduce((s, d) => s + d.total, 0))
    };
    await safeCall("postInvoice", inv);
    for (const d of dns) await store.updateErpDoc("dn", d.ref, { invoiced: true });
    created.push(inv);
  }
  res.json({ invoices: created });
}));

/* ══════════════════ INVENTORY (Store module) ══════════════════ */
app.get("/api/admin/inventory", requireAuth("store"), wrap(async (req, res) => {
  const m = await masters();
  res.json({ stores: m.stores, items: m.items, inventory: await store.getInventory() });
}));

app.post("/api/admin/inventory/adjust", requireAuth("store"), wrap(async (req, res) => {
  const { store: storeCode, code, qty, reason } = req.body || {};
  const dq = Number(qty);
  if (!storeCode || !code || !Number.isFinite(dq) || dq === 0)
    return res.status(400).json({ error: "store, code and a non-zero qty are required" });
  const next = await store.adjustStock(storeCode, code, dq);
  await store.erpLog(`Inventory adjustment by ${req.user.name}: ${code} ${dq > 0 ? "+" : ""}${dq} in ${storeCode}${reason ? ` (${reason})` : ""} → ${next}`);
  res.json({ ok: true, store: storeCode, code, qty: next });
}));

app.post("/api/admin/inventory/transfer", requireAuth("store"), wrap(async (req, res) => {
  const { from, to, lines } = req.body || {};
  if (!from || !to || from === to) return res.status(400).json({ error: "Different from/to stores are required" });
  if (!Array.isArray(lines) || !lines.length) return res.status(400).json({ error: "lines required" });
  const m = await masters();
  if (!m.stores.find(s => s.code === from) || !m.stores.find(s => s.code === to))
    return res.status(400).json({ error: "Unknown store" });
  const moved = [];
  for (const l of lines) {
    const q = Number(l.qty);
    if (!l.code || !Number.isFinite(q) || q <= 0) continue;
    const available = await store.stockOf(from, l.code);
    if (q > available) return res.status(422).json({ error: `${l.code}: only ${available} available in ${from}` });
    const item = m.items.find(i => i.code === l.code);
    moved.push({ code: l.code, qty: q, uom: item ? item.uom : "" });
  }
  if (!moved.length) return res.status(400).json({ error: "No valid quantities supplied" });
  const doc = await stockTransfer({ from, to, lines: moved, reason: "Manual stock transfer", by: req.user.name });
  res.json({ ok: true, transfer: doc });
}));

/* ══════════════════ ADMIN: users, masters & ERP console ══════════════════ */
app.get("/api/admin/users", requireAuth("admin"), wrap(async (req, res) => {
  res.json((await store.listProfiles()).map(pub));
}));

/* SRS2: "Store Log-in credential set-up in Admin Module, with user name
   (e-mail) and password. As the store is under PROSAFE control, there is no
   dependency on the Employee Master for the store log-in credential."
   The same screen also creates approver and admin log-ins. */
app.post("/api/admin/users", requireAuth("admin"), wrap(async (req, res) => {
  const body = req.body || {};
  const roles = Array.isArray(body.roles) && body.roles.length ? body.roles : [body.role].filter(Boolean);
  const bad = validateRoles(roles);
  if (bad) return res.status(400).json({ error: bad });
  const p = await authsvc.adminCreateLogin({ ...body, roles, role: roles[0] });
  await store.erpLog(`Log-in created by ${req.user.name}: ${p.email} (${roles.join(" + ")})`);
  res.status(201).json(pub(p));
}));

app.patch("/api/admin/users/:id", requireAuth("admin"), wrap(async (req, res) => {
  const existing = await store.getProfile(req.params.id);
  if (!existing) return res.status(404).json({ error: "User not found" });
  if (existing.role === "admin")
    return res.status(403).json({ error: "Administrator accounts are protected and cannot be edited, deactivated, or have their role changed" });
  const allowed = ["role", "roles", "customer", "dept", "location", "priceList", "priceLists", "fromStore", "toStore", "active", "empId", "name", "phone", "telephone", "username"];
  const patch = {};
  for (const k of allowed) if (k in (req.body || {})) patch[k] = req.body[k];
  /* One log-in can hold employee + approver and switch between the two
     modules; store and admin are standalone. `role` is whichever module the
     user is currently in and must always be one of the assigned roles. */
  if ("roles" in patch) {
    const bad = validateRoles(patch.roles);
    if (bad) return res.status(400).json({ error: bad });
    patch.roles = ALL_ROLES.filter(r => patch.roles.includes(r));
    if (!patch.roles.includes(patch.role || existing.role)) patch.role = patch.roles[0];
  } else if (patch.role) {
    patch.roles = [patch.role];
  }
  if (patch.role && !ALL_ROLES.includes(patch.role))
    return res.status(400).json({ error: "role must be employee|approver|store|admin" });
  if ("username" in patch && patch.username) {
    patch.username = String(patch.username).trim().slice(0, 8);
    if (store.getProfileByUsername) {
      const clash = await store.getProfileByUsername(patch.username);
      if (clash && clash.id !== req.params.id) return res.status(409).json({ error: "That User Name is already taken" });
    }
  }
  if ("priceList" in patch && !("priceLists" in patch))
    patch.priceLists = patch.priceList ? [patch.priceList] : [];
  if ("priceLists" in patch) {
    if (!Array.isArray(patch.priceLists)) return res.status(400).json({ error: "priceLists must be an array of price list ids" });
    const m = await masters();
    for (const id of patch.priceLists)
      if (!plById(m, id)) return res.status(400).json({ error: `Unknown price list ${id}` });
    patch.priceList = patch.priceLists[0] || null;
  }
  // Promotion is permanent: administrators are activated immediately and
  // subsequent requests are rejected by the protection above.
  // Store and admin accounts are usable the moment they are promoted.
  if (patch.role === "admin" || patch.role === "store") patch.active = true;
  /* An approver-only log-in needs no shopping profile, so it is usable at once. */
  if (patch.roles && patch.roles.length === 1 && patch.roles[0] === "approver") patch.active = true;
  const p = await store.updateProfile(req.params.id, patch);
  res.json(pub(p));
}));

app.delete("/api/admin/users/:id", requireAuth("admin"), wrap(async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: "Use account deletion for your own account" });
  const existing = await store.getProfile(req.params.id);
  if (!existing) return res.status(404).json({ error: "User not found" });
  if (existing.role === "admin")
    return res.status(403).json({ error: "Administrator accounts are protected and cannot be deleted" });
  await authsvc.deleteAccount(req.params.id);
  res.json({ ok: true });
}));

app.get("/api/masters", requireAuth("admin", "approver", "store"), wrap(async (req, res) => {
  res.json(await masters());
}));

/* Generic master create/update + delete — "Creation of other all Masters & Control". */
const MASTER_KINDS = ["customers", "employees", "contracts", "departments", "locations", "divisions", "stores", "uoms", "items", "priceLists"];
app.post("/api/admin/masters/:kind", requireAuth("admin"), wrap(async (req, res) => {
  const kind = req.params.kind;
  if (!MASTER_KINDS.includes(kind)) return res.status(400).json({ error: `Unknown master '${kind}'` });
  const body = req.body || {};
  const m = await masters();
  if (kind === "priceLists") {
    if (!body.id || !Array.isArray(body.lines)) return res.status(400).json({ error: "Price list needs an id and a lines array" });
    body.deliveryPeriod = Math.max(0, Number(body.deliveryPeriod) || 0);
    for (const [ix, l] of body.lines.entries()) {
      l.sl = Number(l.sl) || ix + 1;
      l.codes = Array.isArray(l.codes) ? l.codes : (l.code ? [l.code] : []);
      if (!l.codes.length) return res.status(400).json({ error: `Line ${l.sl}: at least one item code is required` });
      for (const c of l.codes) if (!m.items.find(i => i.code === c)) return res.status(400).json({ error: `Line ${l.sl}: unknown item ${c}` });
      l.price = Number(l.price) || 0;
      l.alloc = Math.max(0, Number(l.alloc) || 0);
      l.restricted = l.restricted !== false;
      l.uom = l.uom || (m.items.find(i => i.code === l.codes[0]) || {}).uom || "PCS";
    }
  }
  /* Employee Master — the register-ability list. Registration matches an
     Employee ID against it and then checks the Mobile Phone, so both are
     mandatory here. */
  if (kind === "employees") {
    body.empId = String(body.empId || "").trim();
    if (!body.empId) return res.status(400).json({ error: "Employee ID is required" });
    body.phone = String(body.phone || "").trim();
    if (!body.phone) return res.status(400).json({ error: "Mobile Phone is required — registration validates it against this master" });
    if (!String(body.name || "").trim()) return res.status(400).json({ error: "Employee Name is required" });
    if (body.customer && !m.customers.find(c => c.id === body.customer))
      return res.status(400).json({ error: `Unknown customer ${body.customer}` });
    const clash = (m.employees || []).find(e => e.empId !== body.empId && String(e.phone || "").replace(/\D/g, "") === body.phone.replace(/\D/g, ""));
    if (clash) return res.status(400).json({ error: `That Mobile Phone already belongs to ${clash.empId} — the two data points must identify one employee` });
  }
  if (kind === "stores" && body.type && !["main", "reservation"].includes(body.type))
    return res.status(400).json({ error: "store type must be main|reservation" });
  const saved = await store.upsertMaster(kind, body);
  await store.erpLog(`Master ${kind} upserted by ${req.user.name}: ${JSON.stringify(saved).slice(0, 120)}`);
  res.json(saved);
}));

app.delete("/api/admin/masters/:kind/:id", requireAuth("admin"), wrap(async (req, res) => {
  const kind = req.params.kind;
  if (!MASTER_KINDS.includes(kind)) return res.status(400).json({ error: `Unknown master '${kind}'` });
  await store.deleteMaster(kind, req.params.id);
  await store.erpLog(`Master ${kind}/${req.params.id} deleted by ${req.user.name}`);
  res.json({ ok: true });
}));

app.get("/api/erp/documents", requireAuth("store"), wrap(async (req, res) => {
  res.json(await store.listErpDocs());
}));

app.get("/api/health", wrap(async (req, res) => {
  res.json({ ok: true, version: "v3-srs2", storage: store.mode, auth: authsvc.SUPA ? "supabase" : "local-demo", erp: process.env.ERP_PROVIDER || "focus9-stub" });
}));

/* ══════════════════ boot ══════════════════ */
if (require.main === module) {
  // Run as a normal server (local dev / VPS). On Vercel this file is imported
  // by api/index.js instead and requests are handled serverlessly.
  store.init().then(() => {
    setInterval(() => sweepAll().catch(() => {}), 60000);
    app.listen(PORT, () => {
      console.log(`PROSAFE middleware v3 (SRS2 25-08-26) on http://0.0.0.0:${PORT}`);
      console.log(`  storage: ${store.mode}   auth: ${authsvc.SUPA ? "supabase" : "local-demo (password: prosafe1)"}   erp: ${process.env.ERP_PROVIDER || "focus9-stub"}`);
    });
  }).catch(e => {
    console.error("Store init failed:", e.message);
    console.error("If using Supabase: run supabase/schema.sql and seed.sql in the SQL editor first.");
    process.exit(1);
  });
}

module.exports = app;
