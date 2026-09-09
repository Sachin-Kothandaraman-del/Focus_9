/** Local JSON-file store — demo/dev mode (used when SUPABASE_URL is not set). */
const fs = require("fs");
const path = require("path");
const seed = require("./seed-data");

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");
const DB_VERSION = 7; // + Employee Master, multi-role, Group/Category held on the item
let db = null;

const clone = x => JSON.parse(JSON.stringify(x));

/* Primary key of each master (same map as store/supabase.js). */
const masterKey = kind =>
  kind === "customers" || kind === "priceLists" ? "id"
  : kind === "contracts" ? "ref"
  : kind === "employees" ? "empId"
  : "code";

function freshDb() {
  return {
    version: DB_VERSION,
    profiles: seed.demoUsers.map(u => ({ ...u, createdAt: new Date().toISOString() })),
    masters: clone({
      customers: seed.customers, employees: seed.employees, contracts: seed.contracts, departments: seed.departments,
      locations: seed.locations, divisions: seed.divisions, stores: seed.stores,
      uoms: seed.uoms,
      items: seed.items, priceLists: seed.priceLists
    }),
    inventory: clone(seed.inventory),   // inventory[storeCode][itemCode] = qty
    carts: {},                          // carts[userId] = { startedAt, lines: [...] }
    alloc: {},                          // alloc[userId][lineKey] = { consumed, extra }
    orders: [],
    notifications: [],                  // { id, at, userId, msg, read }
    erp: { so: [], dn: [], inv: [], ret: [], cn: [], stv: [] },
    log: [],
    seq: { ...seed.seq }
  };
}

function loadSync() {
  if (db) return db;
  try {
    db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    if (db.version !== DB_VERSION) {
      // Incompatible pre-SRS2 database → keep a backup, start fresh.
      const backup = path.join(DATA_DIR, `db.backup.v${db.version || 1}.json`);
      try { fs.writeFileSync(backup, JSON.stringify(db, null, 1)); } catch (e) {}
      db = freshDb();
      persist();
      console.log(`Local DB migrated to SRS2 model (v${DB_VERSION}); previous data backed up next to db.json.`);
    }
  } catch (e) {
    db = freshDb();
    persist();
  }
  return db;
}
function persist() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DATA_FILE);
}

