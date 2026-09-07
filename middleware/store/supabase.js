/** Supabase Postgres store — production mode (used when SUPABASE_URL is set).
 *  v3 (SRS2): masters in a flexible (kind,id,data) table, per-store inventory,
 *  server-side carts, notifications, allocations keyed by price-list line key.
 *  Run supabase/schema.sql then supabase/seed.sql in the Supabase SQL editor first. */
const { createClient } = require("@supabase/supabase-js");

let sb = null;
function client() {
  if (!sb) {
    sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false }
    });
  }
  return sb;
}
function ok(r) {
  if (r.error) throw new Error("Supabase: " + r.error.message);
  return r.data;
}
const P = "id, email, name, phone, telephone, username, emp_id, role, roles, customer, dept, location, price_list, price_lists, from_store, to_store, active, created_at";
const toProfile = r => r && ({
  id: r.id, email: r.email, name: r.name, phone: r.phone,
  telephone: r.telephone || "", username: r.username || "", empId: r.emp_id,
  role: r.role, roles: (r.roles && r.roles.length ? r.roles : [r.role]),
  customer: r.customer, dept: r.dept, location: r.location,
  priceList: r.price_list, priceLists: r.price_lists || [],
  fromStore: r.from_store, toStore: r.to_store,
  active: r.active, createdAt: r.created_at
});
const fromPatch = p => {
  const m = {};
  const map = { empId: "emp_id", priceList: "price_list", priceLists: "price_lists", fromStore: "from_store", toStore: "to_store", createdAt: "created_at" };
  for (const [k, v] of Object.entries(p)) m[map[k] || k] = v;
  return m;
};
const MASTER_ORDER = ["customers", "employees", "contracts", "departments", "locations", "divisions", "stores", "groups", "categories", "uoms", "items", "priceLists"];
const masterKey = kind =>
  kind === "customers" || kind === "priceLists" ? "id"
  : kind === "contracts" ? "ref"
  : kind === "employees" ? "empId"
  : "code";

