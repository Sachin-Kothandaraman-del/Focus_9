/** Supabase Postgres store — production mode (used when SUPABASE_URL is set).
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
const P = "id, email, name, phone, emp_id, role, customer, dept, price_list, active, created_at";
const toProfile = r => r && ({
  id: r.id, email: r.email, name: r.name, phone: r.phone, empId: r.emp_id,
  role: r.role, customer: r.customer, dept: r.dept, priceList: r.price_list,
  active: r.active, createdAt: r.created_at
});
const fromPatch = p => {
  const m = {}; const map = { empId: "emp_id", priceList: "price_list", createdAt: "created_at" };
  for (const [k, v] of Object.entries(p)) m[map[k] || k] = v;
  return m;
};

module.exports = {
  mode: "supabase",
  async init() {
    ok(await client().from("customers").select("id").limit(1)); // fail fast if schema missing
  },

  /* masters */
  async masters() {
    const [customers, deps, locs, uoms, items, pls, pll] = await Promise.all([
      client().from("customers").select("*").order("id"),
      client().from("departments").select("name").order("name"),
      client().from("locations").select("name").order("name"),
      client().from("uoms").select("name").order("name"),
      client().from("items").select("*").order("code"),
      client().from("price_lists").select("*").order("id"),
      client().from("price_list_lines").select("*")
    ]);
    const lines = ok(pll);
    return {
      customers: ok(customers),
      departments: ok(deps).map(x => x.name),
      locations: ok(locs).map(x => x.name),
      uoms: ok(uoms).map(x => x.name),
      items: ok(items).map(i => ({ code: i.code, name: i.name, desc: i.descr, alias: i.alias, uom: i.uom, group: i.grp, cat: i.cat, pic: i.pic })),
      priceLists: ok(pls).map(p => ({
        id: p.id, name: p.name, contract: p.contract, customer: p.customer,
        validFrom: p.valid_from, validTill: p.valid_till,
        lines: lines.filter(l => l.pl === p.id).map(l => ({ code: l.code, price: Number(l.price), alloc: l.alloc, restricted: l.restricted }))
      }))
    };
  },

  /* profiles */
  async getProfile(id) {
    return toProfile(ok(await client().from("profiles").select(P).eq("id", id).maybeSingle()));
  },
  async getProfileByEmail(email) {
    return toProfile(ok(await client().from("profiles").select(P).ilike("email", email).maybeSingle()));
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
    ok(await client().from("profiles").delete().eq("id", id));
  },

  /* allocations */
  async getAlloc(userId) {
    const rows = ok(await client().from("allocations").select("*").eq("user_id", userId));
    const consumption = {}, extra = {};
    rows.forEach(r => { consumption[r.code] = Number(r.consumed); extra[r.code] = Number(r.extra); });
    return { consumption, extra };
  },
  async addConsumption(userId, code, dq) {
    ok(await client().rpc("bump_allocation", { p_user: userId, p_code: code, p_consumed: dq, p_extra: 0 }));
  },
  async addExtra(userId, code, dq) {
    ok(await client().rpc("bump_allocation", { p_user: userId, p_code: code, p_consumed: 0, p_extra: dq }));
  },

  /* orders (jsonb payload keyed by ref) */
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

  /* sequences (atomic via SQL function) */
  async nextSeq(key) {
    return ok(await client().rpc("next_seq", { p_key: key }));
  },

  /* erp docs + log */
  async addErpDoc(kind, doc) {
    ok(await client().from("erp_docs").insert({ ref: doc.ref, kind, data: doc }));
    return doc;
  },
  async listErpDocs() {
    const rows = ok(await client().from("erp_docs").select("kind, data").order("created_at", { ascending: false }));
    const log = ok(await client().from("erp_log").select("at, msg").order("id", { ascending: false }).limit(200));
    const out = { so: [], dn: [], inv: [], ret: [], log };
    rows.forEach(r => { if (out[r.kind]) out[r.kind].push(r.data); });
    return out;
  },
  async updateErpDoc(kind, ref, patch) {
    const r = ok(await client().from("erp_docs").select("data").eq("ref", ref).eq("kind", kind).maybeSingle());
    if (!r) return null;
    const doc = { ...r.data, ...patch };
    ok(await client().from("erp_docs").update({ data: doc }).eq("ref", ref).eq("kind", kind));
    return doc;
  },
  async erpLog(msg) {
    ok(await client().from("erp_log").insert({ msg }));
  }
};
