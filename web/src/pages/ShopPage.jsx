import React, { useMemo, useState } from "react";
import { useApp } from "../App.jsx";
import { Chip, Empty, fmt } from "../ui.jsx";

export default function ShopPage() {
  const { catalog, orderCart, addToCart } = useApp();
  const [group, setGroup] = useState(null);
  const [cat, setCat] = useState(null);
  const [qtys, setQtys] = useState({});

  const groups = useMemo(() => catalog ? [...new Set(catalog.lines.map(l => l.item.group))] : [], [catalog]);
  if (!catalog) return <Empty icon="⏳" text="Loading your approved price list…" />;
  const activeGroup = group || groups[0];
  const cats = [...new Set(catalog.lines.filter(l => l.item.group === activeGroup).map(l => l.item.cat))];
  const lines = catalog.lines.filter(l => l.item.group === activeGroup && (!cat || l.item.cat === cat));
  const qtyOf = code => Math.max(1, parseInt(qtys[code]) || 1);
  const inCart = code => orderCart.filter(x => x.code === code).reduce((s, x) => s + x.qty, 0);

  function add(l) {
    const qty = qtyOf(l.code);
    if (!l.restricted && qty + inCart(l.code) <= l.balance) {
      addToCart("order", l.code, qty);
    } else {
      const why = l.restricted ? "This item is restricted and needs client approval."
        : `Requested qty exceeds your allocated balance (${l.balance} available).`;
      if (window.confirm(`${why}\n\nSend it for approval instead?`)) addToCart("approval", l.code, qty);
    }
  }

  return (
    <>
      <h1>Shopping List</h1>
      <div className="card row">
        <span className="b">Contract {catalog.priceList.contract}</span>
        <Chip label={catalog.priceList.name} color="#0f2a43" />
        <Chip label={catalog.customer.name} />
        <span className="grow" />
        <span className="xs mut">Valid {catalog.priceList.validFrom} → {catalog.priceList.validTill}</span>
      </div>
      <div className="tabsbar">
        {groups.map(g => (
          <button key={g} className={g === activeGroup ? "on" : ""} onClick={() => { setGroup(g); setCat(null); }}>{g}</button>
        ))}
      </div>
      <div className="tabsbar cat">
        <button className={!cat ? "on" : ""} onClick={() => setCat(null)}>All</button>
        {cats.map(c => <button key={c} className={c === cat ? "on" : ""} onClick={() => setCat(c)}>{c}</button>)}
      </div>
      <div className="grid">
        {lines.map(l => (
          <div className="item" key={l.code}>
            {l.restricted && <span style={{ position: "absolute", top: 8, right: 8 }}><Chip label="RESTRICTED" color="#d64545" /></span>}
            <div className="pic">{l.item.pic}</div>
            <div className="nm">{l.item.name}</div>
            <div className="xs mut">{l.code} · {l.item.uom}</div>
            <div className="b" style={{ color: "#0f2a43" }}>AED {fmt(l.price)}</div>
            <div className="xs mut">
              Allocated {l.allocated} · <span className="b" style={{ color: l.balance > 0 ? "#1e9e6a" : "#d64545" }}>Bal {l.balance}</span>
            </div>
            <div className="row">
              <input type="number" min="1" style={{ width: 70 }} value={qtys[l.code] ?? 1}
                onChange={e => setQtys({ ...qtys, [l.code]: e.target.value })} />
              <button className="btn sm navy grow" onClick={() => add(l)}>Add ➜</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
