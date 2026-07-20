import React, { useState } from "react";
import { api, setSession } from "../api";
import { useApp } from "../App.jsx";

export default function AuthPage() {
  const { setUser, setCustomer, setPending, refreshCatalog } = useApp();
  const [mode, setMode] = useState("login");
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = k => e => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      if (mode === "login") {
        const r = await api("/api/auth/login", { method: "POST", body: { email: f.email, password: f.password } });
        setSession(r.token, r.refreshToken);
        setUser(r.user); setCustomer(r.customer); setPending(!!r.pendingActivation);
        if (r.user.role === "employee" && !r.pendingActivation) refreshCatalog();
      } else {
        const r = await api("/api/auth/signup", { method: "POST", body: f });
        if (r.emailConfirmationRequired) {
          setMsg({ ok: true, text: "Account created — confirm the link we e-mailed you, then sign in." });
          setMode("login");
        } else if (r.token) {
          setSession(r.token, r.refreshToken);
          setUser(r.user); setPending(!!r.pendingActivation);
        }
      }
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="authwrap">
      <div className="authbox">
        <div className="logo">PRO<span>SAFE</span></div>
        <div className="sub">EGA End-to-End Distribution · Ordering Portal</div>
        <form className="authform" onSubmit={submit}>
          <div className="authtabs">
            <button type="button" className={mode === "login" ? "on" : ""} onClick={() => setMode("login")}>Sign In</button>
            <button type="button" className={mode === "signup" ? "on" : ""} onClick={() => setMode("signup")}>Create Account</button>
          </div>
          {mode === "signup" && (
            <>
              <label className="f">Full name</label>
              <input value={f.name} onChange={set("name")} placeholder="Ahmed Al Mansoori" />
              <label className="f">Mobile (optional)</label>
              <input value={f.phone} onChange={set("phone")} placeholder="+971-50-…" />
            </>
          )}
          <label className="f">E-mail</label>
          <input type="email" value={f.email} onChange={set("email")} placeholder="you@company.com" />
          <label className="f">Password</label>
          <input type="password" value={f.password} onChange={set("password")} placeholder={mode === "signup" ? "min 8 characters" : "••••••••"} />
          <button className="btn" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account"}</button>
          {msg && <div className="hint" style={{ color: msg.ok ? "#8fd7b3" : "#ffb3b3" }}>{msg.text}</div>}
          {mode === "signup" && <div className="hint">New accounts are activated by the PROSAFE admin, who assigns your company and approved price list.</div>}
        </form>
      </div>
    </div>
  );
}
