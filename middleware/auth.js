/**
 * Auth: account creation, login, token verification, account deletion.
 *  - Supabase mode: Supabase Auth (email/password) via its REST API; middleware
 *    verifies access tokens by calling /auth/v1/user (cached 60s).
 *  - Local mode: demo users (password "prosafe1" for all) + middleware-signed JWTs.
 * Clients never see Supabase keys other than what the middleware chooses to use.
 */
const jwt = require("jsonwebtoken");
const store = require("./store");

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const SUPA = !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
const LOCAL_DEMO_PASSWORD = "prosafe1";
const MIN_PASSWORD = 6;               // SRS2 registration screen: minimum 6 characters

/* Field lengths from the SRS2 registration screen. */
const LIMITS = { empId: 15, phone: 15, name: 30, customer: 35, dept: 25, location: 25, telephone: 15, email: 30, username: 8 };
const cut = (v, k) => String(v == null ? "" : v).trim().slice(0, LIMITS[k]);
const digits = v => String(v || "").replace(/\D/g, "");

/* ---------- Employee Master ----------
   SRS2: registration is only allowed to somebody who is already in the
   Employee Master, and TWO data points must match — Employee ID and Mobile
   Phone. Everything else on the form is filled in from the master record. */
async function employeeMaster() {
  const m = await store.masters();
  return Array.isArray(m.employees) ? m.employees : [];
}
async function matchEmployee({ empId, phone }) {
  const id = String(empId || "").trim();
  const ph = digits(phone);
  if (!id || !ph) {
    const e = new Error("Employee ID and Mobile Phone are both required — they are checked against the Employee Master");
    e.status = 400; throw e;
  }
  const list = await employeeMaster();
  const byId = list.find(x => String(x.empId || "").trim().toLowerCase() === id.toLowerCase());
  if (!byId || digits(byId.phone) !== ph) {
    const e = new Error("Employee ID and Mobile Phone do not match the Employee Master — registration is not possible. Please contact your PROSAFE administrator.");
    e.status = 403; e.employeeValidation = "failed"; throw e;
  }
  return byId;
}

