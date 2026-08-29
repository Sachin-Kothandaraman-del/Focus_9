import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Chip, Empty } from "../ui.jsx";

/* Store Module — Inventory (SRS2): stock per store, manual adjustments and
   manual stock transfers (Issue + Receipt vouchers). */
export default function InventoryPage() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [adj, setAdj] = useState({ store: "", code: "", qty: "", reason: "" });
  const [tr, setTr] = useState({ from: "", to: "", code: "", qty: "" });
  const [filter, setFilter] = useState("");

  async function load() { try { setData(await api("/api/admin/inventory")); } catch (e) {} }
  useEffect(() => { load(); }, []);

  async function adjust() {
    const qty = Number(adj.qty);
    if (!adj.store || !adj.code || !Number.isFinite(qty) || qty === 0) return alert("Choose store, item and a non-zero quantity (± allowed).");
    setBusy(true);
    try {
      await api("/api/admin/inventory/adjust", { method: "POST", body: { ...adj, qty } });
      setAdj({ ...adj, qty: "", reason: "" });
      await load();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  async function transfer() {
    const qty = Number(tr.qty);
    if (!tr.from || !tr.to || tr.from === tr.to || !tr.code || !(qty > 0)) return alert("Choose different stores, an item and a positive quantity.");
    setBusy(true);
    try {
      const r = await api("/api/admin/inventory/transfer", { method: "POST", body: { from: tr.from, to: tr.to, lines: [{ code: tr.code, qty }] } });
      alert(`Stock transferred — ${r.transfer.ref} (Issue ${r.transfer.issueRef} / Receipt ${r.transfer.receiptRef})`);
      setTr({ ...tr, qty: "" });
      await load();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  if (!data) return <Empty icon="⏳" text="Loading inventory…" />;
  const { stores, items, inventory } = data;
  const q = filter.trim().toLowerCase();
  const rows = items.filter(i => !q || i.code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q));

  return (
    <>
      <h1>Store Inventory</h1>
      <div className="card row">
        <Chip label={`${stores.length} stores`} color="#0f2a43" />
        {stores.map(s => <span key={s.code} className="xs mut"><b>{s.code}</b> {s.name} ({s.type})</span>)}
        <span className="grow" />
        <input placeholder="🔎 Filter items…" value={filter} onChange={e => setFilter(e.target.value)} />
      </div>

      <h2>🔧 Adjust stock (receipts from suppliers, corrections)</h2>
      <div className="card row">
        <select value={adj.store} onChange={e => setAdj({ ...adj, store: e.target.value })}>
          <option value="">Store…</option>
          {stores.map(s => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
        </select>
        <select value={adj.code} onChange={e => setAdj({ ...adj, code: e.target.value })}>
          <option value="">Item…</option>
          {items.map(i => <option key={i.code} value={i.code}>{i.code} — {i.name}</option>)}
        </select>
        <input type="number" placeholder="± Qty" style={{ width: 90 }} value={adj.qty} onChange={e => setAdj({ ...adj, qty: e.target.value })} />
        <input placeholder="Reason (optional)" value={adj.reason} onChange={e => setAdj({ ...adj, reason: e.target.value })} />
        <button className="btn" disabled={busy} onClick={adjust}>Apply</button>
      </div>

      <h2>🔁 Manual stock transfer (Issue + Receipt vouchers)</h2>
      <div className="card row">
        <select value={tr.from} onChange={e => setTr({ ...tr, from: e.target.value })}>
          <option value="">From…</option>
          {stores.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
        </select>
        <span>→</span>
        <select value={tr.to} onChange={e => setTr({ ...tr, to: e.target.value })}>
          <option value="">To…</option>
          {stores.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
        </select>
        <select value={tr.code} onChange={e => setTr({ ...tr, code: e.target.value })}>
          <option value="">Item…</option>
          {items.map(i => <option key={i.code} value={i.code}>{i.code} — {i.name}</option>)}
        </select>
        <input type="number" min="1" placeholder="Qty" style={{ width: 90 }} value={tr.qty} onChange={e => setTr({ ...tr, qty: e.target.value })} />
        <button className="btn navy" disabled={busy} onClick={transfer}>Transfer</button>
      </div>

      <h2>📋 Stock by store</h2>
      <div className="card">
        <table>
          <thead><tr><th>Item</th><th>UOM</th>{stores.map(s => <th key={s.code} className="num">{s.code}</th>)}</tr></thead>
          <tbody>
            {rows.map(i => (
              <tr key={i.code}>
                <td><span className="b">{i.name}</span><br /><span className="xs mut">{i.code} · {i.group}/{i.cat}</span></td>
                <td>{i.uom}</td>
                {stores.map(s => {
                  const v = (inventory[s.code] && inventory[s.code][i.code]) || 0;
                  return <td key={s.code} className="num" style={{ color: v > 0 ? undefined : "#c6cfd8" }}>{v}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
