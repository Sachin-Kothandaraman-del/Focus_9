import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Chip, Empty, Modal, fmt } from "../ui.jsx";

/* Admin — creation & control of all masters (SRS2):
   Customer, Contract, Department, Location, Division, Stores, Groups,
   Categories, UOM, Item and Price List masters. */

const KINDS = [
  ["customers", "Customers"], ["employees", "Employees"], ["contracts", "Contracts"], ["departments", "Departments"],
  ["locations", "Locations"], ["divisions", "Divisions"], ["stores", "Stores"],
  ["groups", "Groups"], ["categories", "Categories"], ["uoms", "UOM"],
  ["items", "Items"], ["priceLists", "Price Lists"]
];

const FIELDS = {
  customers: [
    { k: "id", l: "Code", req: true }, { k: "name", l: "Customer Name", req: true },
    { k: "address", l: "Address" }, { k: "phone", l: "Telephone" }, { k: "fax", l: "Fax" }, { k: "email", l: "E-mail" }
  ],
  /* Employee Master — registration checks Employee ID + Mobile Phone against
     it and fills the rest of the employee's profile in from this record. */
  employees: [
    { k: "empId", l: "Employee ID", req: true }, { k: "name", l: "Employee Name", req: true },
    { k: "customer", l: "Customer Name", sel: "customers", req: true },
    { k: "dept", l: "Department", sel: "departments" }, { k: "location", l: "Location", sel: "locations" },
    { k: "phone", l: "Mobile Phone", req: true }, { k: "telephone", l: "Telephone" }, { k: "email", l: "E-mail" }
  ],
  contracts: [
    { k: "ref", l: "Contract Reference", req: true }, { k: "customer", l: "Customer", sel: "customers" },
    { k: "value", l: "Contract Value", num: true }, { k: "start", l: "Start Date", date: true }, { k: "end", l: "End Date", date: true }
  ],
  departments: [{ k: "code", l: "Code", req: true }, { k: "name", l: "Department", req: true }],
  locations: [{ k: "code", l: "Code", req: true }, { k: "name", l: "Description", req: true }],
  divisions: [{ k: "code", l: "Code", req: true }, { k: "name", l: "Description", req: true }],
  stores: [
    { k: "code", l: "Code", req: true }, { k: "name", l: "Stores Name", req: true },
    { k: "division", l: "Division", sel: "divisions" }, { k: "type", l: "Type", opts: ["main", "reservation"] }
  ],
  groups: [{ k: "code", l: "Group Code", req: true }, { k: "name", l: "Group Name", req: true }],
  categories: [{ k: "code", l: "Category Code", req: true }, { k: "name", l: "Category Name", req: true }],
  uoms: [{ k: "code", l: "UOM", req: true }],
  items: [
    { k: "code", l: "Item Code", req: true }, { k: "name", l: "Item Name", req: true },
    { k: "desc", l: "Description" }, { k: "alias", l: "Alias Description" },
    { k: "uom", l: "UOM", sel: "uoms" }, { k: "group", l: "Group", sel: "groups" },
    { k: "cat", l: "Category", sel: "categories" }, { k: "pic", l: "Icon (emoji)" }
  ]
};

const keyOf = (kind, row) => kind === "uoms" ? row : (row.id ?? row.ref ?? row.empId ?? row.code);

