import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Chip, StatusChip, Empty, Modal, fmt, fmtDT } from "../ui.jsx";

/* PROSAFE Stores — Fulfilment (SRS2 Store Module):
   SO processing, DO creation (from the Reservation store, reserved qtys only),
   bulk Re-save, Return Confirmations, DO consolidation → invoicing,
   and the ERP document console (SO / DO / Stock Transfers / Invoices /
   Returns / Credit Notes / log — Receipt Vouchers removed per SRS2). */
export default function FulfilPage() {
  const [orders, setOrders] = useState(null);
  const [erp, setErp] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("so");
  const [delivery, setDelivery] = useState(null);
  const [deliveryQty, setDeliveryQty] = useState({});

  async function load() {
    try {
      const [o, e] = await Promise.all([api("/api/orders"), api("/api/erp/documents")]);
      setOrders(o); setErp(e);
    } catch (e) {}
  }
  useEffect(() => { load(); }, []);

  const deliverable = l => Math.min(Math.max(0, (l.approvedQty ?? l.qty) - (l.delivered || 0)), l.reservedQty || 0);

  function openDelivery(order) {
    setDelivery(order);
    setDeliveryQty(Object.fromEntries(order.lines.map(l => [l.lineRef, deliverable(l)])));
  }
  async function createDN() {
    const lines = delivery.lines
      .map(l => ({ lineRef: l.lineRef, qty: Number(deliveryQty[l.lineRef]) || 0 }))
      .filter(l => l.qty > 0);
    if (!lines.length) return alert("Enter at least one quantity to deliver.");
    setBusy(true);
    try {
      await api(`/api/orders/${delivery.ref}/delivery-note`, { method: "POST", body: { lines } });
      setDelivery(null); setDeliveryQty({}); await load();
    }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  async function resaveAll() {
    setBusy(true);
    try {
      const r = await api("/api/orders/resave-all", { method: "POST" });
      await load();
      alert(r.resaved.length
        ? "Re-saved:\n" + r.resaved.map(x => `${x.ref}: ${x.updated.join(", ")}`).join("\n")
        : "No DOD lines could be filled — Main-store stock is still insufficient.");
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  async function confirmReturn(orderRef, rt) {
    if (!window.confirm(`Confirm receipt of returned items on ${rt}? This credits the employee's approved qty list and the Main store, and raises a Credit Note.`)) return;
    setBusy(true);
    try { await api(`/api/orders/${orderRef}/returns/${rt}/confirm`, { method: "POST" }); await load(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  async function consolidate() {
    setBusy(true);
    try {
      const r = await api("/api/invoices/consolidate", { method: "POST" });
      await load();
      alert("Invoiced:\n" + r.invoices.map(i => `${i.ref} → ${i.customerName} — AED ${fmt(i.total)}`).join("\n"));
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  if (!orders || !erp) return <Empty icon="⏳" text="Loading…" />;
  const openStatuses = ["in_progress", "partially_delivered", "partially_received"];
  const toDeliver = orders.filter(o => openStatuses.includes(o.status) &&
    o.lines.some(l => (l.approvedQty ?? l.qty) - (l.delivered || 0) > 0));
  const dodOrders = orders.filter(o => o.resavable);
  const pendingReturns = orders.flatMap(o => (o.returns || [])
    .filter(r => r.status === "pending")
    .map(r => ({ order: o, rma: r })));
  const awaiting = orders.flatMap(o => (o.deliveries || [])
    .filter(d => d.lines.some(l => l.qty > (l.received || 0)))
    .map(d => ({ order: o, delivery: d })));
  const pendingDNs = erp.dn.filter(d => !d.invoiced);
  const TABS = [["so", "Sales Orders"], ["dn", "Delivery Notes"], ["stv", "Stock Transfers"], ["inv", "Invoices"], ["ret", "Returns"], ["cn", "Credit Notes"], ["log", "API / Event Log"]];

  return (
    <>
      <h1>PROSAFE Stores — Fulfilment</h1>

      <h2>🚚 SOs ready for Delivery Note <span className="xs mut">(issued from the Reservation store — only reserved qtys can ship)</span></h2>
      {toDeliver.length === 0
        ? <div className="card sm mut">No open SOs awaiting delivery.</div>
        : <div className="card"><table>
            <thead><tr><th>Order</th><th>SO</th><th>Employee</th><th>Customer</th><th>Res. Store</th><th>Remaining (reserved)</th><th /></tr></thead>
            <tbody>{toDeliver.map(o => (
              <tr key={o.ref}>
                <td className="b">{o.ref}</td><td>{o.so || "—"}</td><td>{o.empName}</td><td>{o.customerName}</td><td>{o.toStore}</td>
                <td className="sm">{o.lines.filter(l => (l.approvedQty ?? l.qty) - (l.delivered || 0) > 0)
                  .map(l => `${l.code}: ${(l.approvedQty ?? l.qty) - (l.delivered || 0)}${deliverable(l) < (l.approvedQty ?? l.qty) - (l.delivered || 0) ? ` (${deliverable(l)} reserved)` : ""}`).join(", ")}</td>
                <td><button className="btn sm navy" disabled={busy} onClick={() => openDelivery(o)}>📄 Select Delivery Qty</button></td>
              </tr>
            ))}</tbody>
          </table></div>}

      <h2>💾 Re-save — fill "DOD to be advised" lines when Main-store stock arrives</h2>
      <div className="card row">
        <span className="sm mut grow">{dodOrders.length} order/s have unreserved (DOD) quantities.{dodOrders.length ? " Orders: " + dodOrders.map(o => o.ref).join(", ") : ""}</span>
        <button className="btn navy" disabled={!dodOrders.length || busy} onClick={resaveAll}>💾 Re-save all Orders</button>
      </div>

      <h2>↩ Returns awaiting Return Confirmation</h2>
      {pendingReturns.length === 0
        ? <div className="card sm mut">No returns awaiting confirmation.</div>
        : <div className="card"><table>
            <thead><tr><th>Return</th><th>Order</th><th>Employee</th><th>Items</th><th className="num">Value</th><th /></tr></thead>
            <tbody>{pendingReturns.map(({ order: o, rma }) => (
              <tr key={rma.ref}>
                <td className="b">{rma.ref}</td><td>{o.ref}</td><td>{o.empName}</td>
                <td className="sm">{rma.lines.map(l => `${l.code}: ${l.qty}${l.remark ? ` (${l.remark})` : ""}`).join(", ")}</td>
                <td className="num">AED {fmt(rma.total)}</td>
                <td><button className="btn sm green" disabled={busy} onClick={() => confirmReturn(o.ref, rma.ref)}>✅ Return Confirmation</button></td>
              </tr>
            ))}</tbody>
          </table></div>}

      <h2>📦 Delivered — awaiting employee acknowledgement</h2>
      {awaiting.length === 0
        ? <div className="card sm mut">Nothing awaiting acknowledgement.</div>
        : <div className="card"><table>
            <thead><tr><th>Order</th><th>DO</th><th>Employee</th><th>Status</th><th>Awaiting</th></tr></thead>
            <tbody>{awaiting.map(({ order: o, delivery: d }) => (
              <tr key={d.ref}>
                <td className="b">{o.ref}</td><td>{d.ref}</td><td>{o.empName}</td>
                <td><StatusChip status={o.status} /></td>
                <td className="sm">{d.lines.filter(l => l.qty > (l.received || 0)).map(l => `${l.code}: ${l.qty - (l.received || 0)}`).join(", ")}</td>
              </tr>
            ))}</tbody>
          </table></div>}

      <h2>🧾 DO consolidation → invoice to EGA</h2>
      <div className="card row">
        <span className="sm mut grow">{pendingDNs.length} delivery note/s pending invoicing.</span>
        <button className="btn" disabled={!pendingDNs.length || busy} onClick={consolidate}>🧾 Consolidate DOs &amp; Invoice EGA</button>
      </div>

      <h2>🗄 ERP documents (Focus9 / ERPNext)</h2>
      <div className="tabsbar">
        {TABS.map(([id, lbl]) => {
          const n = id === "log" ? erp.log.length : (erp[id] || []).length;
          return <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{lbl}{n ? ` (${n})` : ""}</button>;
        })}
      </div>
      {tab === "log"
        ? <div className="card">
            {erp.log.length === 0 && <div className="mut sm">Middleware ↔ ERP traffic will appear here.</div>}
            {erp.log.slice(0, 40).map((l, i) => (
              <div key={i} className="sm" style={{ padding: "5px 0", borderBottom: "1px solid var(--line)" }}>
                <span className="xs mut">{fmtDT(l.at)}</span><br />{l.msg}
              </div>
            ))}
          </div>
        : tab === "stv"
          ? <div className="card">
              {(erp.stv || []).length === 0 ? <div className="mut sm">No stock transfers yet.</div> : (
                <table>
                  <thead><tr><th>Transfer</th><th>Issue / Receipt</th><th>Date</th><th>From → To</th><th>Order</th><th>Items</th><th>Reason</th></tr></thead>
                  <tbody>{erp.stv.map(d => (
                    <tr key={d.ref}>
                      <td className="b">{d.ref}</td>
                      <td className="xs">{d.issueRef} / {d.receiptRef}</td>
                      <td className="sm">{fmtDT(d.at)}</td>
                      <td className="sm">{d.from} → {d.to}</td>
                      <td className="xs">{d.order || "—"}</td>
                      <td className="sm">{d.lines.map(l => `${l.code}: ${l.qty}`).join(", ")}</td>
                      <td className="xs">{d.reason || "—"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
          : <div className="card">
              {(erp[tab] || []).length === 0 ? <div className="mut sm">No documents yet.</div> : (
                <table>
                  <thead><tr><th>Ref</th><th>Date</th><th>Against</th><th>Party</th><th className="num">Total</th><th>Status</th></tr></thead>
                  <tbody>{erp[tab].map(d => (
                    <tr key={d.ref}>
                      <td className="b">{d.ref}</td>
                      <td className="sm">{fmtDT(d.at)}</td>
                      <td className="xs">{d.order || (d.dns ? d.dns.join(", ") : "")}{d.so ? ` · ${d.so}` : ""}{d.rma ? ` · ${d.rma}` : ""}</td>
                      <td className="sm">{d.customerName}{d.empName ? ` · ${d.empName}` : ""}</td>
                      <td className="num">{d.total != null ? "AED " + fmt(d.total) : "—"}</td>
                      <td className="xs">{d.status || (d.invoiced ? "Invoiced" : "Open")}</td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>}

      {delivery && (
        <Modal onClose={() => !busy && setDelivery(null)}>
          <h1>Create Delivery Note — {delivery.ref} <span className="xs mut">from {delivery.toStore}</span></h1>
          <div className="card sm mut">Only quantities reserved in the Reservation store can be delivered. Re-save the order to reserve DOD lines once Main-store stock arrives. Another delivery note can be created later for the balance.</div>
          <div className="card">
            <table>
              <thead><tr><th>Item</th><th className="num">Approved</th><th className="num">Delivered before</th><th className="num">Reserved</th><th className="num">Remaining</th><th>Deliver now</th></tr></thead>
              <tbody>{delivery.lines.map(l => {
                const delivered = l.delivered || 0;
                const remaining = (l.approvedQty ?? l.qty) - delivered;
                const max = deliverable(l);
                return (
                  <tr key={l.lineRef}>
                    <td className="b">{l.code}<br /><span className="xs mut">{l.lineRef}</span></td>
                    <td className="num">{l.approvedQty ?? l.qty}</td><td className="num">{delivered}</td>
                    <td className="num">{l.reservedQty || 0}</td><td className="num">{remaining}</td>
                    <td>{max > 0
                      ? <input type="number" min="0" max={max} style={{ width: 90 }}
                          value={deliveryQty[l.lineRef] ?? max}
                          onChange={e => setDeliveryQty({ ...deliveryQty, [l.lineRef]: e.target.value })} />
                      : <span className="xs mut">{remaining > 0 ? "not reserved (DOD)" : "—"}</span>}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <div className="row">
            <button className="btn ghost" disabled={busy} onClick={() => setDelivery(null)}>Cancel</button>
            <span className="grow" />
            <button className="btn navy" disabled={busy} onClick={createDN}>{busy ? "Creating…" : "Create Delivery Note"}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
