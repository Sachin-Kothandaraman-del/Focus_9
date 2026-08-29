import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { api, setSession } from "./api";

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

const EMPTY_CART = { order: [], approval: [], startedAt: null, expiresAt: null, remainingSec: null, fromStore: null, toStore: null };

export function StoreProvider({ children }) {
  const [user, setUser] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [pending, setPending] = useState(false);       // account awaiting admin activation
  const [catalog, setCatalog] = useState(null);        // { profiles: [...] } — one per price list (SRS2)
  const [cart, setCart] = useState(EMPTY_CART);        // server-side cart (10-min stock hold)
  const [remainingSec, setRemainingSec] = useState(null);
  const [notif, setNotif] = useState({ unread: 0, notifications: [] });
  const expiredHandled = useRef(false);

  async function login(email, password) {
    const r = await api("/api/auth/login", { method: "POST", body: { email, password } });
    await setSession(r.token, r.refreshToken);
    setUser(r.user); setCustomer(r.customer); setPending(!!r.pendingActivation);
    if (r.user.role === "employee" && !r.pendingActivation) { await refreshCatalog(); await refreshCart(); }
    return r;
  }

  async function signup({ name, email, phone, password }) {
    const r = await api("/api/auth/signup", { method: "POST", body: { name, email, phone, password } });
    if (r.token) {
      await setSession(r.token, r.refreshToken);
      setUser(r.user); setPending(!!r.pendingActivation);
    }
    return r; // r.emailConfirmationRequired → caller shows "check your inbox"
  }

  async function refreshMe() {
    try {
      const p = await api("/api/profile");
      setUser(p.user); setCustomer(p.customer); setPending(!!p.pendingActivation);
      if (p.user.role === "employee" && !p.pendingActivation) { await refreshCatalog(); await refreshCart(); }
    } catch (e) {}
  }

  async function logout() {
    await setSession(null, null);
    setUser(null); setCustomer(null); setCatalog(null); setPending(false);
    setCart(EMPTY_CART); setNotif({ unread: 0, notifications: [] });
  }

  async function deleteAccount() {
    await api("/api/auth/account", { method: "DELETE" });
    await logout();
  }

  async function refreshCatalog() {
    try { setCatalog(await api("/api/catalog")); }
    catch (e) { if (e.pendingActivation) setPending(true); }
  }
  async function refreshCart() {
    try {
      const c = await api("/api/cart");
      setCart(c); setRemainingSec(c.remainingSec);
      expiredHandled.current = false;
    } catch (e) {}
  }
  async function refreshNotifications() {
    try { setNotif(await api("/api/notifications")); } catch (e) {}
  }

  /* 10-minute countdown — the server empties expired carts and releases stock. */
  useEffect(() => {
    if (!cart.expiresAt) { setRemainingSec(null); return; }
    const t = setInterval(() => {
      const left = Math.max(0, Math.floor((Date.parse(cart.expiresAt) - Date.now()) / 1000));
      setRemainingSec(left);
      if (left <= 0 && !expiredHandled.current) {
        expiredHandled.current = true;
        Alert.alert("Cart expired", "The 10-minute shopping window has expired — your cart was emptied and the picked quantities were released back to the Main store. Please shop again.");
        refreshCart(); refreshCatalog();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [cart.expiresAt]);

  useEffect(() => {
    if (!user) return;
    refreshNotifications();
    const t = setInterval(refreshNotifications, 30000);
    return () => clearInterval(t);
  }, [user?.id]);

  /* returns { ok, needsApproval, notice, error } */
  async function addToCart(plId, code, qty, toApproval = false) {
    try {
      const r = await api("/api/cart/items", { method: "POST", body: { plId, code, qty, toApproval } });
      setCart(r); setRemainingSec(r.remainingSec);
      expiredHandled.current = false;
      if (qty > 0) refreshCatalog();
      return { ok: true, notice: r.notice, addedTo: r.addedTo };
    } catch (e) {
      if (e.needsApproval) return { ok: false, needsApproval: true, error: e.message };
      return { ok: false, error: e.message };
    }
  }
  async function removeCartLine(id) {
    try { const r = await api(`/api/cart/items/${id}`, { method: "DELETE" }); setCart(r); setRemainingSec(r.remainingSec); refreshCatalog(); }
    catch (e) { Alert.alert("Error", e.message); }
  }
  async function clearCart(kind) {
    try { const r = await api("/api/cart/clear", { method: "POST", body: { kind } }); setCart(r); setRemainingSec(r.remainingSec); refreshCatalog(); }
    catch (e) {}
  }
  async function markNotificationsRead() {
    try { await api("/api/notifications/read", { method: "POST" }); refreshNotifications(); } catch (e) {}
  }

  return (
    <Ctx.Provider value={{
      user, customer, pending, catalog, cart, remainingSec, notif,
      orderCart: cart.order, approvalCart: cart.approval,
      login, signup, logout, deleteAccount, refreshMe, refreshCatalog, refreshCart,
      addToCart, removeCartLine, clearCart, refreshNotifications, markNotificationsRead
    }}>
      {children}
    </Ctx.Provider>
  );
}
