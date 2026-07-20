import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Chip, Empty } from "../ui.jsx";

export default function UsersPage() {
  const [users, setUsers] = useState(null);
  const [m, setM] = useState(null);
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
    try { await api(`/api/admin/users/${id}`, { method: "PATCH", body }); await load(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  async function removeUser(u) {
    if (!window.confirm(`Delete account ${u.email}? This removes their login and personal data permanently.`)) return;
    setBusy(true);
    try { await api(`/api/admin/users/${u.id}`, { method: "DELETE" }); await load(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  if (!users || !m) return <Empty icon="⏳" text="Loading users…" />;

  return (
    <>
      <h1>User Management</h1>
      <div className="card sm mut">
        New signups appear here as <b>pending</b>. Assign company, department and price list, then activate —
        the employee can order the moment you do.
      </div>
      <div className="card">
        <table>
          <thead>
            <tr><th>User</th><th>Role</th><th>Company</th><th>Department</th><th>Price List</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>
                  <span className="b">{u.name}</span> <span className="xs mut">{u.empId}</span><br />
                  <span className="xs mut">{u.email}</span>
                </td>
                <td>
                  <select value={u.role} disabled={busy} onChange={e => patch(u.id, { role: e.target.value })}>
                    <option value="employee">employee</option>
                    <option value="approver">approver</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                {u.role === "employee" ? (
                  <>
                    <td>
                      <select value={u.customer || ""} disabled={busy} onChange={e => patch(u.id, { customer: e.target.value || null })}>
                        <option value="">—</option>
                        {m.customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={u.dept || ""} disabled={busy} onChange={e => patch(u.id, { dept: e.target.value || null })}>
                        <option value="">—</option>
                        {m.departments.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={u.priceList || ""} disabled={busy} onChange={e => patch(u.id, { priceList: e.target.value || null })}>
                        <option value="">—</option>
                        {m.priceLists.map(p => <option key={p.id} value={p.id}>{p.name} ({p.contract})</option>)}
                      </select>
                    </td>
                  </>
                ) : (
                  <td colSpan={3} className="xs mut">not applicable — {u.role}s don't shop</td>
                )}
                <td>
                  {u.active
                    ? <Chip label="Active" color="#1e9e6a" />
                    : <Chip label="Pending" color="#e8a213" />}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className={`btn sm ${u.active ? "ghost" : "green"}`} disabled={busy}
                    onClick={() => patch(u.id, { active: !u.active })}>
                    {u.active ? "Deactivate" : "Activate"}
                  </button>{" "}
                  <button className="btn sm red" disabled={busy} onClick={() => removeUser(u)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
