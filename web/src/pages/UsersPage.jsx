import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Chip, Empty, Modal } from "../ui.jsx";

/* Admin Module — log-in control & shopping profiles (SRS2 Sept-26):
   · assign customer, department, location, one or MULTIPLE price lists
     (multi-shopping-screen), From Store (Main) and To Store (Reservation)
   · a log-in may hold the Employee role, the Approver role, or BOTH, and the
     user switches between the two modules in the app
   · Store (and admin) log-ins are created right here with an e-mail and a
     password — the stores are under PROSAFE control, so they have no
     dependency on the Employee Master. */

const MODULE = {
  employee: "Employee — shops against a price list",
  approver: "Approver — EGA client approval",
  store: "Store — Fulfilment, Inventory, All Orders",
  admin: "Admin — Users & Masters"
};
const BLANK_NEW = {
  email: "", password: "", name: "", phone: "", telephone: "", username: "",
  role: "store", empId: "", fromStore: "", toStore: ""
};

export default function UsersPage() {
  const [users, setUsers] = useState(null);
  const [m, setM] = useState(null);
  const [edit, setEdit] = useState(null);
  const [add, setAdd] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [u, mm] = await Promise.all([api("/api/admin/users"), api("/api/masters")]);
      setUsers(u); setM(mm);
    } catch (e) {}
  }
  useEffect(() => { load(); }, []);

  async function patch(id, body) {
    setBusy(true);
    try { await api(`/api/admin/users/${id}`, { method: "PATCH", body }); await load(); return true; }
    catch (e) { alert(e.message); return false; }
    finally { setBusy(false); }
  }
  async function removeUser(u) {
    if (!window.confirm(`Delete account ${u.email}? This removes their login and personal data permanently.`)) return;
    setBusy(true);
    try { await api(`/api/admin/users/${u.id}`, { method: "DELETE" }); await load(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  async function saveEdit() {
    const { id, roles, customer, dept, location, priceLists, fromStore, toStore, empId, name, phone, telephone, username } = edit;
    if (!roles.length) return alert("Assign at least one role");
    const ok = await patch(id, { roles, customer, dept, location, priceLists, fromStore, toStore, empId, name, phone, telephone, username });
    if (ok) setEdit(null);
  }
  async function createLogin() {
    if (!add.email || !add.password || !add.name) return alert("Name, e-mail and password are required");
    setBusy(true);
    try {
      await api("/api/admin/users", { method: "POST", body: { ...add, roles: [add.role] } });
      setAdd(null); await load();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  /* Employee Master lookup — picking an employee fills the profile in, exactly
     as self-registration does. */
  function applyEmployee(empId) {
    const e = (m.employees || []).find(x => x.empId === empId);
    if (!e) return setEdit({ ...edit, empId });
    setEdit({
      ...edit, empId: e.empId, name: e.name || edit.name, phone: e.phone || edit.phone,
      telephone: e.telephone || edit.telephone, customer: e.customer || edit.customer,
      dept: e.dept || edit.dept, location: e.location || edit.location
    });
  }

  if (!users || !m) return <Empty icon="⏳" text="Loading users…" />;
  const mainStores = m.stores.filter(s => s.type === "main");
  const resStores = m.stores.filter(s => s.type === "reservation");
  const employees = m.employees || [];
  const rolesOf = u => (u.roles && u.roles.length ? u.roles : [u.role]);
  const toggleRole = r => setEdit({
    ...edit,
    roles: edit.roles.includes(r) ? edit.roles.filter(x => x !== r) : [...edit.roles, r]
  });
  const isStaffLogin = edit && (edit.roles.includes("store") || edit.roles.includes("admin"));

  return (
    <>
      <h1>User Management & Shopping Profiles</h1>
      <div className="row" style={{ marginBottom: 10 }}>
        <div className="card sm mut grow" style={{ margin: 0 }}>
          Employees register themselves (validated against the <b>Employee Master</b>) and appear here as
          <b> pending</b> — open one to assign the role/s, price list/s and stores, then activate.
          A log-in can hold <b>Employee and Approver together</b> and switch between the two modules.
          <b> Store log-ins are created here</b> with an e-mail and password — no Employee Master record needed.
        </div>
        <button className="btn" onClick={() => setAdd({ ...BLANK_NEW })}>＋ New log-in</button>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr><th>User</th><th>Role/s</th><th>Customer</th><th>Dept / Location</th><th>Price Lists</th><th>Stores (From → To)</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>
                  <span className="b">{u.name}</span> <span className="xs mut">{u.empId}</span><br />
                  <span className="xs mut">{u.email}{u.username ? ` · ${u.username}` : ""}</span>
                </td>
                <td className="sm">
                  {rolesOf(u).map(r => <Chip key={r} label={r} color={r === "employee" ? "#2f6fb2" : r === "approver" ? "#1e9e6a" : r === "store" ? "#e8a213" : "#3159c7"} />)}
                  {rolesOf(u).length > 1 && <div className="xs mut">active: {u.role}</div>}
                </td>
                <td className="sm">{m.customers.find(c => c.id === u.customer)?.name || "—"}</td>
                <td className="sm">{u.dept || "—"} / {u.location || "—"}</td>
                <td className="sm">{(u.priceLists || []).join(", ") || "—"}</td>
                <td className="sm">{u.fromStore || "—"} → {u.toStore || "—"}</td>
                <td>{u.active ? <Chip label="Active" color="#1e9e6a" /> : <Chip label="Pending" color="#e8a213" />}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {u.role === "admin" ? (
                    <Chip label="Protected" color="#3159c7" />
                  ) : (
                    <>
                      <button className="btn sm blue" disabled={busy} onClick={() => setEdit({ ...u, priceLists: u.priceLists || [], roles: rolesOf(u) })}>Set up</button>{" "}
                      <button className={`btn sm ${u.active ? "ghost" : "green"}`} disabled={busy}
                        onClick={() => patch(u.id, { active: !u.active })}>
                        {u.active ? "Deactivate" : "Activate"}
                      </button>{" "}
                      <button className="btn sm red" disabled={busy} onClick={() => removeUser(u)}>Delete</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {add && (
        <Modal onClose={() => setAdd(null)}>
          <h1>New log-in</h1>
          <div className="card">
            <label className="f">Module</label>
            <select value={add.role} onChange={e => setAdd({ ...add, role: e.target.value })}>
              {["store", "approver", "employee", "admin"].map(r => <option key={r} value={r}>{MODULE[r]}</option>)}
            </select>
            <div className="sm mut" style={{ marginTop: 6 }}>
              {add.role === "store"
                ? "The store is under PROSAFE control, so a store log-in needs no Employee Master record — just a user name (e-mail) and a password."
                : add.role === "employee"
                  ? "Employees normally register themselves; a log-in created here still needs a price list before it can shop."
                  : add.role === "admin"
                    ? "Admin log-ins are permanently protected once created."
                    : "Approvers review orders sent for EGA approval."}
            </div>
            <div className="row">
              <div style={{ flex: 1 }}><label className="f">Name *</label><input maxLength={30} value={add.name} onChange={e => setAdd({ ...add, name: e.target.value })} /></div>
              <div style={{ flex: 1 }}><label className="f">User Name (e-mail) *</label><input maxLength={30} value={add.email} onChange={e => setAdd({ ...add, email: e.target.value })} placeholder="store@prosafe.ae" /></div>
            </div>
            <div className="row">
              <div style={{ flex: 1 }}><label className="f">Password * (min 6)</label><input type="password" value={add.password} onChange={e => setAdd({ ...add, password: e.target.value })} /></div>
              <div style={{ flex: 1 }}><label className="f">Short user name (max 8)</label><input maxLength={8} value={add.username} onChange={e => setAdd({ ...add, username: e.target.value })} /></div>
            </div>
            <div className="row">
              <div style={{ flex: 1 }}><label className="f">Mobile Phone</label><input maxLength={15} value={add.phone} onChange={e => setAdd({ ...add, phone: e.target.value })} /></div>
              <div style={{ flex: 1 }}><label className="f">Telephone</label><input maxLength={15} value={add.telephone} onChange={e => setAdd({ ...add, telephone: e.target.value })} /></div>
            </div>
          </div>
          <div className="row">
            <button className="btn ghost" onClick={() => setAdd(null)}>Cancel</button>
            <span className="grow" />
            <button className="btn" disabled={busy} onClick={createLogin}>{busy ? "Creating…" : "Create log-in"}</button>
          </div>
        </Modal>
      )}

      {edit && (
        <Modal onClose={() => setEdit(null)}>
          <h1>{isStaffLogin ? "Log-in details" : "Shopping profile"} — {edit.name}</h1>
          <div className="card">
            <label className="f">Role/s — Employee, Approver, or both</label>
            <div className="row">
              {["employee", "approver"].map(r => (
                <label key={r} className="sm" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <input type="checkbox" checked={edit.roles.includes(r)} disabled={isStaffLogin}
                    onChange={() => toggleRole(r)} />
                  {MODULE[r]}
                </label>
              ))}
              {isStaffLogin && <span className="sm mut">This is a {edit.roles.join(" / ")} log-in — that module is held on its own, and needs no shopping profile: no Employee Master record, customer, department, location or stores.</span>}
            </div>
            {edit.roles.length > 1 && (
              <div className="sm mut" style={{ marginTop: 4 }}>
                Both modules are available in one log-in — the user switches between them in the app
                (currently in the <b>{edit.role}</b> module).
              </div>
            )}

            {!isStaffLogin && (
              <>
                <label className="f">Employee Master record</label>
                <select value={edit.empId || ""} onChange={e => applyEmployee(e.target.value)}>
                  <option value="">— not linked —</option>
                  {employees.map(e => <option key={e.empId} value={e.empId}>{e.empId} — {e.name}</option>)}
                </select>
                <div className="xs mut" style={{ marginTop: 4 }}>
                  Picking an employee fills in the name, phone, customer, department and location from the Employee Master.
                </div>
              </>
            )}

            <div className="row">
              {!isStaffLogin && (
                <div><label className="f">Employee ID</label><input style={{ width: 120 }} maxLength={15} value={edit.empId || ""} onChange={e => setEdit({ ...edit, empId: e.target.value })} /></div>
              )}
              <div><label className="f">Name</label><input maxLength={30} value={edit.name || ""} onChange={e => setEdit({ ...edit, name: e.target.value })} /></div>
              <div><label className="f">User Name</label><input style={{ width: 110 }} maxLength={8} value={edit.username || ""} onChange={e => setEdit({ ...edit, username: e.target.value })} /></div>
            </div>
            <div className="row">
              <div><label className="f">Mobile Phone</label><input maxLength={15} value={edit.phone || ""} onChange={e => setEdit({ ...edit, phone: e.target.value })} /></div>
              <div><label className="f">Telephone</label><input maxLength={15} value={edit.telephone || ""} onChange={e => setEdit({ ...edit, telephone: e.target.value })} /></div>
              <div><label className="f">E-mail</label><input value={edit.email || ""} readOnly disabled /></div>
            </div>
            {/* Customer, department, location and the From/To stores are the
                shopping profile — the Store and Admin modules never read them. */}
            {!isStaffLogin && (
            <>
            <div className="row">
              <div><label className="f">Customer</label>
                <select value={edit.customer || ""} onChange={e => setEdit({ ...edit, customer: e.target.value || null })}>
                  <option value="">—</option>
                  {m.customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div>
              <div><label className="f">Department</label>
                <select value={edit.dept || ""} onChange={e => setEdit({ ...edit, dept: e.target.value || null })}>
                  <option value="">—</option>
                  {m.departments.map(d => <option key={d.code} value={d.code}>{d.code} — {d.name}</option>)}
                </select></div>
              <div><label className="f">Location</label>
                <select value={edit.location || ""} onChange={e => setEdit({ ...edit, location: e.target.value || null })}>
                  <option value="">—</option>
                  {m.locations.map(l => <option key={l.code} value={l.code}>{l.code} — {l.name}</option>)}
                </select></div>
            </div>
            <div className="row">
              <div><label className="f">From Store (Main)</label>
                <select value={edit.fromStore || ""} onChange={e => setEdit({ ...edit, fromStore: e.target.value || null })}>
                  <option value="">—</option>
                  {mainStores.map(s => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
                </select></div>
              <div><label className="f">To Store (Reservation)</label>
                <select value={edit.toStore || ""} onChange={e => setEdit({ ...edit, toStore: e.target.value || null })}>
                  <option value="">—</option>
                  {resStores.map(s => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
                </select></div>
            </div>
            </>
            )}

            {edit.roles.includes("employee") && (
              <>
                <label className="f">Approved Price Lists (each one becomes a shopping tab)</label>
                <div className="row">
                  {m.priceLists.map(p => (
                    <label key={p.id} className="sm" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <input type="checkbox" checked={edit.priceLists.includes(p.id)}
                        onChange={e => setEdit({
                          ...edit,
                          priceLists: e.target.checked
                            ? [...edit.priceLists, p.id]
                            : edit.priceLists.filter(x => x !== p.id)
                        })} />
                      {p.id} — {p.name} <span className="xs mut">({p.contract})</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="row">
            <button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>
            <span className="grow" />
            <button className="btn" disabled={busy} onClick={saveEdit}>{busy ? "Saving…" : "Save profile"}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
