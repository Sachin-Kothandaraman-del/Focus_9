const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

let token = localStorage.getItem("jwt") || null;
let refreshToken = localStorage.getItem("jwt_refresh") || null;

export function setSession(t, rt) {
  token = t; refreshToken = rt || null;
  if (t) localStorage.setItem("jwt", t); else localStorage.removeItem("jwt");
  if (rt) localStorage.setItem("jwt_refresh", rt); else localStorage.removeItem("jwt_refresh");
}
export function hasSession() { return !!token; }

async function rawFetch(path, method, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  return { res, data };
}

export async function api(path, { method = "GET", body } = {}) {
  let { res, data } = await rawFetch(path, method, body);
  if (res.status === 401 && data && data.expired && refreshToken) {
    try {
      const r = await rawFetch("/api/auth/refresh", "POST", { refreshToken });
      if (r.res.ok && r.data && r.data.token) {
        setSession(r.data.token, r.data.refreshToken || refreshToken);
        ({ res, data } = await rawFetch(path, method, body));
      }
    } catch (e) {}
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    err.needsApproval = data && data.needsApproval;
    err.pendingActivation = data && data.pendingActivation;
    throw err;
  }
  return data;
}
