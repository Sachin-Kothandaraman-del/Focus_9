import React, { createContext, useContext, useState } from "react";
import { api, setSession } from "./api";

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

export function StoreProvider({ children }) {
  const [user, setUser] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [pending, setPending] = useState(false);   // account awaiting admin activation
  const [catalog, setCatalog] = useState(null);
  const [orderCart, setOrderCart] = useState([]);
  const [approvalCart, setApprovalCart] = useState([]);

  async function login(email, password) {
    const r = await api("/api/auth/login", { method: "POST", body: { email, password } });
    await setSession(r.token, r.refreshToken);
    setUser(r.user); setCustomer(r.customer); setPending(!!r.pendingActivation);
    if (r.user.role === "employee" && !r.pendingActivation) await refreshCatalog();
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
      if (p.user.role === "employee" && !p.pendingActivation) await refreshCatalog();
    } catch (e) {}
  }

  async function logout() {
    await setSession(null, null);
    setUser(null); setCustomer(null); setCatalog(null); setPending(false);
    setOrderCart([]); setApprovalCart([]);
  }

  async function deleteAccount() {
    await api("/api/auth/account", { method: "DELETE" });
    await logout();
  }

  async function refreshCatalog() {
    try { setCatalog(await api("/api/catalog")); }
    catch (e) { if (e.pendingActivation) setPending(true); }
  }

  function addToCart(kind, code, qty) {
    const set = kind === "order" ? setOrderCart : setApprovalCart;
    set(prev => {
      const ex = prev.find(x => x.code === code);
      return ex ? prev.map(x => (x.code === code ? { ...x, qty: x.qty + qty } : x)) : [...prev, { code, qty }];
    });
  }
  function removeFromCart(kind, code) {
    (kind === "order" ? setOrderCart : setApprovalCart)(prev => prev.filter(x => x.code !== code));
  }
  function clearCart(kind) {
    (kind === "order" ? setOrderCart : setApprovalCart)([]);
  }

  return (
    <Ctx.Provider value={{
      user, customer, pending, catalog, orderCart, approvalCart,
      login, signup, logout, deleteAccount, refreshMe, refreshCatalog,
      addToCart, removeFromCart, clearCart
    }}>
      {children}
    </Ctx.Provider>
  );
}
