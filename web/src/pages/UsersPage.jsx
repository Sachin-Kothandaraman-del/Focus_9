import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Chip, Empty, Modal } from "../ui.jsx";

/* Admin — user log-in control & shopping profile set-up (SRS2):
   assign customer, department, location, one or MULTIPLE price lists
   (multi-shopping-screen), From Store (Main) and To Store (Reservation),
   then activate. Profile data rolls back into the Employee Master. */
export default function UsersPage() {
  const [users, setUsers] = useState(null);
  const [m, setM] = useState(null);
  const [edit, setEdit] = useState(null);
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
    const { id, role, customer, dept, location, priceLists, fromStore, toStore, empId, name, phone } = edit;
    if (role === "admin" && !window.confirm(`Make ${edit.email} an Administrator? This permanently protects the account.`)) return;
    const ok = await patch(id, { role, customer, dept, location, priceLists, fromStore, toStore, empId, name, phone });
    if (ok) setEdit(null);
  }

  if (!users || !m) return <Empty icon="⏳" text="Loading users…" />;
  const mainStores = m.stores.filter(s => s.type === "main");
  const resStores = m.stores.filter(s => s.type === "reservation");

  return (
    <>
      <h1>User Management & Shopping Profiles</h1>
      <div className="card sm mut">
        New signups appear as <b>pending</b>. Open a user to assign customer, department, location, price list/s
        (multiple price lists = multiple shopping tabs) and the From/To stores, then activate.
      </div>
      <div className="card">
        <table>
          <thead>
            <tr><th>User</th><th>Role</th><th>Customer</th><th>Dept / Location</th><th>Price Lists</th><th>Stores (From → To)</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>
                  <span className="b">{u.name}</span> <span className="xs mut">{u.empId}</span><br />
                  <span className="xs mut">{u.email}</span>
                </td>
                <td className="sm">{u.role}</td>
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
                      <button className="btn sm blue" disabled={busy} onClick={() => setEdit({ ...u, priceLists: u.priceLists || [] })}>Set up</button>{" "}
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

      {edit && (
        <Modal onClose={() => setEdit(null)}>
          <h1>Shopping profile — {edit.name}</h1>
          <div className="card">
            <div className="row">
              <div><label className="f">Employee ID</label><input style={{ width: 110 }} value={edit.empId || ""} onChange={e => setEdit({ ...edit, empId: e.target.value })} /></div>
              <div><label className="f">Name</label><input value={edit.name || ""} onChange={e => setEdit({ ...edit, name: e.target.value })} /></div>
              <div><label className="f">Mobile Phone</label><input value={edit.phone || ""} onChange={e => setEdit({ ...edit, phone: e.target.value })} /></div>
              <div><label className="f">Role</label>
                <select value={edit.role} onChange={e => setEdit({ ...edit, role: e.target.value })}>
                  <option value="employee">employee</option>
                  <option value="approver">approver</option>
                  <option value="admin">admin</option>
                </select></div>
            </div>
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