/* ---------- Supabase Auth REST helpers ---------- */
async function supaAuth(path, body, token) {
  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.SUPABASE_ANON_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.msg || data.error_description || data.message || `Auth error (${res.status})`;
    const e = new Error(msg); e.status = res.status; throw e;
  }
  return data;
}
async function supaAdmin(method, path, body) {
  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Supabase admin API ${path} → ${res.status}${t ? ": " + t.slice(0, 200) : ""}`);
  }
  return res.json().catch(() => ({}));
}

/* ---------- signup (employee self-registration) ---------- */
async function signup(body) {
  const email = cut(body.email, "email").toLowerCase();
  const password = String(body.password || "");
  const confirm = body.confirmPassword == null ? password : String(body.confirmPassword);
  if (!email || !password) throw Object.assign(new Error("E-mail and password are required"), { status: 400 });
  if (password.length < MIN_PASSWORD) throw Object.assign(new Error(`Password must be at least ${MIN_PASSWORD} characters`), { status: 400 });
  if (password !== confirm) throw Object.assign(new Error("Password and Confirm Password do not match"), { status: 400 });
  if (await store.getProfileByEmail(email)) throw Object.assign(new Error("An account with this e-mail already exists"), { status: 409 });

  const isAdmin = ADMIN_EMAILS.includes(email);

  /* The bootstrap admin address (ADMIN_EMAILS) may register without an
     Employee Master record; everybody else is validated against it. */
  let emp = null, username = "";
  if (!isAdmin) {
    emp = await matchEmployee({ empId: body.empId, phone: body.phone });
    username = cut(body.username, "username");
    if (!username) throw Object.assign(new Error("Please choose a User Name (up to 8 characters)"), { status: 400 });
    if (!/^[A-Za-z0-9._-]+$/.test(username)) throw Object.assign(new Error("User Name may contain letters, numbers, dot, dash and underscore only"), { status: 400 });
    if (store.getProfileByUsername && await store.getProfileByUsername(username))
      throw Object.assign(new Error("That User Name is already taken — please choose another"), { status: 409 });
  }

  const profile = await createLogin({
    email, password,
    name: emp ? cut(emp.name, "name") : cut(body.name, "name") || email.split("@")[0],
    phone: emp ? cut(emp.phone, "phone") : cut(body.phone, "phone"),
    telephone: emp ? cut(emp.telephone, "telephone") : cut(body.telephone, "telephone"),
    username,
    empId: emp ? emp.empId : null,
    /* Auto-filled from the Employee Master — the admin still activates the
       account and assigns the price list(s) and stores. */
    customer: emp ? emp.customer || null : null,
    dept: emp ? emp.dept || null : null,
    location: emp ? emp.location || null : null,
    roles: isAdmin ? ["admin"] : ["employee"],
    role: isAdmin ? "admin" : "employee",
    active: isAdmin
  });
  return { profile, session: profile.__session, pendingActivation: !profile.active };
}

/* Creates the auth user + profile. Used by self-registration and by the Admin
   Module, which sets up store / approver / admin log-ins directly with an
   e-mail and a password — those have no Employee Master dependency, because
   (SRS2) the stores are under PROSAFE control, not EGA employees. */
async function createLogin(p) {
  const email = String(p.email).trim().toLowerCase();
  let userId, session = null;
  if (SUPA) {
    const r = await supaAdmin("POST", "users", { email, password: p.password, email_confirm: true });
    userId = r.id;
    try {
      const s = await supaAuth("token?grant_type=password", { email, password: p.password });
      session = { token: s.access_token, refreshToken: s.refresh_token };
    } catch (e) { session = null; }
  } else {
    userId = "local-" + Math.random().toString(36).slice(2, 10);
  }
  const empId = p.empId || "E" + (await store.nextSeq("emp"));
  const profile = await store.createProfile({
    id: userId, email, name: p.name, phone: p.phone || "", telephone: p.telephone || "",
    username: p.username || "", empId,
    role: p.role, roles: p.roles && p.roles.length ? p.roles : [p.role],
    customer: p.customer || null, dept: p.dept || null, location: p.location || null,
    priceList: null, priceLists: [], fromStore: p.fromStore || null, toStore: p.toStore || null,
    active: !!p.active, createdAt: new Date().toISOString()
  });
  if (!SUPA) session = { token: signLocal(profile), refreshToken: null };
  Object.defineProperty(profile, "__session", { value: session, enumerable: false });
  return profile;
}

/* Admin Module: create a log-in for a store / approver / admin (or an
   employee, if the admin prefers to do it for them). */
async function adminCreateLogin(body) {
  const email = cut(body.email, "email").toLowerCase();
  const password = String(body.password || "");
  const role = String(body.role || "").trim();
  if (!email || !password) throw Object.assign(new Error("E-mail and password are required"), { status: 400 });
  if (password.length < MIN_PASSWORD) throw Object.assign(new Error(`Password must be at least ${MIN_PASSWORD} characters`), { status: 400 });
  if (!["employee", "approver", "store", "admin"].includes(role))
    throw Object.assign(new Error("role must be employee|approver|store|admin"), { status: 400 });
  if (!String(body.name || "").trim()) throw Object.assign(new Error("Name is required"), { status: 400 });
  if (await store.getProfileByEmail(email)) throw Object.assign(new Error("An account with this e-mail already exists"), { status: 409 });
  const username = cut(body.username, "username");
  if (username && store.getProfileByUsername && await store.getProfileByUsername(username))
    throw Object.assign(new Error("That User Name is already taken"), { status: 409 });

  const roles = Array.isArray(body.roles) && body.roles.length ? body.roles : [role];
  const profile = await createLogin({
    email, password, name: cut(body.name, "name"),
    phone: cut(body.phone, "phone"), telephone: cut(body.telephone, "telephone"),
    username, empId: body.empId ? cut(body.empId, "empId") : null,
    role, roles,
    customer: body.customer || null, dept: body.dept || null, location: body.location || null,
    fromStore: body.fromStore || null, toStore: body.toStore || null,
    /* Store, approver and admin log-ins work immediately; an employee log-in
       still needs a price list, so it follows the normal activation flow. */
    active: role !== "employee"
  });
  return profile;
}

/* ---------- login ---------- */
async function login({ email, password, username }) {
  /* The employee chooses a User Name at registration (SRS2) — either that or
     the e-mail address signs them in. Supabase Auth needs the e-mail, so a
     user name is resolved to one first. */
  let ident = String(email || username || "").trim();
  if (ident && !ident.includes("@") && store.getProfileByUsername) {
    const byName = await store.getProfileByUsername(ident);
    if (byName) ident = byName.email;
  }
  email = ident.toLowerCase();
  if (SUPA) {
    const r = await supaAuth("token?grant_type=password", { email, password });
    const profile = await store.getProfile(r.user.id);
    if (!profile) throw Object.assign(new Error("Account exists but has no profile — contact admin"), { status: 403 });
    return { profile, session: { token: r.access_token, refreshToken: r.refresh_token } };
  }
  const profile = await store.getProfileByEmail(email);
  if (!profile || password !== LOCAL_DEMO_PASSWORD)
    throw Object.assign(new Error(`Invalid e-mail or password (local demo password: ${LOCAL_DEMO_PASSWORD})`), { status: 401 });
  return { profile, session: { token: signLocal(profile), refreshToken: null } };
}

async function refresh(refreshToken) {
  if (!SUPA) throw Object.assign(new Error("Refresh not needed in local mode"), { status: 400 });
  const r = await supaAuth("token?grant_type=refresh_token", { refresh_token: refreshToken });
  return { token: r.access_token, refreshToken: r.refresh_token };
}

/* ---------- account deletion (Play Store requirement) ---------- */
async function deleteAccount(userId) {
  await store.deleteProfile(userId);          // profile + allocations; orders kept as business records (name snapshotted)
  if (SUPA) await supaAdmin("DELETE", `users/${userId}`);
}

/* ---------- token verification middleware ---------- */
function signLocal(profile) {
  return jwt.sign({ sub: profile.id, mode: "local" }, SECRET, { expiresIn: "12h" });
}
const cache = new Map(); // token → { userId, exp }
async function userIdFromToken(token) {
  const hit = cache.get(token);
  if (hit && hit.exp > Date.now()) return hit.userId;
  let userId;
  if (SUPA) {
    const u = await supaAuth("user", null, token);
    userId = u.id;
  } else {
    userId = jwt.verify(token, SECRET).sub;
  }
  cache.set(token, { userId, exp: Date.now() + 60000 });
  if (cache.size > 5000) cache.clear();
  return userId;
}

function requireAuth(...roles) {
  return async (req, res, next) => {
    try {
      const h = req.headers.authorization || "";
      const token = h.startsWith("Bearer ") ? h.slice(7) : null;
      if (!token) return res.status(401).json({ error: "Unauthorized" });
      const uid = await userIdFromToken(token);
      const profile = await store.getProfile(uid);
      if (!profile) return res.status(401).json({ error: "Account no longer exists" });
      if (roles.length && !roles.includes(profile.role))
        return res.status(403).json({ error: "Forbidden for role " + profile.role });
      /* Approver / Store / Admin modules also need an active account. The
         Employee Module keeps its own "pending activation" answer, which the
         apps use to show the waiting screen. */
      if (roles.length && !roles.includes("employee") && !profile.active)
        return res.status(403).json({ error: "This account has been deactivated — please contact the PROSAFE admin" });
      req.user = profile;
      next();
    } catch (e) {
      res.status(401).json({ error: "Session expired — please sign in again", expired: true });
    }
  };
}

module.exports = { signup, login, refresh, deleteAccount, requireAuth, adminCreateLogin, matchEmployee, LIMITS, MIN_PASSWORD, SUPA };
