import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import { api, setSession, hasSession } from "./api";

import AuthPage from "./pages/AuthPage.jsx";
import ShopPage from "./pages/ShopPage.jsx";
import CartsPage from "./pages/CartsPage.jsx";
import OrdersPage from "./pages/OrdersPage.jsx";
import ApprovalsPage from "./pages/ApprovalsPage.jsx";
import FulfilPage from "./pages/FulfilPage.jsx";
import InventoryPage from "./pages/InventoryPage.jsx";
import MastersPage from "./pages/MastersPage.jsx";
import UsersPage from "./pages/UsersPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const EMPTY_CART = { order: [], approval: [], startedAt: null, expiresAt: null, remainingSec: null };

export default function App() {
  const [user, setUser] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [pending, setPending] = useState(false);
  const [booting, setBooting] = useState(hasSession());
  const [catalog, setCatalog] = useState(null);       // { profiles: [...] } — one per assigned price list
  const [cart, setCart] = useState(EMPTY_CART);       // server-side cart (10-min stock hold)
  const [remainingSec, setRemainingSec] = useState(null);
  const [notif, setNotif] = useState({ unread: 0, notifications: [] });
  const expiredHandled = useRef(false);

  async function refreshMe() {
    try {
      const p = await api("/api/profile");
      setUser(p.user); setCustomer(p.customer); setPending(!!p.pendingActivation);
      if (p.user.role === "employee" && !p.pendingActivation) { refreshCatalog(); refreshCart(); }
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

  /* 10-minute countdown — when it hits zero the server empties the cart and
     releases the reserved stock, so re-sync cart + catalog. */
  useEffect(() => {
    if (!cart.expiresAt) { setRemainingSec(null); return; }
    const t = setInterval(() => {
      const left = Math.max(0, Math.floor((Date.parse(cart.expiresAt) - Date.now()) / 1000));
      setRemainingSec(left);
      if (left <= 0 && !expiredHandled.current) {
        expiredHandled.current = true;
        alert("⏱ The 10-minute shopping window has expired — your cart was emptied and the picked quantities were released back to the Main store. Please shop again.");
        refreshCart(); refreshCatalog();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [cart.expiresAt]);

  /* notification polling */
  useEffect(() => {
    if (!user) return;
    refreshNotifications();
    const t = setInterval(refreshNotifications, 30000);
    return () => clearInterval(t);
  }, [user?.id]);

  function logout() {
    setSession(null, null);
    setUser(null); setCustomer(null); setCatalog(null); setPending(false);
    setCart(EMPTY_CART); setNotif({ unread: 0, notifications: [] });
  }

  /* returns { ok, needsApproval, notice, error } */
  async function addToCart(plId, code, qty, toApproval = false) {
    try {
      const r = await api("/api/cart/items", { method: "POST", body: { plId, code, qty, toApproval } });
      setCart(r); setRemainingSec(r.remainingSec);
      expiredHandled.current = false;
      if (qty > 0) refreshCatalog();            // stock counters changed
      return { ok: true, notice: r.notice, addedTo: r.addedTo };
    } catch (e) {
      if (e.needsApproval) return { ok: false, needsApproval: true, error: e.message };
      return { ok: false, error: e.message };
    }
  }
  async function removeCartLine(id) {
    try { const r = await api(`/api/cart/items/${id}`, { method: "DELETE" }); setCart(r); setRemainingSec(r.remainingSec); refreshCatalog(); }
    catch (e) { alert(e.message); }
  }
  async function clearCart(kind) {
    try { const r = await api("/api/cart/clear", { method: "POST", body: { kind } }); setCart(r); setRemainingSec(r.remainingSec); refreshCatalog(); }
    catch (e) { alert(e.message); }
  }
  async function markNotificationsRead() {
    try { await api("/api/notifications/read", { method: "POST" }); refreshNotifications(); } catch (e) {}
  }

  const ctx = {
    user, customer, pending, catalog, cart, remainingSec, notif,
    setUser, setCustomer, setPending, refreshMe, refreshCatalog, refreshCart, logout,
    addToCart, removeCartLine, clearCart, refreshNotifications, markNotificationsRead
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
              Hi {user.name}. The PROSAFE admin still needs to assign your company, department, price list and stores.
            </p>
            <button className="btn" onClick={refreshMe}>Check again</button>{" "}
            <button className="btn ghost" onClick={logout}>Sign out</button>
          </div>
        </div>
      </Ctx.Provider>
    );
  }

  const cartCount = cart.order.length + cart.approval.length;
  /* Store Module (role "store") gets fulfilment + inventory + all orders;
     administration (users & masters) stays with the admin role. */
  const links = user.role === "employee"
    ? [["/shop", "🛒 Shop"], ["/carts", `🧺 Carts${cartCount ? ` (${cartCount})` : ""}`], ["/orders", "📦 My Orders"], ["/profile", "👤 My Limits"]]
    : user.role === "approver"
      ? [["/approvals", "✅ Approvals"], ["/orders", "🗂️ All Orders"], ["/profile", "👤 Profile"]]
      : user.role === "store"
        ? [["/fulfil", "🚚 Fulfilment"], ["/inventory", "🏬 Inventory"], ["/orders", "🗂️ All Orders"], ["/profile", "👤 Profile"]]
        : [["/fulfil", "🚚 Fulfilment"], ["/inventory", "🏬 Inventory"], ["/orders", "🗂️ All Orders"], ["/users", "👥 Users"], ["/masters", "📚 Masters"], ["/profile", "👤 Profile"]];
  const home = links[0][0];
  const isAdmin = user.role === "admin";

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
          {remainingSec != null && cartCount > 0 && (
            <div className="cartclock" title="Time left to place the order before the cart empties and stock is released">
              ⏱ {String(Math.floor(remainingSec / 60)).padStart(2, "0")}:{String(remainingSec % 60).padStart(2, "0")}
            </div>
          )}
          {notif.unread > 0 && (
            <div className="notifbadge" onClick={markNotificationsRead} title="Click to mark read">
              🔔 {notif.unread} new notification{notif.unread > 1 ? "s" : ""}
              <div className="notiflist">
                {notif.notifications.filter(n => !n.read).slice(0, 4).map(n => <div key={n.id}>{n.msg}</div>)}
              </div>
            </div>
          )}
        </aside>
        <main className="main">
          <Routes>
            <Route path="/shop" element={<ShopPage />} />
            <Route path="/carts" element={<CartsPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/approvals" element={<ApprovalsPage />} />
            <Route path="/fulfil" element={<FulfilPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/masters" element={isAdmin ? <MastersPage /> : <Navigate to={home} replace />} />
            <Route path="/users" element={isAdmin ? <UsersPage /> : <Navigate to={home} replace />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="*" element={<Navigate to={home} replace />} />
          </Routes>
        </main>
      </div>
    </Ctx.Provider>
  );
}
