import React, { createContext, useContext, useState } from "react";
import { api, setToken } from "./api";

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

export function StoreProvider({ children }) {
  const [user, setUser] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [orderCart, setOrderCart] = useState([]);     // [{code, qty}]
  const [approvalCart, setApprovalCart] = useState([]);

  async function login(empId, pin) {
    const r = await api("/api/auth/login", { method: "POST", body: { empId, pin } });
    await setToken(r.token);
    setUser(r.user);
    setCustomer(r.customer);
    if (r.user.role === "employee") await refreshCatalog();
    return r.user;
  }
  async function logout() {
    await setToken(null);
    setUser(null); setCustomer(null); setCatalog(null);
    setOrderCart([]); setApprovalCart([]);
  }
  async function refreshCatalog() {
    try { setCatalog(await api("/api/catalog")); } catch (e) {}
  }
  function addToCart(kind, code, qty) {
    const set = kind === "order" ? setOrderCart : setApprovalCart;
    set(prev => {
      const ex = prev.find(x => x.code === code);
      return ex
        ? prev.map(x => (x.code === code ? { ...x, qty: x.qty + qty } : x))
        : [...prev, { code, qty }];
    });
  }
  function removeFromCart(kind, code) {
    const set = kind === "order" ? setOrderCart : setApprovalCart;
    set(prev => prev.filter(x => x.code !== code));
  }
  function clearCart(kind) {
    (kind === "order" ? setOrderCart : setApprovalCart)([]);
  }

  return (
    <Ctx.Provider value={{
      user, customer, catalog, orderCart, approvalCart,
      login, logout, refreshCatalog, addToCart, removeFromCart, clearCart
    }}>
      {children}
    </Ctx.Provider>
  );
}