module.exports = {
  mode: "supabase",
  async init() {
    ok(await client().from("masters").select("kind").limit(1)); // fail fast if schema missing
  },

  /* ---------- masters ---------- */
  async masters() {
    const rows = ok(await client().from("masters").select("kind, id, data"));
    const out = {};
    for (const kind of MASTER_ORDER) out[kind] = [];
    for (const r of rows) {
      if (!out[r.kind]) out[r.kind] = [];
      out[r.kind].push(r.data);
    }
    for (const kind of MASTER_ORDER) {
      const key = masterKey(kind);
      if (kind !== "uoms") out[kind].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
      else out.uoms.sort();
    }
    return out;
  },
  async upsertMaster(kind, obj) {
    if (kind === "uoms") {
      const v = String(obj && obj.code != null ? obj.code : obj).trim();
      ok(await client().from("masters").upsert({ kind, id: v, data: v }));
      return v;
    }
    const key = masterKey(kind);
    const existing = ok(await client().from("masters").select("data").eq("kind", kind).eq("id", obj[key]).maybeSingle());
    const merged = existing ? { ...existing.data, ...obj } : obj;
    ok(await client().from("masters").upsert({ kind, id: obj[key], data: merged }));
    return merged;
  },
  async deleteMaster(kind, id) {
    ok(await client().from("masters").delete().eq("kind", kind).eq("id", id));
  },

  /* ---------- inventory ---------- */
  async getInventory() {
    const rows = ok(await client().from("inventory").select("*"));
    const inv = {};
    for (const r of rows) {
      inv[r.store_code] = inv[r.store_code] || {};
      inv[r.store_code][r.item_code] = Number(r.qty);
    }
    return inv;
  },
  async stockOf(storeCode, itemCode) {
    const r = ok(await client().from("inventory").select("qty").eq("store_code", storeCode).eq("item_code", itemCode).maybeSingle());
    return r ? Number(r.qty) : 0;
  },
  async adjustStock(storeCode, itemCode, dq) {
    return Number(ok(await client().rpc("bump_stock", { p_store: storeCode, p_item: itemCode, p_dq: dq })));
  },

  /* ---------- carts ---------- */
  async getCart(userId) {
    const r = ok(await client().from("carts").select("data").eq("user_id", userId).maybeSingle());
    return r ? r.data : null;
  },
  async saveCart(userId, cart) {
    if (!cart || !cart.lines || !cart.lines.length)
      ok(await client().from("carts").delete().eq("user_id", userId));
    else
      ok(await client().from("carts").upsert({ user_id: userId, data: cart, updated_at: new Date().toISOString() }));
  },
  async allCarts() {
    const rows = ok(await client().from("carts").select("user_id, data"));
    const out = {};
    for (const r of rows) out[r.user_id] = r.data;
    return out;
  },

  /* ---------- notifications ---------- */
  async addNotification(userId, msg) {
    ok(await client().from("notifications").insert({ user_id: userId, msg }));
  },
  async listNotifications(userId) {
    return ok(await client().from("notifications").select("id, at, msg, read").eq("user_id", userId).order("id", { ascending: false }).limit(100))
      .map(n => ({ id: String(n.id), at: n.at, userId, msg: n.msg, read: n.read }));
  },
  async markNotificationsRead(userId) {
    ok(await client().from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false));
  },

  /* ---------- profiles ---------- */
  async getProfile(id) {
    return toProfile(ok(await client().from("profiles").select(P).eq("id", id).maybeSingle()));
  },
  async getProfileByEmail(email) {
    return toProfile(ok(await client().from("profiles").select(P).ilike("email", email).maybeSingle()));
  },
  async getProfileByUsername(username) {
    const u = String(username || "").trim();
    if (!u) return null;
    return toProfile(ok(await client().from("profiles").select(P).ilike("username", u).maybeSingle()));
  },
  async createProfile(p) {
    return toProfile(ok(await client().from("profiles").insert(fromPatch(p)).select(P).single()));
  },
  async updateProfile(id, patch) {
    return toProfile(ok(await client().from("profiles").update(fromPatch(patch)).eq("id", id).select(P).single()));
  },
  async listProfiles() {
    return ok(await client().from("profiles").select(P).order("created_at")).map(toProfile);
  },
  async deleteProfile(id) {
    ok(await client().from("allocations").delete().eq("user_id", id));
    ok(await client().from("carts").delete().eq("user_id", id));
    ok(await client().from("notifications").delete().eq("user_id", id));
    ok(await client().from("profiles").delete().eq("id", id));
  },

  /* ---------- allocations (keyed by price-list line key, e.g. "PL1#4") ---------- */
  async getAlloc(userId) {
    const rows = ok(await client().from("allocations").select("*").eq("user_id", userId));
    const consumption = {}, extra = {};
    rows.forEach(r => { consumption[r.code] = Number(r.consumed); extra[r.code] = Number(r.extra); });
    return { consumption, extra };
  },
  async addConsumption(userId, key, dq) {
    ok(await client().rpc("bump_allocation", { p_user: userId, p_code: key, p_consumed: dq, p_extra: 0 }));
  },
  async addExtra(userId, key, dq) {
    ok(await client().rpc("bump_allocation", { p_user: userId, p_code: key, p_consumed: 0, p_extra: dq }));
  },

  /* ---------- orders (jsonb payload keyed by ref) ---------- */
  async createOrder(o) {
    ok(await client().from("orders").insert({ ref: o.ref, data: o, emp: o.emp, status: o.status }));
    return o;
  },
  async getOrder(ref) {
    const r = ok(await client().from("orders").select("data").eq("ref", ref).maybeSingle());
    return r ? r.data : null;
  },
  async listOrders() {
    return ok(await client().from("orders").select("data").order("created_at", { ascending: false })).map(r => r.data);
  },
  async saveOrder(o) {
    ok(await client().from("orders").update({ data: o, status: o.status }).eq("ref", o.ref));
  },

  /* ---------- sequences (atomic via SQL function) ---------- */
  async nextSeq(key) {
    return ok(await client().rpc("next_seq", { p_key: key }));
  },

  /* ---------- erp docs + log ---------- */
  async addErpDoc(kind, doc) {
    ok(await client().from("erp_docs").insert({ ref: doc.ref, kind, data: doc }));
    return doc;
  },
  async listErpDocs() {
    const rows = ok(await client().from("erp_docs").select("kind, data").order("created_at", { ascending: false }));
    const log = ok(await client().from("erp_log").select("at, msg").order("id", { ascending: false }).limit(200));
    const out = { so: [], dn: [], inv: [], ret: [], cn: [], stv: [], log };
    rows.forEach(r => { if (out[r.kind]) out[r.kind].push(r.data); });
    return out;
  },
  async updateErpDoc(kind, ref, patch) {
    const r = ok(await client().from("erp_docs").select("id, data").eq("ref", ref).eq("kind", kind).maybeSingle());
    if (!r) return null;
    const doc = { ...r.data, ...patch };
    ok(await client().from("erp_docs").update({ data: doc }).eq("id", r.id));
    return doc;
  },
  async erpLog(msg) {
    ok(await client().from("erp_log").insert({ msg }));
  }
};