module.exports = {
  mode: "local",
  async init() { loadSync(); },

  /* ---------- masters (stored in db so the admin can create & control them) ---------- */
  async masters() { return loadSync().masters; },
  async upsertMaster(kind, obj, idField) {
    const d = loadSync();
    const list = d.masters[kind];
    if (!Array.isArray(list)) throw new Error(`Unknown master '${kind}'`);
    if (kind === "uoms") {
      const v = String(obj && obj.code != null ? obj.code : obj).trim();
      if (!v) throw new Error("UOM required");
      if (!list.includes(v)) list.push(v);
      persist();
      return v;
    }
    const key = idField || masterKey(kind);
    const id = obj[key];
    if (!id) throw new Error(`Field '${key}' is required`);
    const ix = list.findIndex(x => x[key] === id);
    if (ix >= 0) list[ix] = { ...list[ix], ...obj };
    else list.push(obj);
    persist();
    return list[ix >= 0 ? ix : list.length - 1];
  },
  async deleteMaster(kind, id) {
    const d = loadSync();
    const list = d.masters[kind];
    if (!Array.isArray(list)) throw new Error(`Unknown master '${kind}'`);
    if (kind === "uoms") d.masters.uoms = list.filter(u => u !== id);
    else {
      d.masters[kind] = list.filter(x => x[masterKey(kind)] !== id);
    }
    persist();
  },

  /* ---------- inventory ---------- */
  async getInventory() { return loadSync().inventory; },
  async stockOf(storeCode, itemCode) {
    const inv = loadSync().inventory;
    return (inv[storeCode] && inv[storeCode][itemCode]) || 0;
  },
  async adjustStock(storeCode, itemCode, dq) {
    const d = loadSync();
    d.inventory[storeCode] = d.inventory[storeCode] || {};
    const next = (d.inventory[storeCode][itemCode] || 0) + dq;
    if (next < -1e-9) throw new Error(`Insufficient stock of ${itemCode} in ${storeCode}`);
    d.inventory[storeCode][itemCode] = Math.max(0, +next.toFixed(3));
    persist();
    return d.inventory[storeCode][itemCode];
  },

  /* ---------- server-side carts (10-minute stock hold) ---------- */
  async getCart(userId) { return loadSync().carts[userId] || null; },
  async saveCart(userId, cart) {
    const d = loadSync();
    if (!cart || !cart.lines || !cart.lines.length) delete d.carts[userId];
    else d.carts[userId] = cart;
    persist();
  },
  async allCarts() { return loadSync().carts; },

  /* ---------- notifications ---------- */
  async addNotification(userId, msg) {
    const d = loadSync();
    d.notifications.unshift({ id: "N" + Date.now() + Math.random().toString(36).slice(2, 6), at: new Date().toISOString(), userId, msg, read: false });
    if (d.notifications.length > 500) d.notifications.length = 500;
    persist();
  },
  async listNotifications(userId) { return loadSync().notifications.filter(n => n.userId === userId); },
  async markNotificationsRead(userId) {
    const d = loadSync();
    for (const n of d.notifications) if (n.userId === userId) n.read = true;
    persist();
  },

  /* ---------- profiles ---------- */
  async getProfile(id) { return loadSync().profiles.find(p => p.id === id) || null; },
  async getProfileByEmail(email) {
    return loadSync().profiles.find(p => p.email.toLowerCase() === String(email).toLowerCase()) || null;
  },
  async getProfileByUsername(username) {
    const u = String(username || "").trim().toLowerCase();
    if (!u) return null;
    return loadSync().profiles.find(p => String(p.username || "").toLowerCase() === u) || null;
  },
  async createProfile(p) { loadSync().profiles.push(p); persist(); return p; },
  async updateProfile(id, patch) {
    const prof = loadSync().profiles.find(x => x.id === id);
    if (!prof) return null;
    Object.assign(prof, patch); persist(); return prof;
  },
  async listProfiles() { return loadSync().profiles; },
  async deleteProfile(id) {
    const d = loadSync();
    d.profiles = d.profiles.filter(p => p.id !== id);
    delete d.alloc[id];
    delete d.carts[id];
    persist();
  },

  /* ---------- allocations (keyed by price-list line key, e.g. "PL1#4") ---------- */
  async getAlloc(userId) {
    const a = loadSync().alloc[userId] || {};
    const consumption = {}, extra = {};
    for (const [key, v] of Object.entries(a)) { consumption[key] = v.consumed || 0; extra[key] = v.extra || 0; }
    return { consumption, extra };
  },
  async addConsumption(userId, key, dq) {
    const d = loadSync();
    d.alloc[userId] = d.alloc[userId] || {};
    d.alloc[userId][key] = d.alloc[userId][key] || { consumed: 0, extra: 0 };
    d.alloc[userId][key].consumed += dq;
    persist();
  },
  async addExtra(userId, key, dq) {
    const d = loadSync();
    d.alloc[userId] = d.alloc[userId] || {};
    d.alloc[userId][key] = d.alloc[userId][key] || { consumed: 0, extra: 0 };
    d.alloc[userId][key].extra += dq;
    persist();
  },

  /* ---------- orders ---------- */
  async createOrder(o) { loadSync().orders.unshift(o); persist(); return o; },
  async getOrder(ref) { return loadSync().orders.find(o => o.ref === ref) || null; },
  async listOrders() { return loadSync().orders; },
  async saveOrder(o) {
    const d = loadSync();
    const ix = d.orders.findIndex(x => x.ref === o.ref);
    if (ix >= 0) d.orders[ix] = o; else d.orders.unshift(o);
    persist();
  },

  /* ---------- sequences ---------- */
  async nextSeq(key) { const d = loadSync(); d.seq[key] = (d.seq[key] || 0) + 1; persist(); return d.seq[key]; },

  /* ---------- erp docs + log ---------- */
  async addErpDoc(kind, doc) {
    const d = loadSync();
    d.erp[kind] = d.erp[kind] || [];
    d.erp[kind].unshift(doc);
    persist();
    return doc;
  },
  async listErpDocs() { const d = loadSync(); return { so: [], dn: [], inv: [], ret: [], cn: [], stv: [], ...d.erp, log: d.log }; },
  async updateErpDoc(kind, ref, patch) {
    const doc = (loadSync().erp[kind] || []).find(x => x.ref === ref);
    if (doc) { Object.assign(doc, patch); persist(); }
    return doc;
  },
  async erpLog(msg) { loadSync().log.unshift({ at: new Date().toISOString(), msg }); persist(); }
};
