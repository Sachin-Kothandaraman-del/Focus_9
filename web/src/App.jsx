import React, { createContext, useContext, useEffect, useState } from "react";
import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import { api, setSession, hasSession } from "./api";

import AuthPage from "./pages/AuthPage.jsx";
import ShopPage from "./pages/ShopPage.jsx";
import CartsPage from "./pages/CartsPage.jsx";
import OrdersPage from "./pages/OrdersPage.jsx";
import ApprovalsPage from "./pages/ApprovalsPage.jsx";
import FulfilPage from "./pages/FulfilPage.jsx";
import UsersPage from "./pages/UsersPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export default function App() {
  const [user, setUser] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [pending, setPending] = useState(false);
  const [booting, setBooting] = useState(hasSession());
  const [catalog, setCatalog] = useState(null);
  const [orderCart, setOrderCart] = useState([]);
  const [approvalCart, setApprovalCart] = useState([]);

  async function refreshMe() {
    try {
      const p = await api("/api/profile");
      setUser(p.user); setCustomer(p.customer); setPending(!!p.pendingActivation);
      if (p.user.role === "employee" && !p.pendingActivation) refreshCatalog();
    } catch (e) {
      setSession(null, null); setUser(null);
    } finally {
      setBooting(false);
    }
  }
  useEffect(() => { if (hasSession()) refreshMe(); }, []);

  async function refreshCatalog() {
    try { setCatalog(await api("/api/catalog")); }
    catch (e) { if (e.pendingActivation) setPending(true); }
  }
  function logout() {
    setSession(null, null);
    setUser(null); setCustomer(null); setCatalog(null); setPending(false);
    setOrderCart([]); setApprovalCart([]);
  }
  function addToCart(kind, code, qty) {
    const set = kind === "order" ? setOrderCart : setApprovalCart;
    set(prev => {
      const ex = prev.find(x => x.code === code);
      return ex ? prev.map(x => (x.code === code ? { ...x, qty: x.qty + qty } : x)) : [...prev, { code, qty }];
    });
  }
  const removeFromCart = (kind, code) =>
    (kind === "order" ? setOrderCart : setApprovalCart)(p => p.filter(x => x.code !== code));
  const clearCart = kind => (kind === "order" ? setOrderCart : setApprovalCart)([]);

  const ctx = {
    user, customer, pending, catalog, orderCart, approvalCart,
    setUser, setCustomer, setPending, refreshMe, refreshCatalog, logout,
    addToCart, removeFromCart, clearCart
  };

  if (booting) return <div className="empty" style={{ paddingTop: 120 }}>Loading…</div>;
  if (!user) return <Ctx.Provider value={ctx}><AuthPage /></Ctx.Provider>;

  if (user.role === "employee" && pending) {
    return (
      <Ctx.Provider value={ctx}>
        <div className="authwrap">
          <div className="authbox" style={{ textAlign: "center", color: "#fff" }}>
            <div style={{ fontSize: "3rem" }}>⏳</div>
            <h1 style={{ color: "#fff" }}>Account awaiting activation</h1>
            <p style={{ color: "#a9c3da" }}>
              Hi {user.name}. The PROSAFE admin still needs to assign your company, department and approved price list.
            </p>
            <button className="btn" onClick={refreshMe}>Check again</button>{" "}
            <button className="btn ghost" onClick={logout}>Sign out</button>
          </div>
        </div>
      </Ctx.Provider>
    );
  }

  const cartCount = orderCart.length + approvalCart.length;
  const links = user.role === "employee"
    ? [["/shop", "🛒 Shop"], ["/carts", `🧺 Carts${cartCount ? ` (${cartCount})` : ""}`], ["/orders", "📦 My Orders"], ["/profile", "👤 My Limits"]]
    : user.role === "approver"
      ? [["/approvals", "✅ Approvals"], ["/orders", "🗂️ All Orders"], ["/profile", "👤 Profile"]]
      : [["/fulfil", "🚚 Fulfilment"], ["/orders", "🗂️ All Orders"], ["/users", "👥 Users"], ["/profile", "👤 Profile"]];
  const home = links[0][0];

  return (
    <Ctx.Provider value={ctx}>
      <div className="shell">
        <aside className="side">
          <div>
            <div className="logo">PRO<span>SAFE</span></div>
            <div className="who">{user.name}<br />{user.empId} · {user.role}</div>
          </div>
          <nav>
            {links.map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}
            <a onClick={logout} style={{ cursor: "pointer" }}>🚪 Sign out</a>
          </nav>
        </aside>
        <main className="main">
          <Routes>
            <Route path="/shop" element={<ShopPage />} />
            <Route path="/carts" element={<CartsPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/approvals" element={<ApprovalsPage />} />
            <Route path="/fulfil" element={<FulfilPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="*" element={<Navigate to={home} replace />} />
          </Routes>
        </main>
      </div>
    </Ctx.Provider>
  );
}
