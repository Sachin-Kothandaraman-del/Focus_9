import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../App.jsx";
import { api } from "../api";
import { Chip, Empty, Modal, fmt } from "../ui.jsx";

export default function CartsPage() {
  const { user, catalog, orderCart, approvalCart, removeFromCart, clearCart, refreshCatalog } = useApp();
  const [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const lineOf = code => catalog?.lines.find(l => l.code === code);
  const total = cart => cart.reduce((s, x) => s + x.qty * (lineOf(x.code)?.price || 0), 0);

  async function place(kind) {
    const cart = kind === "order" ? orderCart : approvalCart;
    setBusy(true);
    try {
      const o = await api("/api/orders", {
        method: "POST",
        body: { kind, lines: cart.map(x => ({ code: x.code, qty: x.qty })), contract: catalog.priceList.contract }
      });
      clearCart(kind);
      await refreshCatalog();
      setReview(null);
      alert(kind === "order"
        ? `Order ${o.ref} placed — moved to Order in Progress.${o.so ? `\nERP Sales Order ${o.so} created.` : ""}`
        : `Order ${o.ref} sent to the Order Approval bucket.`);
      nav("/orders");
    } catch (e) {
      alert("Could not place order: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  const Section = ({ kind, cart, title, chip, color }) => (
    <>
      <h2>{title} <Chip label={chip} color={color} /></h2>
      <div className="card">
        {cart.length === 0 ? <div className="mut sm" style={{ textAlign: "center", padding: 10 }}>Empty</div> : (
          <>
            <table>
              <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Unit Price</th><th className="num">Amount</th><th /></tr></thead>
              <tbody>
                {cart.map(x => {
                  const l = lineOf(x.code);
                  if (!l) return null;
                  return (
                    <tr key={x.code}>
                      <td>{l.item.pic} <span className="b">{l.item.name}</span><br /><span className="xs mut">{x.code} · {l.item.uom}</span></td>
                      <td className="num">{x.qty}</td>
                      <td className="num">{fmt(l.price)}</td>
                      <td className="num b">{fmt(x.qty * l.price)}</td>
                      <td><button className="btn sm red" onClick={() => removeFromCart(kind, x.code)}>✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="row" style={{ marginTop: 12 }}>
              <span className="grow b">Total: AED {fmt(total(cart))}</span>
              <button className={`btn ${kind === "approval" ? "navy" : ""}`} onClick={() => setReview(kind)}>Proceed to Order Screen</button>
            </div>
          </>
        )}
      </div>
    </>
  );

  const reviewCart = review === "order" ? orderCart : approvalCart;

  return (
    <>
      <h1>My Carts</h1>
      <Section kind="order" cart={orderCart} title="🧺 Order Cart" chip="within limits" color="#1e9e6a" />
      <Section kind="approval" cart={approvalCart} title="📨 Approval Cart" chip="needs client approval" color="#e8a213" />
      {orderCart.length === 0 && approvalCart.length === 0 && <Empty icon="🧺" text="Both carts are empty — add items from the Shop." />}

      {review && (
        <Modal onClose={() => setReview(null)}>
          <h1>Order Screen {review === "approval" && <Chip label="FOR APPROVAL" color="#e8a213" />}</h1>
          <div className="card">
            <div className="sm">Contract Ref: <span className="b">{catalog.priceList.contract}</span></div>
            <div className="sm">Employee: <span className="b">{user.empId} — {user.name}</span></div>
            <div className="sm">Department: <span className="b">{user.dept}</span></div>
            <div className="xs mut">Doc Ref and line numbers are assigned by the system on placing.</div>
          </div>
          <div className="card">
            <table>
              <thead><tr><th>#</th><th>Item</th><th className="num">Qty</th><th className="num">Unit Price</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {reviewCart.map((x, ix) => {
                  const l = lineOf(x.code);
                  return (
                    <tr key={x.code}>
                      <td>{ix + 1}</td><td>{l.item.name}</td>
                      <td className="num">{x.qty} {l.item.uom}</td>
                      <td className="num">{fmt(l.price)}</td>
                      <td className="num">{fmt(x.qty * l.price)}</td>
                    </tr>
                  );
                })}
                <tr><td colSpan={4} className="num b">Total Amount</td><td className="num b">AED {fmt(total(reviewCart))}</td></tr>
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
