import React, { useEffect, useState } from "react";
import { api } from "../api";
import { StatusChip, Empty, fmt, fmtDT } from "../ui.jsx";

export default function ApprovalsPage() {
  const [orders, setOrders] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() { try { setOrders(await api("/api/orders?pending=1")); } catch (e) {} }
  useEffect(() => { load(); }, []);

  async function decide(ref, action) {
    if (action === "reject" && !window.confirm(`Reject ${ref}?`)) return;
    setBusy(true);
    try {
      await api(`/api/orders/${ref}/${action}`, { method: "POST" });
      await load();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  if (!orders) return <Empty icon="⏳" text="Loading…" />;
  const pend = orders.filter(o => o.status === "pending_approval");

  return (
    <>
      <h1>EGA Client Approval</h1>
      <div className="card sm mut">
        Orders exceeding allocated quantities or containing restricted items need approval.
        Approving creates the Sales Order in the ERP and raises the employee's approved qty list.
      </div>
      {pend.length === 0 && <Empty icon="✅" text="No orders awaiting approval" />}
      {pend.map(o => (
        <div className="card" key={o.ref}>
          <div className="row">
            <span className="b" style={{ color: "#0f2a43", fontSize: "1.05rem" }}>{o.ref}</span>
            <StatusChip status={o.status} />
            <span className="grow" />
            <span className="xs mut">{fmtDT(o.createdAt)}</span>
          </div>
          <div className="sm mut" style={{ margin: "6px 0 10px" }}>
            {o.empName} ({o.empId}) · {o.dept} · {o.customerName} · Contract {o.contract}
          </div>
          <table>
            <thead><tr><th>Line</th><th>Item</th><th className="num">Qty</th><th className="num">Unit Price</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {o.lines.map(l => (
                <tr key={l.lineRef}>
                  <td className="xs">{l.lineRef}</td><td>{l.code}</td>
                  <td className="num">{l.qty} {l.uom}</td>
                  <td className="num">{fmt(l.price)}</td>
                  <td className="num">{fmt(l.amount)}</td>
                </tr>
              ))}
              <tr><td colSpan={4} className="num b">Total</td><td className="num b">AED {fmt(o.total)}</td></tr>
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn green" disabled={busy} onClick={() => decide(o.ref, "approve")}>✅ Approve — create SO in ERP</button>
            <button className="btn red" disabled={busy} onClick={() => decide(o.ref, "reject")}>✕ Reject</button>
          </div>
        </div>
      ))}
    </>
  );
}