export default function MastersPage() {
  const [m, setM] = useState(null);
  const [kind, setKind] = useState("customers");
  const [edit, setEdit] = useState(null);       // draft object being edited/created
  const [plEdit, setPlEdit] = useState(null);   // price-list draft
  const [busy, setBusy] = useState(false);

  async function load() { try { setM(await api("/api/masters")); } catch (e) {} }
  useEffect(() => { load(); }, []);

  async function save(obj) {
    setBusy(true);
    try {
      await api(`/api/admin/masters/${kind}`, { method: "POST", body: obj });
      setEdit(null); setPlEdit(null);
      await load();
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  }
  async function remove(id) {
    if (!window.confirm(`Delete ${id} from ${kind}? Existing orders keep their historic data.`)) return;
    setBusy(true);
    try { await api(`/api/admin/masters/${kind}/${encodeURIComponent(id)}`, { method: "DELETE" }); await load(); }
    catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  if (!m) return <Empty icon="⏳" text="Loading masters…" />;
  const rows = kind === "uoms" ? m.uoms : (m[kind] || []);
  const fields = FIELDS[kind];

  /* Show the readable name next to a code for fields that point at another
     master (e.g. Customer C02 → "C02 — Emirates Aluminum"). */
  const cell = (f, r) => {
    if (kind === "uoms") return r;
    const v = r[f.k];
    if (v == null || v === "") return "—";
    if (f.num) return fmt(v);
    const opt = f.sel && selOptions(f.sel).find(([code]) => code === v);
    return opt ? `${opt[0]} — ${opt[1]}` : String(v);
  };
  const selOptions = src =>
    src === "customers" ? m.customers.map(c => [c.id, c.name])
    : src === "divisions" ? m.divisions.map(d => [d.code, d.name])
    : src === "uoms" ? m.uoms.map(u => [u, u])
    : src === "groups" ? m.groups.map(g => [g.code, g.name])
    : src === "categories" ? m.categories.map(c => [c.code, c.name])
    : src === "departments" ? m.departments.map(d => [d.code, d.name])
    : src === "locations" ? m.locations.map(l => [l.code, l.name])
    : [];

  return (
    <>
      <h1>Masters</h1>
      <div className="tabsbar">
        {KINDS.map(([id, lbl]) => (
          <button key={id} className={kind === id ? "on" : ""} onClick={() => { setKind(id); setEdit(null); setPlEdit(null); }}>{lbl}</button>
        ))}
      </div>

      {kind !== "priceLists" && (
        <>
          <div className="row" style={{ marginBottom: 10 }}>
            <span className="sm mut grow">{rows.length} record/s</span>
            <button className="btn" onClick={() => setEdit({})}>＋ New</button>
          </div>
          <div className="card">
            <table>
              <thead><tr>{fields.map(f => <th key={f.k}>{f.l}</th>)}<th /></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={keyOf(kind, r)}>
                    {fields.map(f => <td key={f.k} className="sm">{cell(f, r)}</td>)}
                    <td style={{ whiteSpace: "nowrap" }}>
                      {kind !== "uoms" && <button className="btn sm ghost" onClick={() => setEdit({ ...r })}>Edit</button>}{" "}
                      <button className="btn sm red" disabled={busy} onClick={() => remove(keyOf(kind, r))}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {kind === "priceLists" && (
        <>
          <div className="row" style={{ marginBottom: 10 }}>
            <span className="sm mut grow">{m.priceLists.length} price list/s</span>
            <button className="btn" onClick={() => setPlEdit({ id: "", name: "", desc: "", contract: "", customer: "", validFrom: "", validTill: "", deliveryPeriod: 2, lines: [] })}>＋ New Price List</button>
          </div>
          {m.priceLists.map(p => (
            <div className="card" key={p.id}>
              <div className="row">
                <span className="b" style={{ color: "#0f2a43" }}>{p.id} — {p.name}</span>
                <Chip label={`Contract ${p.contract}`} color="#0f2a43" />
                <span className="xs mut">Valid {p.validFrom} → {p.validTill} · Delivery period {p.deliveryPeriod} day/s</span>
                <span className="grow" />
                <button className="btn sm ghost" onClick={() => setPlEdit(JSON.parse(JSON.stringify(p)))}>Edit</button>
                <button className="btn sm red" disabled={busy} onClick={() => remove(p.id)}>✕</button>
              </div>
              <table style={{ marginTop: 8 }}>
                <thead><tr><th>Sl</th><th>Item(s)</th><th>UOM</th><th className="num">U/Price</th><th className="num">Allocated qty</th><th className="num">Allocated amount</th><th>Qty restricted</th></tr></thead>
                <tbody>
                  {p.lines.map(l => (
                    <tr key={l.sl}>
                      <td>{l.sl}</td>
                      <td className="sm">{l.codes.join(", ")}</td>
                      <td>{l.uom}</td>
                      <td className="num">{fmt(l.price)}</td>
                      <td className="num">{l.alloc}</td>
                      <td className="num">{fmt(l.price * l.alloc)}</td>
                      <td><Chip label={l.restricted ? "Yes" : "No"} color={l.restricted ? "#d64545" : "#6b7c8d"} /></td>
                    </tr>
                  ))}
                  <tr><td colSpan={5} className="num b">Total Allocated Amount</td>
                    <td className="num b">{fmt(p.lines.reduce((s, l) => s + l.price * l.alloc, 0))}</td><td /></tr>
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}

      {edit && (
        <Modal onClose={() => setEdit(null)}>
          <h1>{keyOf(kind, edit) ? "Edit" : "New"} — {KINDS.find(k => k[0] === kind)[1]}</h1>
          <div className="card">
            {fields.map(f => (
              <div key={f.k}>
                <label className="f">{f.l}{f.req ? " *" : ""}</label>
                {f.sel
                  ? <select value={edit[f.k] || ""} onChange={e => setEdit({ ...edit, [f.k]: e.target.value })}>
                      <option value="">—</option>
                      {selOptions(f.sel).map(([v, l]) => <option key={v} value={v}>{v} — {l}</option>)}
                    </select>
                  : f.opts
                    ? <select value={edit[f.k] || ""} onChange={e => setEdit({ ...edit, [f.k]: e.target.value })}>
                        <option value="">—</option>
                        {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    : <input type={f.num ? "number" : f.date ? "date" : "text"} value={edit[f.k] ?? ""}
                        onChange={e => setEdit({ ...edit, [f.k]: f.num ? Number(e.target.value) : e.target.value })} />}
              </div>
            ))}
          </div>
          <div className="row">
            <button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>
            <span className="grow" />
            <button className="btn" disabled={busy} onClick={() => {
              for (const f of fields) if (f.req && !String(edit[f.k] ?? "").trim()) return alert(`${f.l} is required`);
              save(kind === "uoms" ? { code: edit.code } : edit);
            }}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </Modal>
      )}

      {plEdit && (
        <Modal onClose={() => setPlEdit(null)}>
          <h1>{plEdit.id ? `Price List ${plEdit.id}` : "New Price List"}</h1>
          <div className="card">
            <div className="row">
              <div><label className="f">Code *</label><input style={{ width: 90 }} value={plEdit.id} onChange={e => setPlEdit({ ...plEdit, id: e.target.value })} /></div>
              <div><label className="f">Description *</label><input value={plEdit.name} onChange={e => setPlEdit({ ...plEdit, name: e.target.value })} /></div>
              <div><label className="f">Contract</label>
                <select value={plEdit.contract} onChange={e => {
                  const c = m.contracts.find(x => x.ref === e.target.value);
                  setPlEdit({ ...plEdit, contract: e.target.value, customer: c ? c.customer : plEdit.customer });
                }}>
                  <option value="">—</option>
                  {m.contracts.map(c => <option key={c.ref} value={c.ref}>{c.ref}</option>)}
                </select></div>
              <div><label className="f">Start Date</label><input type="date" value={plEdit.validFrom || ""} onChange={e => setPlEdit({ ...plEdit, validFrom: e.target.value })} /></div>
              <div><label className="f">End Date</label><input type="date" value={plEdit.validTill || ""} onChange={e => setPlEdit({ ...plEdit, validTill: e.target.value })} /></div>
              <div><label className="f">Delivery Period (days)</label><input type="number" min="0" style={{ width: 80 }} value={plEdit.deliveryPeriod} onChange={e => setPlEdit({ ...plEdit, deliveryPeriod: Number(e.target.value) })} /></div>
            </div>
          </div>
          <div className="card">
            <table>
              <thead><tr><th>Sl</th><th style={{ minWidth: 260 }}>Item code(s) — size variants share one allocation</th><th>UOM</th><th>U/Price</th><th>Allocated qty</th><th>Qty restricted</th><th /></tr></thead>
              <tbody>
                {plEdit.lines.map((l, ix) => (
                  <tr key={ix}>
                    <td>{ix + 1}</td>
                    <td>
                      {l.codes.map(c => (
                        <span key={c} className="chip" style={{ background: "#0f2a4322", color: "#0f2a43", margin: 2, cursor: "pointer" }}
                          title="Remove"
                          onClick={() => {
                            const lines = [...plEdit.lines];
                            lines[ix] = { ...l, codes: l.codes.filter(x => x !== c) };
                            setPlEdit({ ...plEdit, lines });
                          }}>{c} ✕</span>
                      ))}
                      <select value="" onChange={e => {
                        if (!e.target.value) return;
                        const item = m.items.find(i => i.code === e.target.value);
                        const lines = [...plEdit.lines];
                        lines[ix] = { ...l, codes: [...l.codes, e.target.value], uom: l.uom || (item ? item.uom : "") };
                        setPlEdit({ ...plEdit, lines });
                      }}>
                        <option value="">＋ add item…</option>
                        {m.items.filter(i => !l.codes.includes(i.code)).map(i => <option key={i.code} value={i.code}>{i.code} — {i.name}</option>)}
                      </select>
                    </td>
                    <td><input style={{ width: 60 }} value={l.uom || ""} onChange={e => {
                      const lines = [...plEdit.lines]; lines[ix] = { ...l, uom: e.target.value }; setPlEdit({ ...plEdit, lines });
                    }} /></td>
                    <td><input type="number" min="0" step="0.01" style={{ width: 90 }} value={l.price} onChange={e => {
                      const lines = [...plEdit.lines]; lines[ix] = { ...l, price: Number(e.target.value) }; setPlEdit({ ...plEdit, lines });
                    }} /></td>
                    <td><input type="number" min="0" style={{ width: 70 }} value={l.alloc} onChange={e => {
                      const lines = [...plEdit.lines]; lines[ix] = { ...l, alloc: Number(e.target.value) }; setPlEdit({ ...plEdit, lines });
                    }} /></td>
                    <td><input type="checkbox" checked={l.restricted !== false} onChange={e => {
                      const lines = [...plEdit.lines]; lines[ix] = { ...l, restricted: e.target.checked }; setPlEdit({ ...plEdit, lines });
                    }} /></td>
                    <td><button className="btn sm red" onClick={() => setPlEdit({ ...plEdit, lines: plEdit.lines.filter((_, i) => i !== ix) })}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn sm ghost" style={{ marginTop: 8 }}
              onClick={() => setPlEdit({ ...plEdit, lines: [...plEdit.lines, { sl: plEdit.lines.length + 1, codes: [], uom: "", price: 0, alloc: 0, restricted: true }] })}>
              ＋ Add line
            </button>
          </div>
          <div className="row">
            <button className="btn ghost" onClick={() => setPlEdit(null)}>Cancel</button>
            <span className="grow" />
            <button className="btn" disabled={busy} onClick={() => {
              if (!plEdit.id.trim() || !plEdit.name.trim()) return alert("Code and description are required");
              if (!plEdit.lines.length) return alert("Add at least one line");
              if (plEdit.lines.some(l => !l.codes.length)) return alert("Every line needs at least one item code");
              save({ ...plEdit, lines: plEdit.lines.map((l, ix) => ({ ...l, sl: ix + 1 })) });
            }}>{busy ? "Saving…" : "Save Price List"}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
