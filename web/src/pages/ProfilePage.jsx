import React, { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../App.jsx";
import { Chip, Empty } from "../ui.jsx";

export default function ProfilePage() {
  const { logout } = useApp();
  const [p, setP] = useState(null);

  useEffect(() => { (async () => { try { setP(await api("/api/profile")); } catch (e) {} })(); }, []);

  async function deleteAccount() {
    if (!window.confirm("Delete your account permanently? Your login and personal data are removed. Past orders remain in the business records.")) return;
    if (!window.confirm("Final confirmation — this cannot be undone. Delete your account?")) return;
    try {
      await api("/api/auth/account", { method: "DELETE" });
      alert("Your account has been deleted.");
      logout();
    } catch (e) { alert(e.message); }
  }

  if (!p) return <Empty icon="⏳" text="Loading profile…" />;

  return (
    <>
      <h1>My Profile</h1>
      <div className="card">
        <table>
          <tbody>
            <tr><td className="mut">Employee ID</td><td className="b">{p.user.empId || "—"}</td></tr>
            <tr><td className="mut">Name</td><td className="b">{p.user.name}</td></tr>
            <tr><td className="mut">E-mail</td><td>{p.user.email}</td></tr>
            <tr><td className="mut">Company</td><td>{p.customer?.name || "—"}</td></tr>
            <tr><td className="mut">Department</td><td>{p.user.dept || "—"}</td></tr>
            <tr><td className="mut">Mobile</td><td>{p.user.phone || "—"}</td></tr>
            <tr><td className="mut">Role</td><td>{p.user.role}</td></tr>
            <tr><td className="mut">Approved Price List</td><td>{p.priceList ? `${p.priceList.name} · Contract ${p.priceList.contract}` : "—"}</td></tr>
          </tbody>
        </table>
      </div>

      {p.approvedQtyList.length > 0 && (
        <>
          <h2>Approved Qty List</h2>
          <div className="card">
            <table>
              <thead><tr><th>Item</th><th>UOM</th><th className="num">Allocated</th><th className="num">Used</th><th className="num">Balance</th><th>Restricted</th></tr></thead>
              <tbody>
                {p.approvedQtyList.map(l => (
                  <tr key={l.code}>
                    <td><span className="b">{l.name}</span><br /><span className="xs mut">{l.code}</span></td>
                    <td>{l.uom}</td>
                    <td className="num">{l.allocated}</td>
                    <td className="num">{l.used}</td>
                    <td className="num b" style={{ color: l.balance > 0 ? "#1e9e6a" : "#d64545" }}>{l.balance}</td>
                    <td><Chip label={l.restricted ? "Yes" : "No"} color={l.restricted ? "#d64545" : "#6b7c8d"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>Account</h2>
      <div className="card row">
        <button className="btn navy" onClick={logout}>Sign out</button>
        <span className="grow" />
        <button className="btn red" onClick={deleteAccount}>🗑 Delete my account</button>
      </div>
      <div className="xs mut">Deleting removes your login and personal data permanently.</div>
    </>
  );
}
