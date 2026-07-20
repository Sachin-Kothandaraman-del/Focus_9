/** Local JSON-file store — demo/dev mode (used when SUPABASE_URL is not set). */
const fs = require("fs");
const path = require("path");
const seed = require("./seed-data");

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");
let db = null;

function loadSync() {
  if (db) return db;
  try {
    db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {
    db = {
      profiles: seed.demoUsers.map(u => ({ ...u, createdAt: new Date().toISOString() })),
      alloc: {},            // alloc[userId][code] = { consumed, extra }
      orders: [],
      erp: { so: [], dn: [], inv: [], ret: [] },
      log: [],
      seq: { ...seed.seq }
    };
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

  /* masters (static from seed in local mode) */
  async masters() {
    const { customers, departments, locations, uoms, items, priceLists } = seed;
    return { customers, departments, locations, uoms, items, priceLists };
  },

  /* profiles */
  async getProfile(id) { return loadSync().profiles.find(p => p.id === id) || null; },
  async getProfileByEmail(email) {
    return loadSync().profiles.find(p => p.email.toLowerCase() === String(email).toLowerCase()) || null;
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
    persist();
  },

  /* allocations */
  async getAlloc(userId) {
    const a = loadSync().alloc[userId] || {};
    const consumption = {}, extra = {};
    for (const [code, v] of Object.entries(a)) { consumption[code] = v.consumed || 0; extra[code] = v.extra || 0; }
    return { consumption, extra };
  },
  async addConsumption(userId, code, dq) {
    const d = loadSync();
    d.alloc[userId] = d.alloc[userId] || {};
    d.alloc[userId][code] = d.alloc[userId][code] || { consumed: 0, extra: 0 };
    d.alloc[userId][code].consumed += dq;
    persist();
  },
  async addExtra(userId, code, dq) {
    const d = loadSync();
    d.alloc[userId] = d.alloc[userId] || {};
    d.alloc[userId][code] = d.alloc[userId][code] || { consumed: 0, extra: 0 };
    d.alloc[userId][code].extra += dq;
    persist();
  },

  /* orders */
  async createOrder(o) { loadSync().orders.unshift(o); persist(); return o; },
  async getOrder(ref) { return loadSync().orders.find(o => o.ref === ref) || null; },
  async listOrders() { return loadSync().orders; },
  async saveOrder(o) {
    const d = loadSync();
    const ix = d.orders.findIndex(x => x.ref === o.ref);
    if (ix >= 0) d.orders[ix] = o; else d.orders.unshift(o);
    persist();
  },

  /* sequences */
  async nextSeq(key) { const d = loadSync(); d.seq[key] = (d.seq[key] || 0) + 1; persist(); return d.seq[key]; },

  /* erp docs + log */
  async addErpDoc(kind, doc) { loadSync().erp[kind].unshift(doc); persist(); return doc; },
  async listErpDocs() { const d = loadSync(); return { ...d.erp, log: d.log }; },
  async updateErpDoc(kind, ref, patch) {
    const doc = loadSync().erp[kind].find(x => x.ref === ref);
    if (doc) { Object.assign(doc, patch); persist(); }
    return doc;
  },
  async erpLog(msg) { loadSync().log.unshift({ at: new Date().toISOString(), msg }); persist(); }
};
