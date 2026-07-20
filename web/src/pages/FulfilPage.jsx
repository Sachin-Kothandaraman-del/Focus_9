import React, { useEffect, useState } from "react";
import { api } from "../api";
import { StatusChip, Empty, fmt, fmtDT } from "../ui.jsx";

export default function FulfilPage() {
  const [orders, setOrders] = useState(null);
  const [erp, setErp] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("so");

  async function load() {
    try {
      const [o, e] = await Promise.all([api("/api/orders"), api("/api/erp/documents")]);
      setOrders(o); setErp(e);
    } catch (e) {}
  }
  useEffect(() => { load(); }, []);

  async function createDN(ref) {
    setBusy(true);
    try { await api(`/api/orders/${ref}/delivery-note`, { method: "POST" }); await load(); }
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
  const toDeliver = orders.filter(o => o.status === "in_progress");
  const awaiting = orders.filter(o => ["do_created", "partially_received"].includes(o.status));
  const pendingDNs = erp.dn.filter(d => !d.invoiced);
  const TABS = [["so", "Sales Orders"], ["dn", "Delivery Notes"], ["inv", "Invoices"], ["ret", "Returns"], ["log", "API / Event Log"]];

  return (
    <>
      <h1>PROSAFE Stores — Fulfilment</h1>

      <h2>🚚 SOs ready for Delivery Note</h2>
      {toDeliver.length === 0
        ? <div className="card sm mut">No open SOs awaiting delivery.</div>
        : <div className="card"><table>
            <thead><tr><th>Order</th><th>SO</th><th>Employee</th><th>Customer</th><th className="num">Total</th><th /></tr></thead>
            <tbody>{toDeliver.map(o => (
              <tr key={o.ref}>
                <td className="b">{o.ref}</td><td>{o.so}</td><td>{o.empName}</td><td>{o.customerName}</td>
                <td className="num">AED {fmt(o.total)}</td>
                <td><button className="btn sm navy" disabled={busy} onClick={() => createDN(o.ref)}>📄 Create Delivery Note</button></td>
              </tr>
            ))}</tbody>
          </table></div>}

      <h2>📦 Delivered — awaiting receipt acknowledgement</h2>
      {awaiting.length === 0
        ? <div className="card sm mut">Nothing awaiting acknowledgement.</div>
        : <div className="card"><table>
            <thead><tr><th>Order</th><th>DO</th><th>Employee</th><th>Status</th><th className="num">Total</th></tr></thead>
            <tbody>{awaiting.map(o => (
              <tr key={o.ref}>
                <td className="b">{o.ref}</td><td>{o.dns.join(", ")}</td><td>{o.empName}</td>
                <td><StatusChip status={o.status} /></td><td className="num">AED {fmt(o.total)}</td>
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
          const n = id === "log" ? erp.log.length : erp[id].length;
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
        : <div className="card">
            {erp[tab].length === 0 ? <div className="mut sm">No documents yet.</div> : (
              <table>
                <thead><tr><th>Ref</th><th>Date</th><th>Against</th><th>Party</th><th className="num">Total</th><th>Status</th></tr></thead>
                <tbody>{erp[tab].map(d => (
                  <tr key={d.ref}>
                    <td className="b">{d.ref}</td>
                    <td className="sm">{fmtDT(d.at)}</td>
                    <td className="xs">{d.order || (d.dns ? d.dns.join(", ") : "")}{d.so ? ` · ${d.so}` : ""}</td>
                    <td className="sm">{d.customerName}{d.empName ? ` · ${d.empName}` : ""}</td>
                    <td className="num">AED {fmt(d.total)}</td>
                    <td className="xs">{d.status || (d.invoiced ? "Invoiced" : "Open")}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>}
    </>
  );
}
