import * as SecureStore from "expo-secure-store";
import { API_URL } from "./config";

let token = null;

export async function loadToken() {
  try { token = await SecureStore.getItemAsync("jwt"); } catch (e) { token = null; }
  return token;
}
export async function setToken(t) {
  token = t;
  try {
    if (t) await SecureStore.setItemAsync("jwt", t);
    else await SecureStore.deleteItemAsync("jwt");
  } catch (e) {}
}

export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    err.needsApproval = data && data.needsApproval;
    throw err;
  }
  return data;
}
