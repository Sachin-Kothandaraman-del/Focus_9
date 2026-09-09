import React, { useMemo, useState } from "react";
import { useApp } from "../App.jsx";
import { Chip, Empty, ShopHeader, fmt, variantLabel, variantKind } from "../ui.jsx";

/* Shopping List Page (SRS2): one shopping tab per assigned price list; items
   filtered by Groups & Categories; live Main-store stock on every item;
   within-limit picks → Order Cart, over-limit → Approval Cart (after confirm). */
export default function ShopPage() {
  const { catalog, cart, addToCart } = useApp();
  const [plIx, setPlIx] = useState(0);
  const [group, setGroup] = useState(null);
  const [cat, setCat] = useState(null);
  const [sizeSel, setSizeSel] = useState({});     // lineKey → selected item code

  const profiles = catalog?.profiles || [];
  const profile = profiles[Math.min(plIx, profiles.length - 1)] || null;

  /* Group and Category are labels carried by the item (there is no Group or
     Category master) — the tabs are the distinct values on this price list. */
  const groups = useMemo(() => {
    if (!profile) return [];
    const seen = [];
    for (const l of profile.lines) if (l.group && !seen.includes(l.group)) seen.push(l.group);
    return seen;
  }, [profile]);

  if (!catalog) return <Empty icon="⏳" text="Loading your approved price lists…" />;
  if (!profile) return <Empty icon="🛒" text="No price list is assigned to you yet — contact the PROSAFE admin." />;

  const activeGroup = groups.includes(group) ? group : (groups[0] || null);
  const cats = [];
  for (const l of profile.lines) {
    if (l.group === activeGroup && l.cat && !cats.includes(l.cat)) cats.push(l.cat);
  }
  const lines = profile.lines.filter(l =>
    (!activeGroup || l.group === activeGroup) && (!cat || l.cat === cat));

  const cartQtyOf = code =>
    cart.order.filter(x => x.code === code).reduce((s, x) => s + x.qty, 0) +
    cart.approval.filter(x => x.code === code).reduce((s, x) => s + x.qty, 0);

  async function addOne(l, code) {
    const r = await addToCart(profile.priceList.id, code, 1);
    if (r.ok) {
      if (r.notice) alert(r.notice);
      return;
    }
    if (r.needsApproval) {
      if (window.confirm(`${r.error.replace(" Send it for approval?", "")}\n\nDo you want to send the Order for approval?`)) {
        const r2 = await addToCart(profile.priceList.id, code, 1, true);
        if (!r2.ok) alert(r2.error);
        else if (r2.notice) alert(r2.notice);
      }
    } else {
      alert(r.error);
    }
  }
  async function subtractOne(code) {
    const r = await addToCart(profile.priceList.id, code, -1);
    if (!r.ok) alert(r.error);
  }

  return (
    <>
      <h1>Shopping List</h1>
      {profiles.length > 1 && (
        <div className="tabsbar">
          {profiles.map((p, ix) => (
            <button key={p.priceList.id} className={ix === plIx ? "on" : ""}
              onClick={() => { setPlIx(ix); setGroup(null); setCat(null); }}>
              {p.priceList.name} · {p.priceList.contract}
            </button>
          ))}
        </div>
      )}
      <ShopHeader profile={profile} />
      <div className="tabsbar">
        {groups.map(g => (
          <button key={g} className={g === activeGroup ? "on" : ""}
            onClick={() => { setGroup(g); setCat(null); }}>{g}</button>
        ))}
      </div>
      {cats.length > 1 && (
        <div className="tabsbar cat">
          <button className={!cat ? "on" : ""} onClick={() => setCat(null)}>All</button>
          {cats.map(c => <button key={c} className={c === cat ? "on" : ""} onClick={() => setCat(c)}>{c}</button>)}
        </div>
      )}
      <div className="grid">
        {lines.map(l => {
          const selected = l.items.find(i => i.code === sizeSel[l.key]) || l.items[0];
          const cartQty = l.items.reduce((s, i) => s + cartQtyOf(i.code), 0);
          return (
            <div className="item" key={l.key} style={cartQty > 0 ? { border: "2px solid #1e9e6a" } : undefined}>
              <div className="pic">
                {selected.img
                  ? <img src={selected.img} alt={selected.name} style={{ width: 86, height: 86, objectFit: "contain", borderRadius: 8 }} />
                  : selected.pic}
              </div>
              <div className="nm">{selected.name}</div>
              <div className="xs mut">{selected.code} · {l.uom}</div>
              {l.items.length > 1 && (
                <>
                  <div className="xs mut" style={{ marginTop: 2 }}>{variantKind(l.items)}</div>
                  <div className="variants">
                    {l.items.map(i => (
                      <button key={i.code} type="button" title={`${i.name} · stock ${i.stock}`}
                        className={i.code === selected.code ? "on" : ""}
                        onClick={() => setSizeSel({ ...sizeSel, [l.key]: i.code })}>
                        {variantLabel(i)}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="row" style={{ gap: 6 }}>
                <span className="b" style={{ color: "#0f2a43" }}>AED {fmt(l.price)}</span>
                <span className="grow" />
                <Chip label={`Stock ${selected.stock}`} color={selected.stock > 0 ? "#1e9e6a" : "#d64545"} />
              </div>
              <div className="xs mut">
                Allocated {l.allocated} · Used {l.used} · <span className="b" style={{ color: l.balance > 0 ? "#1e9e6a" : "#d64545" }}>Bal {l.balance}</span>
              </div>
              {selected.stock <= 0 && <div className="xs" style={{ color: "#e8a213" }}>No Main-store stock — delivery date to be advised (DOD)</div>}
              {cartQty > 0 && <div className="sm b" style={{ color: "#1e9e6a" }}>✓ In cart: {cartQty}</div>}
              <div className="row" style={{ justifyContent: "center" }}>
                <button className="btn sm ghost" style={{ fontSize: "1.1rem", minWidth: 42 }} disabled={cartQtyOf(selected.code) === 0}
                  onClick={() => subtractOne(selected.code)}>−</button>
                <span className="b" style={{ minWidth: 42, textAlign: "center", fontSize: "1.1rem" }}>{cartQtyOf(selected.code)}</span>
                <button className={`btn sm ${cartQty > 0 ? "green" : "navy"}`} style={{ fontSize: "1.1rem", minWidth: 42 }}
                  onClick={() => addOne(l, selected.code)}>+</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
