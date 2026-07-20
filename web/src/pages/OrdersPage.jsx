import React, { useEffect, useState } from "react";
import { useApp } from "../App.jsx";
import { api } from "../api";
import { Chip, StatusChip, Empty, Modal, fmt, fmtDT } from "../ui.jsx";

const BUCKETS = [
  ["all", "Orders"], ["progress", "In Progress"], ["approval", "Order Approval"],
  ["complete", "Complete"], ["cancel", "Cancelled"], ["reject", "Rejected"]
];
const bucketOf = o => ({
  pending_approval: "approval", in_progress: "progress", do_created: "progress",
  partially_received: "progress", complete: "complete", cancelled: "cancel", rejected: "reject"
}[o.status] || "all");

export default function OrdersPage() {
  const { user, refreshCatalog } = useApp();
  const [orders, setOrders] = useState(null);
  const [bucket, setBucket] = useState("all");
  const [sel, setSel] = useState(null);          // selected order (detail modal)
  const [mode, setMode] = useState(null);        // receive | return
  const [vals, setVals] = useState({});
  const [busy, setBusy] = useState(false);

  async function load() { try { setOrders(await api("/api/orders")); } catch (e) {} }
  useEffect(() => { load(); }, []);

  async function act(ref, path, body, okMsg) {
    setBusy(true);
    try {
      const o = await api(`/api/orders/${ref}/${path}`, { method: "POST", body });
      await load();
      if (user.role === "employee") refreshCatalog();
      setSel(o); setMode(null); setVals({});
      if (okMsg) alert(okMsg);
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }
  function submitQty() {
    const lines = sel.lines.map(l => ({ lineRef: l.lineRef, qty: Number(vals[l.lineRef]) || 0 })).filter(l => l.qty > 0);
    if (!lines.length) return alert("Enter a quantity first");
    act(sel.ref, mode, { lines },
      mode === "receive" ? "Receipt acknowledged — order updated." : "Return submitted — approved qty list credited.");
  }

  if (!orders) return <Empty icon="⏳" text="Loading orders…" />;
  const list = bucket === "all" ? orders : orders.filter(o => bucketOf(o) === bucket);
  const mine = o => user.role === "employee" && o.emp === user.id;

  return (
    <>
      <h1>{user.role === "employee" ? "My Orders" : "All Orders"}</h1>
      <div className="tabsbar">
        {BUCKETS.map(([id, lbl]) => {
          const n = id === "all" ? orders.length : orders.filter(o => bucketOf(o) === id).length;
          return <button key={id} className={bucket === id ? "on" : ""} onClick={() => setBucket(id)}>{lbl}{n ? ` (${n})` : ""}</button>;
        })}
      </div>
      {list.length === 0 && <Empty text="No orders in this bucket" />}
      {list.length > 0 && (
        <div className="card">
          <table>
            <thead><tr><th>Doc Ref</th><th>Date</th>{user.role !== "employee" && <th>Employee</th>}<th>Contract</th><th>Status</th><th className="num">Total</th><th>ERP</th><th /></tr></thead>
            <tbody>
              {list.map(o => (
                <tr key={o.ref}>
                  <td className="b">{o.ref}</td>
                  <td className="sm">{fmtDT(o.createdAt)}</td>
                  {user.role !== "employee" && <td className="sm">{o.empName}</td>}
                  <td className="sm">{o.contract}</td>
                  <td><StatusChip status={o.status} /></td>
                  <td className="num b">AED {fmt(o.total)}</td>
                  <td className="xs">{o.so || "—"}{o.dns?.length ? ` · ${o.dns.join(", ")}` : ""}</td>
                  <td><button className="btn sm blue" onClick={() => { setSel(o); setMode(null); setVals({}); }}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sel && (
        <Modal onClose={() => setSel(null)}>
          <div className="row"><h1 style={{ margin: 0 }}>{sel.ref}</h1><StatusChip status={sel.status} /></div>
          <div className="card" style={{ marginTop: 12 }}>
            <div className="sm">Date: <b>{fmtDT(sel.createdAt)}</b> · Contract: <b>{sel.contract}</b></div>
            <div className="sm">Employee: <b>{sel.empId} {sel.empName}</b> · Dept: <b>{sel.dept || "—"}</b> · Customer: <b>{sel.customerName}</b></div>
            {sel.so && <div className="sm">ERP SO: <b>{sel.so}</b>{sel.dns?.length ? <> · DO: <b>{sel.dns.join(", ")}</b></> : null}</div>}
          </div>
          <div className="card">
            <table>
              <thead><tr><th>Line Ref</th><th>Item</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Amount</th><th className="num">Recvd</th><th className="num">Bal</th>
                {mode && <th>{mode === "receive" ? "Receive now" : "Return qty"}</th>}</tr></thead>
              <tbody>
                {sel.lines.map(l => {
                  const max = mode === "receive" ? l.qty - l.received : l.received;
                  return (
                    <tr key={l.lineRef}>
                      <td className="xs">{l.lineRef}</td>
                      <td className="sm">{l.code}<br /><span className="xs mut">{l.uom}</span></td>
                      <td className="num">{l.qty}</td>
                      <td className="num">{fmt(l.price)}</td>
                      <td className="num">{fmt(l.amount)}</td>
                      <td className="num">{l.received}</td>
                      <td className="num">{l.qty - l.received}</td>
                      {mode && (
                        <td>{max > 0
                          ? <input type="number" min="0" max={max} style={{ width: 70 }}
                              value={vals[l.lineRef] ?? (mode === "receive" ? max : 0)}
                              onChange={e => setVals({ ...vals, [l.lineRef]: e.target.value })} />
                          : "—"}</td>
                      )}
                    </tr>
                  );
                })}
                <tr><td colSpan={4} className="num b">Total Amount</td><td className="num b">AED {fmt(sel.total)}</td><td colSpan={mode ? 3 : 2} /></tr>
              </tbody>
            </table>
          </div>

          <div className="row" style={{ marginBottom: 12 }}>
            {mode
              ? <>
                  <button className="btn ghost" onClick={() => setMode(null)}>Back</button>
                  <span className="grow" />
                  <button className={`btn ${mode === "receive" ? "green" : "blue"}`} disabled={busy} onClick={submitQty}>
                    {busy ? "…" : mode === "receive" ? "✅ Confirm Receipt" : "↩ Submit Return"}
                  </button>
                </>
              : <>
                  {mine(sel) && sel.status === "in_progress" && (
                    <button className="btn red" disabled={!sel.cancellable || busy}
                      title={sel.cancellable ? "" : "15-minute window has passed"}
                      onClick={() => window.confirm(`Cancel ${sel.ref}? The ERP SO will be cancelled and your allocation restored.`)
                        && act(sel.ref, "cancel", null, "Order cancelled.")}>
                      🗑 Cancel the Order
                    </button>
                  )}
                  {mine(sel) && ["do_created", "partially_received"].includes(sel.status) &&
                    <button className="btn green" onClick={() => setMode("receive")}>📦 Order Complete — Receive</button>}
                  {mine(sel) && sel.status === "complete" &&
                    <button className="btn blue" onClick={() => setMode("return")}>↩ Return Order</button>}
                  {user.role === "approver" && sel.status === "pending_approval" && (
                    <>
                      <button className="btn green" disabled={busy} onClick={() => act(sel.ref, "approve", null, "Approved — SO created in ERP.")}>✅ Approve</button>
                      <button className="btn red" disabled={busy} onClick={() => window.confirm(`Reject ${sel.ref}?`) && act(sel.ref, "reject", null, "Order rejected.")}>✕ Reject</button>
                    </>
                  )}
                  {user.role === "admin" && sel.status === "in_progress" &&
                    <button className="btn navy" disabled={busy} onClick={() => act(sel.ref, "delivery-note", null, "Delivery Note created.")}>📄 Create Delivery Note</button>}
                  <span className="grow" />
                  <button className="btn ghost" onClick={() => setSel(null)}>Close</button>
                </>}
          </div>

          <h2>History</h2>
          <div className="card">
            {sel.history.map((h, i) => (
              <div key={i} className="sm" style={{ padding: "5px 0", borderBottom: i < sel.history.length - 1 ? "1px solid var(--line)" : "none" }}>
                <span className="xs mut">{fmtDT(h.at)}</span><br />{h.ev}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
