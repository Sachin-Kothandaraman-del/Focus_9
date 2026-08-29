import React, { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../App.jsx";
import { Chip, Empty, fmt, fmtD } from "../ui.jsx";

/* My Limits — the Approved Qty List per price list, with the SRS2 header
   (Price List Validity + Delivery Period) and Allocated/Used amount columns
   rolled up into Total Allocated Amount / Total Used Amount. */
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
      <h1>{p.user.role === "employee" ? "My Limits" : "My Profile"}</h1>
      <div className="card">
        <table>
          <tbody>
            <tr><td className="mut">Employee ID</td><td className="b">{p.user.empId || "—"}</td></tr>
            <tr><td className="mut">Name</td><td className="b">{p.user.name}</td></tr>
            <tr><td className="mut">E-mail</td><td>{p.user.email}</td></tr>
            <tr><td className="mut">Customer</td><td>{p.customer?.name || "—"}</td></tr>
            <tr><td className="mut">Department</td><td>{p.department ? `${p.department.code} — ${p.department.name}` : (p.user.dept || "—")}</td></tr>
            <tr><td className="mut">Location</td><td>{p.location ? `${p.location.code} — ${p.location.name}` : (p.user.location || "—")}</td></tr>
            <tr><td className="mut">Mobile</td><td>{p.user.phone || "—"}</td></tr>
            <tr><td className="mut">Role</td><td>{p.user.role}</td></tr>
            {p.user.role === "employee" && <tr><td className="mut">Stores</td><td>{p.user.fromStore || "—"} (Main) → {p.user.toStore || "—"} (Reservation)</td></tr>}
          </tbody>
        </table>
      </div>

      {p.priceLists.map(pl => (
        <React.Fragment key={pl.id}>
          <h2>Approved Qty List — {pl.id} · {pl.name}</h2>
          <div className="card">
            <div className="row sm" style={{ color: "#d64545", marginBottom: 8 }}>
              <span>Price List Validity — Start Date: <b>{fmtD(pl.validFrom)}</b></span>
              <span>End Date: <b>{fmtD(pl.validTill)}</b></span>
              <span>Delivery Period — <b>{pl.deliveryPeriod} Day{pl.deliveryPeriod === 1 ? "" : "s"}</b></span>
              <span className="grow" />
              <Chip label={`Contract ${pl.contract}`} color="#0f2a43" />
            </div>
            <table>
              <thead><tr>
                <th>Item</th><th>UOM</th><th className="num">Allocated Qty</th><th className="num">U/Price</th>
                <th className="num">Allocated Amount</th><th className="num">Used Qty</th><th className="num">Used Amount</th>
                <th className="num">Balance</th><th>Restricted</th>
              </tr></thead>
              <tbody>
                {pl.approvedQtyList.map(l => (
                  <tr key={l.key}>
                    <td>
                      <span className="b">{l.items[0].name}</span>
                      {l.items.length > 1 && <span className="xs mut"> (+{l.items.length - 1} size variants)</span>}
                      <br /><span className="xs mut">{l.items.map(i => i.code).join(", ")}</span>
                    </td>
                    <td>{l.uom}</td>
                    <td className="num">{l.allocated}</td>
                    <td className="num" style={{ color: "#d64545" }}>{fmt(l.price)}</td>
                    <td className="num" style={{ color: "#d64545" }}>{fmt(l.allocatedAmount)}</td>
                    <td className="num">{l.used}</td>
                    <td className="num" style={{ color: "#d64545" }}>{fmt(l.usedAmount)}</td>
                    <td className="num b" style={{ color: l.balance > 0 ? "#1e9e6a" : "#d64545" }}>{l.balance}</td>
                    <td><Chip label={l.restricted ? "Yes" : "No"} color={l.restricted ? "#d64545" : "#6b7c8d"} /></td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={4} />
                  <td className="num b" style={{ color: "#d64545" }}>{fmt(pl.totals.allocatedAmount)}<br /><span className="xs">Total Allocated Amount</span></td>
                  <td />
                  <td className="num b" style={{ color: "#d64545" }}>{fmt(pl.totals.usedAmount)}<br /><span className="xs">Total Used Amount</span></td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>
        </React.Fragment>
      ))}

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
