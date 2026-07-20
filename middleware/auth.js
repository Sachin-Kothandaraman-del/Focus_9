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

/* ---------- signup ---------- */
async function signup({ email, password, name, phone }) {
  email = String(email || "").trim().toLowerCase();
  if (!email || !password || !name) throw Object.assign(new Error("Name, e-mail and password are required"), { status: 400 });
  if (String(password).length < 8) throw Object.assign(new Error("Password must be at least 8 characters"), { status: 400 });
  if (await store.getProfileByEmail(email)) throw Object.assign(new Error("An account with this e-mail already exists"), { status: 409 });

  const isAdmin = ADMIN_EMAILS.includes(email);
  let userId, session = null;

  if (SUPA) {
    // Create the user via the admin API with email_confirm so no confirmation
    // e-mail is needed (change email_confirm to false for production if you
    // want mandatory e-mail verification), then sign them in for a session.
    const r = await supaAdmin("POST", "users", { email, password, email_confirm: true });
    userId = r.id;
    const s = await supaAuth("token?grant_type=password", { email, password });
    session = { token: s.access_token, refreshToken: s.refresh_token };
  } else {
    userId = "local-" + Math.random().toString(36).slice(2, 10);
  }

  const empNum = await store.nextSeq("emp");
  const profile = await store.createProfile({
    id: userId, email, name: String(name).trim(), phone: phone || "",
    empId: "E" + empNum,
    role: isAdmin ? "admin" : "employee",
    customer: null, dept: null, priceList: null,
    active: isAdmin, createdAt: new Date().toISOString()
  });
  if (!SUPA) session = { token: signLocal(profile), refreshToken: null };
  return { profile, session, pendingActivation: !profile.active };
}

/* ---------- login ---------- */
async function login({ email, password }) {
  email = String(email || "").trim().toLowerCase();
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
      req.user = profile;
      next();
    } catch (e) {
      res.status(401).json({ error: "Session expired — please sign in again", expired: true });
    }
  };
}

module.exports = { signup, login, refresh, deleteAccount, requireAuth, SUPA };
