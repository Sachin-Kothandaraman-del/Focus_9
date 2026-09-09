import React, { useState } from "react";
import { api, setSession } from "../api";
import { useApp } from "../App.jsx";
import LOGO from "../logo";

/* Registration per SRS2 (Sept-26):
   the employee types the two data points that are checked against the
   Employee Master — Employee ID and Mobile Phone — and the rest of the form
   is filled in from that master record. If the two data points do not match,
   registration is refused. The account is then Pending for Activation. */

const LIMITS = { empId: 15, phone: 15, name: 30, customer: 35, dept: 25, location: 25, telephone: 15, email: 30, username: 8 };
const BLANK = {
  empId: "", phone: "", name: "", customer: "", dept: "", location: "",
  telephone: "", email: "", username: "", password: "", confirmPassword: ""
};

/* Read-only row filled in from the Employee Master. Defined outside the page
   so React keeps the inputs mounted while the form is being typed into. */
function Ro({ label, value }) {
  return (
    <>
      <label className="f">{label}</label>
      <input value={value || ""} readOnly disabled style={{ opacity: .75 }} />
    </>
  );
}

export default function AuthPage() {
  const { setUser, setCustomer, setPending, refreshCatalog } = useApp();
  const [mode, setMode] = useState("login");
  const [login, setLogin] = useState({ email: "", password: "" });
  const [f, setF] = useState(BLANK);
  const [emp, setEmp] = useState(null);            // validated Employee Master record
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const set = k => e => setF({ ...f, [k]: e.target.value.slice(0, LIMITS[k] || 60) });
  const setL = k => e => setLogin({ ...login, [k]: e.target.value });

  function toMode(next) {
    setMode(next); setMsg(null);
    if (next === "signup") { setF(BLANK); setEmp(null); }
  }

  /* Step 1 — validate the two data points against the Employee Master. */
  async function validateEmployee(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await api("/api/auth/employee-lookup", { method: "POST", body: { empId: f.empId, phone: f.phone } });
      setEmp(r.employee);
      setF({
        ...f,
        name: r.employee.name, phone: r.employee.phone,
        customer: r.employee.customerName, dept: r.employee.deptName || r.employee.dept,
        location: r.employee.locationName || r.employee.location,
        telephone: r.employee.telephone, email: r.employee.email
      });
      setMsg({ ok: true, text: "Employee verified against the Employee Master — please choose a user name and password." });
    } catch (err) {
      setEmp(null);
      setMsg({ ok: false, text: err.message });
    } finally { setBusy(false); }
  }

  async function submitLogin(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await api("/api/auth/login", { method: "POST", body: login });
      setSession(r.token, r.refreshToken);
      setUser(r.user); setCustomer(r.customer); setPending(!!r.pendingActivation);
      if (r.user.role === "employee" && !r.pendingActivation) refreshCatalog();
    } catch (err) { setMsg({ ok: false, text: err.message }); } finally { setBusy(false); }
  }

  /* Step 2 — create the log-in. The server re-checks the two data points. */
  async function submitSignup(e) {
    e.preventDefault();
    if (f.password !== f.confirmPassword) return setMsg({ ok: false, text: "Password and Confirm Password do not match" });
    if (f.password.length < 6) return setMsg({ ok: false, text: "Password must be at least 6 characters" });
    setBusy(true); setMsg(null);
    try {
      const r = await api("/api/auth/signup", { method: "POST", body: f });
      if (r.emailConfirmationRequired) {
        setMsg({ ok: true, text: "Account created — confirm the link we e-mailed you, then sign in." });
        setMode("login");
      } else if (r.token) {
        setSession(r.token, r.refreshToken);
        setUser(r.user); setPending(!!r.pendingActivation);
      }
    } catch (err) { setMsg({ ok: false, text: err.message }); } finally { setBusy(false); }
  }

  return (
    <div className="authwrap">
      <div className="authbox" style={{ maxWidth: mode === "signup" ? 520 : 420 }}>
        <div className="brandcard"><img className="brandlogo" src={LOGO} alt="Prosafe Systems" /></div>
        <div className="sub">EGA End-to-End Distribution · Ordering Portal</div>

        <form className="authform" onSubmit={mode === "login" ? submitLogin : (emp ? submitSignup : validateEmployee)}>
          <div className="authtabs">
            <button type="button" className={mode === "login" ? "on" : ""} onClick={() => toMode("login")}>Sign In</button>
            <button type="button" className={mode === "signup" ? "on" : ""} onClick={() => toMode("signup")}>Register</button>
          </div>

          {mode === "login" && (
            <>
              <label className="f">User Name or E-mail</label>
              <input value={login.email} onChange={setL("email")} placeholder="you@company.com" autoComplete="username" />
              <label className="f">Password</label>
              <input type="password" value={login.password} onChange={setL("password")} placeholder="••••••" autoComplete="current-password" />
              <button className="btn" disabled={busy}>{busy ? "Please wait…" : "Sign In"}</button>
            </>
          )}

          {mode === "signup" && !emp && (
            <>
              <div className="hint" style={{ textAlign: "left", marginTop: 0, marginBottom: 6 }}>
                Step 1 of 2 — your Employee ID and Mobile Phone are checked against the
                PROSAFE Employee Master. Both must match before you can register.
              </div>
              <label className="f">Employee ID</label>
              <input value={f.empId} onChange={set("empId")} placeholder="ID001" maxLength={LIMITS.empId} />
              <label className="f">Mobile Phone</label>
              <input value={f.phone} onChange={set("phone")} placeholder="+971 50 …" maxLength={LIMITS.phone} />
              <button className="btn" disabled={busy}>{busy ? "Checking…" : "Verify & continue"}</button>
            </>
          )}

          {mode === "signup" && emp && (
            <>
              <div className="hint" style={{ textAlign: "left", marginTop: 0, marginBottom: 6 }}>
                Step 2 of 2 — verified as <b style={{ color: "#8fd7b3" }}>{emp.name}</b> ({emp.empId}).
                Your details come from the Employee Master; choose a user name and password.
              </div>
              <div className="row">
                <div style={{ flex: 1 }}><Ro label="Employee ID" value={f.empId} /></div>
                <div style={{ flex: 1 }}><Ro label="Mobile Phone" value={f.phone} /></div>
              </div>
              <Ro label="Employee Name" value={f.name} />
              <div className="row">
                <div style={{ flex: 1 }}><Ro label="Customer Name" value={f.customer} /></div>
                <div style={{ flex: 1 }}><Ro label="Department" value={f.dept} /></div>
              </div>
              <div className="row">
                <div style={{ flex: 1 }}><Ro label="Location" value={f.location} /></div>
                <div style={{ flex: 1 }}>
                  <label className="f">Telephone</label>
                  <input value={f.telephone} onChange={set("telephone")} maxLength={LIMITS.telephone} />
                </div>
              </div>
              <label className="f">E-mail</label>
              <input type="email" value={f.email} onChange={set("email")} maxLength={LIMITS.email} placeholder="you@company.com" />
              <label className="f">User Name (max 8 characters)</label>
              <input value={f.username} onChange={set("username")} maxLength={LIMITS.username} placeholder="your choice" autoComplete="username" />
              <div className="row">
                <div style={{ flex: 1 }}>
                  <label className="f">Password (min 6)</label>
                  <input type="password" value={f.password} onChange={set("password")} autoComplete="new-password" />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="f">Confirm Password</label>
                  <input type="password" value={f.confirmPassword} onChange={set("confirmPassword")} autoComplete="new-password" />
                </div>
              </div>
              <button className="btn" disabled={busy}>{busy ? "Please wait…" : "Register"}</button>
              <button type="button" className="btn ghost" style={{ width: "100%", marginTop: 8 }}
                onClick={() => { setEmp(null); setMsg(null); }}>← Back</button>
            </>
          )}

          {msg && <div className="hint" style={{ color: msg.ok ? "#8fd7b3" : "#ffb3b3" }}>{msg.text}</div>}
          {mode === "signup" && (
            <div className="hint">
              After registering, your profile is <b>Pending for Activation</b> — the PROSAFE admin
              assigns your approved price list and stores before you can shop.
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
