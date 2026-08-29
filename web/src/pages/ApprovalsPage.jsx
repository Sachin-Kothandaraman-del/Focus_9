import React, { useEffect, useState } from "react";
import { api } from "../api";
import { StatusChip, StockChip, Empty, fmt, fmtD, fmtDT } from "../ui.jsx";

/* EGA client approval — line-wise approved quantities (SRS2).
   Stock & delivery dates are managed by the system (reservation + delivery-
   period rules); unapproved qtys are credited back automatically.
   Orders not approved within 3 days are cancelled automatically. */
export default function ApprovalsPage() {
  const [orders, setOrders] = useState(null);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState({});

  async function load() { try { setOrders(await api("/api/orders?pending=1")); } catch (e) {} }
  useEffect(() => { load(); }, []);

  const value = (o, l) => drafts[o.ref]?.[l.lineRef] ?? (l.approvedQty ?? l.orderedQty);
  function setLine(ref, lineRef, next) {
    setDrafts(prev => ({ ...prev, [ref]: { ...(prev[ref] || {}), [lineRef]: next } }));
  }

  async function decide(o, action) {
    const ref = o.ref;
    if (action === "reject" && !window.confirm(`Reject ${ref}? Reserved stock returns to the Main store and the employee's price list is credited.`)) return;
    setBusy(true);
    try {
      const body = action === "approve" ? {
        lines: o.lines.map(l => ({ lineRef: l.lineRef, approvedQty: Number(value(o, l)) }))
      } : undefined;
      await api(`/api/orders/${ref}/${action}`, { method: "POST", body });
      await load();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  if (!orders) return <Empty icon="⏳" text="Loading…" />;
  const pend = orders.filter(o => o.status === "pending_approval");

  return (
    <>
      <h1>EGA Client Approval</h1>
      <div className="card sm mut">
        Orders exceeding allocated quantities need approval. Approving creates the Sales Order in the ERP;
        quantities you don't approve are credited back to the employee's price list and the Main store.
        Orders not decided within <b>3 days</b> are cancelled automatically.
      </div>
      {pend.length === 0 && <Empty icon="✅" text="No orders awaiting approval" />}
      {pend.map(o => (
        <div className="card" key={o.ref}>
          <div className="row">
            <span className="b" style={{ color: "#0f2a43", fontSize: "1.05rem" }}>{o.ref}</span>
            <StatusChip status={o.status} />
            <span className="grow" />
            <span className="xs" style={{ color: "#e8a213" }}>Deadline {o.approvalDeadline ? fmtDT(o.approvalDeadline) : "—"}</span>
          </div>
          <div className="sm mut" style={{ margin: "6px 0 10px" }}>
            {o.empName} ({o.empId}) · {o.dept} · {o.customerName} · Contract {o.contract} · {fmtDT(o.createdAt)}
          </div>
          <table>
            <thead><tr><th>Line</th><th>Item</th><th className="num">Ordered</th><th>Approved Qty</th><th>Stock</th><th>Delivery date</th><th className="num">Approved amount</th></tr></thead>
            <tbody>
              {o.lines.map(l => (
                <tr key={l.lineRef}>
                  <td className="xs">{l.lineRef}</td>
                  <td>{l.name || l.code}<br /><span className="xs mut">{l.code}</span></td>
                  <td className="num">{l.orderedQty} {l.uom}</td>
                  <td><input type="number" min="0" max={l.orderedQty} style={{ width: 80 }}
                    value={value(o, l)}
                    onChange={e => setLine(o.ref, l.lineRef, e.target.value)} /></td>
                  <td><StockChip stock={l.stock} /></td>
                  <td className="sm">{l.deliveryDate ? fmtD(l.deliveryDate) : l.remark || "DOD to be advised"}</td>
                  <td className="num">{fmt((Number(value(o, l)) || 0) * l.price)}</td>
                </tr>
              ))}
              <tr><td colSpan={6} className="num b">Approved Total</td>
                <td className="num b">AED {fmt(o.lines.reduce((sum, l) => sum + (Number(value(o, l)) || 0) * l.price, 0))}</td></tr>
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn green" disabled={busy} onClick={() => decide(o, "approve")}>✅ Approve selected quantities — create SO</button>
            <button className="btn red" disabled={busy} onClick={() => decide(o, "reject")}>✕ Reject entire order</button>
          </div>
        </div>
      ))}
    </>
  );
}
