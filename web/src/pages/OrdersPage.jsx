import React, { useEffect, useState } from "react";
import { useApp } from "../App.jsx";
import { api } from "../api";
import { Chip, StatusChip, StockChip, Empty, Modal, fmt, fmtD, fmtDT } from "../ui.jsx";

const BUCKETS = [
  ["all", "Orders"], ["progress", "Orders in Progress"], ["approval", "Order Approval"],
  ["complete", "Order Completed"], ["returns", "Return Orders"], ["cancel", "Cancelled"], ["reject", "Rejected"]
];
const bucketOf = o => ({
  pending_approval: "approval", in_progress: "progress", partially_delivered: "progress", do_created: "progress",
  partially_received: "progress", complete: "complete", cancelled: "cancel", rejected: "reject"
}[o.status] || "all");

export default function OrdersPage() {
  const { user, refreshCatalog } = useApp();
  const [orders, setOrders] = useState(null);
  const [bucket, setBucket] = useState("all");
  const [sel, setSel] = useState(null);          // selected order (detail modal)
  const [mode, setMode] = useState(null);        // "return" | null
  const [vals, setVals] = useState({});          // return qty per lineRef
  const [remarks, setRemarks] = useState({});    // return remark per lineRef
  const [selectedDN, setSelectedDN] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() { try { setOrders(await api("/api/orders")); } catch (e) {} }
  useEffect(() => { load(); }, []);

  async function act(ref, path, body, okMsg) {
    setBusy(true);
    try {
      const r = await api(`/api/orders/${ref}/${path}`, { method: "POST", body });
      await load();
      if (user.role === "employee") refreshCatalog();
      setSel(r.order || r); setMode(null); setVals({}); setRemarks({});
      if (okMsg) alert(okMsg);
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }
  function submitReturn() {
    const lines = sel.lines
      .map(l => ({ lineRef: l.lineRef, qty: Number(vals[l.lineRef]) || 0, remark: remarks[l.lineRef] || "" }))
      .filter(l => l.qty > 0);
    if (!lines.length) return alert("Enter a return quantity first");
    act(sel.ref, "return", { lines }, "Return submitted — PROSAFE Stores will confirm receipt of the returned items.");
  }
  async function acknowledgeDN() {
    const lines = selectedDN.lines.map(l => ({
      lineRef: l.lineRef,
      qty: Number(vals[l.lineRef] ?? (l.qty - (l.received || 0))) || 0
    })).filter(l => l.qty > 0);
    if (!lines.length) return alert("Enter at least one received quantity");
    setBusy(true);
    try {
      const result = await api(`/api/orders/${sel.ref}/deliveries/${selectedDN.ref}/receive`, {
        method: "POST", body: { lines }
      });
      setSel(result.order);
      setSelectedDN(result.order.deliveries.find(d => d.ref === selectedDN.ref));
      setVals({});
      await load();
      alert("Delivery acknowledged. Returns are possible within 3 days of receipt.");
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  async function withdrawReturn(rt) {
    if (!window.confirm(`Withdraw return ${rt}?`)) return;
    setBusy(true);
    try {
      const o = await api(`/api/orders/${sel.ref}/returns/${rt}`, { method: "DELETE" });
      setSel(o); await load();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  async function confirmReturn(rt) {
    if (!window.confirm(`Confirm receipt of returned items on ${rt}? This credits the employee's approved qty list and the Main store, and raises a Credit Note.`)) return;
    setBusy(true);
    try {
      const o = await api(`/api/orders/${sel.ref}/returns/${rt}/confirm`, { method: "POST" });
      setSel(o); await load();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  async function resave() {
    setBusy(true);
    try {
      const r = await api(`/api/orders/${sel.ref}/resave`, { method: "POST" });
      setSel(r.order); await load();
      alert(r.updated.length
        ? "Re-saved — stock secured and delivery dates updated:\n" + r.updated.join("\n")
        : "Re-saved — no DOD line could be filled yet (Main-store stock still insufficient).");
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  if (!orders) return <Empty icon="⏳" text="Loading orders…" />;
  const inBucket = o => bucket === "all" ? true
    : bucket === "returns" ? (o.returns || []).length > 0
    : bucketOf(o) === bucket;
  const list = orders.filter(inBucket);
  const mine = o => user.role === "employee" && o.emp === user.id;
  const returnable = l => Math.max(0, (l.received || 0) - (l.returned || 0));

  return (
    <>
      <h1>{user.role === "employee" ? "My Orders" : "All Orders"}</h1>
      <div className="tabsbar">
        {BUCKETS.map(([id, lbl]) => {
          const n = id === "all" ? orders.length : orders.filter(o => id === "returns" ? (o.returns || []).length > 0 : bucketOf(o) === id).length;
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
                  <td className="b">{o.ref}{o.pendingReturns > 0 && <> <Chip label={`↩ ${o.pendingReturns}`} color="#e8a213" /></>}</td>
                  <td className="sm">{fmtDT(o.createdAt)}</td>
                  {user.role !== "employee" && <td className="sm">{o.empName}</td>}
                  <td className="sm">{o.contract}</td>
                  <td><StatusChip status={o.status} /></td>
                  <td className="num b">AED {fmt(o.total)}</td>
                  <td className="xs">{o.so || "—"}{o.dns?.length ? ` · ${o.dns.join(", ")}` : ""}</td>
                  <td><button className="btn sm blue" onClick={() => { setSel(o); setMode(null); setVals({}); setRemarks({}); setSelectedDN(null); }}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sel && !selectedDN && (
        <Modal onClose={() => setSel(null)}>
          <div className="row"><h1 style={{ margin: 0 }}>{sel.ref}</h1><StatusChip status={sel.status} /></div>
          <div className="card" style={{ marginTop: 12 }}>
            <div className="sm">Date: <b>{fmtDT(sel.createdAt)}</b> · Contract Ref: <b>{sel.contract}</b> · Price List: <b>{sel.plId}</b></div>
            <div className="sm">Employee: <b>{sel.empId} {sel.empName}</b> · Dept: <b>{sel.dept || "—"}</b> · Location: <b>{sel.location || "—"}</b> · Customer: <b>{sel.customerName}</b></div>
            <div className="sm">From Store: <b>{sel.fromStore}</b> (Main) · To Store: <b>{sel.toStore}</b> (Reservation)</div>
            {sel.so && <div className="sm">ERP SO: <b>{sel.so}</b>{sel.dns?.length ? <> · DO: <b>{sel.dns.join(", ")}</b></> : null}</div>}
            {sel.status === "pending_approval" && sel.approvalDeadline &&
              <div className="sm" style={{ color: "#e8a213" }}>Approval deadline: <b>{fmtDT(sel.approvalDeadline)}</b> — unapproved orders are cancelled automatically.</div>}
          </div>
          <div className="card">
            <table>
              <thead><tr>
                <th>Line Ref</th><th>Item / UOM</th><th className="num">Order Qty</th><th className="num">Approved</th><th className="num">U/Price</th>
                <th className="num">Delivered</th><th className="num">Awaiting Receipt</th><th className="num">Not Delivered</th><th className="num">Amount</th>
                <th>Stock</th><th>Delivery Date</th><th>Remarks</th>
                {mode === "return" && <th>Return Qty</th>}{mode === "return" && <th>Return Remark</th>}
              </tr></thead>
              <tbody>
                {sel.lines.map(l => (
                  <tr key={l.lineRef}>
                    <td className="xs">{l.lineRef}</td>
                    <td className="sm">{l.name || l.code}<br /><span className="xs mut">{l.code} · {l.uom}</span></td>
                    <td className="num">{l.orderedQty}</td>
                    <td className="num">{l.approvedQty}</td>
                    <td className="num">{fmt(l.price)}</td>
                    <td className="num">{l.received || 0}</td>
                    <td className="num">{l.awaitingReceipt}</td>
                    <td className="num">{l.notDelivered}</td>
                    <td className="num">{fmt(l.amount)}</td>
                    <td><StockChip stock={l.stock} /></td>
                    <td className="sm">{l.deliveryDate ? fmtD(l.deliveryDate) : "—"}</td>
                    <td className="xs">{l.remark || "—"}{l.returned > 0 && <div style={{ color: "#e8a213" }}>Returned: {l.returned}</div>}</td>
                    {mode === "return" && (
                      <td>{returnable(l) > 0
                        ? <input type="number" min="0" max={returnable(l)} style={{ width: 70 }}
                            value={vals[l.lineRef] ?? 0}
                            onChange={e => setVals({ ...vals, [l.lineRef]: e.target.value })} />
                        : "—"}</td>
                    )}
                    {mode === "return" && (
                      <td>{returnable(l) > 0
                        ? <input style={{ width: 120 }} placeholder="Reason"
                            value={remarks[l.lineRef] ?? ""}
                            onChange={e => setRemarks({ ...remarks, [l.lineRef]: e.target.value })} />
                        : "—"}</td>
                    )}
                  </tr>
                ))}
                <tr><td colSpan={8} className="num b">Total Amount</td><td className="num b">AED {fmt(sel.total)}</td><td colSpan={mode === "return" ? 5 : 3} /></tr>
              </tbody>
            </table>
          </div>

          <div className="row" style={{ marginBottom: 12 }}>
            {mode === "return"
              ? <>
                  <button className="btn ghost" onClick={() => setMode(null)}>Back</button>
                  <span className="xs mut">Returns are only possible within 3 days of acknowledging receipt.</span>
                  <span className="grow" />
                  <button className="btn blue" disabled={busy} onClick={submitReturn}>↩ Submit Return</button>
                </>
              : <>
                  {mine(sel) && sel.status === "in_progress" && (
                    <button className="btn red" disabled={!sel.cancellable || busy}
                      title={sel.cancellable ? "" : "15-minute window has passed or delivery started — ask PROSAFE Stores"}
                      onClick={() => window.confirm(`Cancel ${sel.ref}? Reserved stock returns to the Main store and your allocation is restored.`)
                        && act(sel.ref, "cancel", null, "Order cancelled.")}>
                      🗑 Cancel the Order
                    </button>
                  )}
                  {mine(sel) && ["complete", "partially_received"].includes(sel.status) &&
                    <button className="btn blue" onClick={() => setMode("return")}>↩ Return Order</button>}
                  {user.role === "admin" && sel.resavable &&
                    <button className="btn navy" disabled={busy} onClick={resave}
                      title="Check Main-store stock for DOD lines, reserve it and update delivery dates">💾 Re-save Order</button>}
                  {user.role === "admin" && ["in_progress", "pending_approval", "partially_delivered", "do_created", "partially_received"].includes(sel.status) &&
                    <button className="btn red" disabled={busy}
                      onClick={() => window.confirm(`Cancel the undelivered balance of ${sel.ref}? Reserved qtys go back to the Main store and the price list is credited.`)
                        && act(sel.ref, "cancel", null, "Cancelled.")}>
                      🗑 Cancel Order
                    </button>}
                  <span className="grow" />
                  <button className="btn ghost" onClick={() => setSel(null)}>Close</button>
                </>}
          </div>

          {(sel.returns || []).length > 0 && (
            <>
              <h2>Returns (RMA)</h2>
              <div className="card">
                {sel.returns.map(r => (
                  <div key={r.ref} className="row sm" style={{ padding: "7px 0", borderBottom: "1px solid var(--line)" }}>
                    <div className="grow">
                      <span className="b">{r.ref}</span> · <span className="xs mut">{fmtDT(r.at)}</span> ·{" "}
                      <Chip label={r.status === "pending" ? "Awaiting Return Confirmation" : "Confirmed"} color={r.status === "pending" ? "#e8a213" : "#1e9e6a"} />
                      <br />{r.lines.map(l => `${l.code}: ${l.qty}${l.remark ? ` (${l.remark})` : ""}`).join(" · ")} — AED {fmt(r.total)}
                    </div>
                    {mine(sel) && r.status === "pending" &&
                      <button className="btn sm ghost" disabled={busy} onClick={() => withdrawReturn(r.ref)}>Withdraw</button>}
                    {user.role === "admin" && r.status === "pending" &&
                      <button className="btn sm green" disabled={busy} onClick={() => confirmReturn(r.ref)}>Return Confirmation</button>}
                  </div>
                ))}
              </div>
            </>
          )}

          {sel.deliveries?.length > 0 && (
            <>
              <h2>Delivery Notes (from {sel.toStore})</h2>
              <div className="card">
                {sel.deliveries.map(d => (
                  <div key={d.ref} className="row sm" style={{ padding: "7px 0", borderBottom: "1px solid var(--line)" }}>
                    <div className="grow">
                      <span className="b">{d.ref}</span> · <span className="xs mut">{fmtDT(d.at)}</span> · <Chip label={d.status || "awaiting_receipt"} /><br />
                      DO Qty: {d.lines.map(l => `${l.code}: ${l.qty}`).join(" · ")}
                    </div>
                    <button className="btn sm blue" onClick={() => { setSelectedDN(d); setVals({}); }}>View</button>
                  </div>
                ))}
              </div>
            </>
          )}

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

      {sel && selectedDN && (
        <Modal onClose={() => setSelectedDN(null)}>
          <div className="row"><h1 style={{ margin: 0 }}>Delivery Note {selectedDN.ref}</h1><Chip label={selectedDN.status || "awaiting_receipt"} /></div>
          <div className="card sm" style={{ marginTop: 12 }}>
            Order <b>{sel.ref}</b> · Created <b>{fmtDT(selectedDN.at)}</b> · Store <b>{selectedDN.store || sel.toStore}</b> (Reservation)
          </div>
          <div className="card">
            <table>
              <thead><tr><th>Line</th><th>Item</th><th className="num">DO Qty</th><th className="num">Acknowledged</th><th className="num">Remaining</th>{mine(sel) && <th>Receive Qty</th>}</tr></thead>
              <tbody>{selectedDN.lines.map(l => {
                const remaining = l.qty - (l.received || 0);
                return (
                  <tr key={l.lineRef}>
                    <td className="xs">{l.lineRef}</td><td>{l.code}</td>
                    <td className="num">{l.qty}</td><td className="num">{l.received || 0}</td><td className="num">{remaining}</td>
                    {mine(sel) && <td>{remaining > 0
                      ? <input type="number" min="0" max={remaining} style={{ width: 80 }}
                          value={vals[l.lineRef] ?? remaining}
                          onChange={e => setVals({ ...vals, [l.lineRef]: e.target.value })} />
                      : "—"}</td>}
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <div className="row">
            <button className="btn ghost" onClick={() => setSelectedDN(null)}>Back to Order</button>
            <span className="grow" />
            {mine(sel) && selectedDN.lines.some(l => l.qty > (l.received || 0)) &&
              <button className="btn green" disabled={busy} onClick={acknowledgeDN}>
                {busy ? "Saving…" : "Acknowledge Delivered Items"}
              </button>}
          </div>
        </Modal>
      )}
    </>
  );
}
