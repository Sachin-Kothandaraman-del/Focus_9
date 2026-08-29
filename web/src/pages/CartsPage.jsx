import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../App.jsx";
import { api } from "../api";
import { Chip, StockChip, Empty, Modal, ShopHeader, fmt, fmtD } from "../ui.jsx";

/* My Carts (SRS2): Order Cart + Approval Cart, header carried over from the
   shopping screen, stock/delivery-date preview per delivery-period rules,
   10-minute countdown, Proceed → Order Screen → Place the Order. */
export default function CartsPage() {
  const { user, catalog, cart, remainingSec, removeCartLine, refreshCart, refreshCatalog } = useApp();
  const [review, setReview] = useState(null);         // "order" | "approval"
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const total = lines => lines.reduce((s, x) => s + x.amount, 0);
  const plIdOf = lines => lines[0]?.plId;
  const profileOf = plId => catalog?.profiles.find(p => p.priceList.id === plId) || catalog?.profiles[0];

  async function place(kind) {
    setBusy(true);
    try {
      const o = await api("/api/orders", { method: "POST", body: { kind } });
      await refreshCart();
      await refreshCatalog();
      setReview(null);
      alert(kind === "order"
        ? `Order ${o.ref} placed — moved to Orders in Progress.${o.so ? `\nERP Sales Order ${o.so} created.` : ""}\nReserved quantities were stock-transferred to the Reservation store.`
        : `Order ${o.ref} sent to the Order Approval bucket.\nEGA has ${3} days to approve, otherwise it is cancelled automatically.`);
      nav("/orders");
    } catch (e) {
      alert("Could not place order: " + e.message);
      await refreshCart(); await refreshCatalog();
    } finally {
      setBusy(false);
    }
  }

  const clock = remainingSec != null && (cart.order.length + cart.approval.length) > 0 && (
    <div className="card row" style={{ background: remainingSec < 120 ? "#fdecec" : "#fff8ec" }}>
      <span style={{ fontSize: "1.2rem" }}>⏱</span>
      <span className="sm">
        <b>{String(Math.floor(remainingSec / 60)).padStart(2, "0")}:{String(remainingSec % 60).padStart(2, "0")}</b> left to place the order —
        after 10 minutes the cart is emptied and the picked quantities are released back to the Main store.
      </span>
    </div>
  );

  const Section = ({ kind, lines, title, chip, color }) => (
    <>
      <h2>{title} <Chip label={chip} color={color} /></h2>
      <div className="card">
        {lines.length === 0 ? <div className="mut sm" style={{ textAlign: "center", padding: 10 }}>Empty</div> : (
          <>
            <table>
              <thead><tr><th>Item</th><th className="num">Qty</th><th>Stock</th><th>Delivery date</th><th className="num">Unit Price</th><th className="num">Amount</th><th /></tr></thead>
              <tbody>
                {lines.map(x => (
                  <tr key={x.id}>
                    <td>{x.pic} <span className="b">{x.name}</span><br /><span className="xs mut">{x.code} · {x.uom}</span></td>
                    <td className="num">{x.qty}</td>
                    <td>
                      <StockChip stock={x.stockStatus} />
                      {x.stockStatus === "partial" && <div className="xs mut">{x.reservedQty} reserved · {x.dodQty} DOD</div>}
                    </td>
                    <td className="sm">
                      {x.reservedQty > 0 ? fmtD(x.deliveryDate) : "DOD to be advised"}
                      {x.stockStatus === "partial" && <div className="xs mut">+ DOD line for {x.dodQty}</div>}
                    </td>
                    <td className="num">{fmt(x.price)}</td>
                    <td className="num b">{fmt(x.amount)}</td>
                    <td><button className="btn sm red" onClick={() => removeCartLine(x.id)}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row" style={{ marginTop: 12 }}>
              <span className="grow b">Total: AED {fmt(total(lines))}</span>
              <button className={`btn ${kind === "approval" ? "navy" : ""}`} onClick={() => setReview(kind)}>Proceed to Order Screen</button>
            </div>
          </>
        )}
      </div>
    </>
  );

  const reviewLines = review === "order" ? cart.order : cart.approval;
  const reviewProfile = review ? profileOf(plIdOf(reviewLines)) : null;

  /* Order Screen preview rows — split partial-stock picks the same way the
     server will (stocked line with delivery date + DOD line). */
  const previewRows = [];
  for (const x of reviewLines) {
    if (x.reservedQty >= x.qty) previewRows.push({ ...x, qty: x.qty, stock: "Yes", date: x.deliveryDate, remark: "" });
    else if (x.reservedQty <= 0) previewRows.push({ ...x, qty: x.qty, stock: "No", date: null, remark: "DOD to be advised" });
    else {
      previewRows.push({ ...x, qty: x.reservedQty, stock: "Yes", date: x.deliveryDate, remark: "", id: x.id + "a" });
      previewRows.push({ ...x, qty: x.dodQty, stock: "No", date: null, remark: "DOD to be advised", id: x.id + "b", amount: +(x.dodQty * x.price).toFixed(2) });
    }
  }

  return (
    <>
      <h1>My Carts</h1>
      {clock}
      {profileOf(plIdOf(cart.order.length ? cart.order : cart.approval)) && (cart.order.length + cart.approval.length > 0) &&
        <ShopHeader profile={profileOf(plIdOf(cart.order.length ? cart.order : cart.approval))} />}
      <Section kind="order" lines={cart.order} title="🧺 Order Cart" chip="within limits" color="#1e9e6a" />
      <Section kind="approval" lines={cart.approval} title="📨 Approval Cart" chip="needs client approval" color="#e8a213" />
      {cart.order.length === 0 && cart.approval.length === 0 && <Empty icon="🧺" text="Both carts are empty — add items from the Shop." />}

      {review && (
        <Modal onClose={() => setReview(null)}>
          <h1>Order Screen {review === "approval" && <Chip label="FOR APPROVAL" color="#e8a213" />}</h1>
          <div className="card">
            <div className="sm">Contract Ref: <span className="b">{reviewProfile?.priceList.contract}</span> · Price List: <span className="b">{reviewProfile?.priceList.name}</span></div>
            <div className="sm">Employee: <span className="b">{user.empId} — {user.name}</span> · Department: <span className="b">{user.dept || "—"}</span> · Location: <span className="b">{user.location || "—"}</span></div>
            <div className="sm">Customer: <span className="b">{reviewProfile?.customer?.name}</span> · From Store: <span className="b">{cart.fromStore}</span> · To Store: <span className="b">{cart.toStore}</span></div>
            <div className="xs mut">Doc Ref and line numbers (OR…/001, /002…) are assigned by the system on placing. Delivery dates follow the {reviewProfile?.priceList.deliveryPeriod}-day delivery period rule.</div>
          </div>
          <div className="card">
            <table>
              <thead><tr><th>#</th><th>Item</th><th className="num">Qty</th><th className="num">Unit Price</th><th className="num">Amount</th><th>Stock</th><th>Delivery date</th><th>Remarks</th></tr></thead>
              <tbody>
                {previewRows.map((x, ix) => (
                  <tr key={x.id}>
                    <td>{ix + 1}</td><td>{x.name}<br /><span className="xs mut">{x.code}</span></td>
                    <td className="num">{x.qty} {x.uom}</td>
                    <td className="num">{fmt(x.price)}</td>
                    <td className="num">{fmt(x.qty * x.price)}</td>
                    <td><StockChip stock={x.stock} /></td>
                    <td className="sm">{x.date ? fmtD(x.date) : "—"}</td>
                    <td className="xs">{x.remark || "—"}</td>
                  </tr>
                ))}
                <tr><td colSpan={4} className="num b">Total Amount</td><td className="num b">AED {fmt(total(reviewLines))}</td><td colSpan={3} /></tr>
              </tbody>
            </table>
          </div>
          <div className="row">
            <button className="btn ghost" onClick={() => setReview(null)}>Back</button>
            <span className="grow" />
            <button className={`btn ${review === "approval" ? "navy" : ""}`} disabled={busy} onClick={() => place(review)}>
              {busy ? "Placing…" : review === "approval" ? "📨 Place the Order (send for approval)" : "🛒 Place the Order"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
