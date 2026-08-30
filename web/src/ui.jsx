import React from "react";

export const fmt = n => Number(n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtDT = iso => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB") + " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};
export const fmtD = iso => (iso ? new Date(iso).toLocaleDateString("en-GB") : "—");

export const STATUS = {
  pending_approval:   { label: "Order Approval",       color: "#e8a213" },
  in_progress:        { label: "Order in Progress",    color: "#2f6fb2" },
  partially_delivered:{ label: "Partially Delivered",  color: "#6f52a2" },
  do_created:         { label: "DO Created — Receive", color: "#0f2a43" },
  partially_received: { label: "Partially Received",   color: "#f4791f" },
  complete:           { label: "Order Complete",       color: "#1e9e6a" },
  cancelled:          { label: "Cancelled",            color: "#d64545" },
  rejected:           { label: "Rejected",             color: "#d64545" }
};

/* Short label for a size/colour variant of one price-list line:
   "Hot Metal Trouser, …, Size - 30" → "30" · "Hart Hat, Green" → "Green" */
export function variantLabel(item) {
  const n = String(item?.name || "");
  const size = n.split(/Size\s*[-–]\s*/i);
  if (size.length > 1) return size.pop().trim();
  const parts = n.split(",");
  if (parts.length > 1) return parts.pop().trim();
  return item?.code || n;
}
/* "Size" when the variants differ by size, otherwise "Colour / option". */
export function variantKind(items = []) {
  return items.some(i => /Size\s*[-–]/i.test(String(i.name || ""))) ? "Size" : "Colour";
}

export function Chip({ label, color = "#6b7c8d" }) {
  return <span className="chip" style={{ background: color + "22", color }}>{label}</span>;
}
export function StatusChip({ status }) {
  const st = STATUS[status] || { label: status, color: "#6b7c8d" };
  return <Chip label={st.label} color={st.color} />;
}
export function StockChip({ stock }) {
  const yes = stock === "Yes" || stock === true || stock === "yes";
  const partial = stock === "partial";
  return <Chip label={partial ? "Partial" : yes ? "Yes" : "No"} color={partial ? "#e8a213" : yes ? "#1e9e6a" : "#d64545"} />;
}
export function Empty({ icon = "📭", text }) {
  return <div className="empty"><span className="big">{icon}</span>{text}</div>;
}
export function Modal({ children, onClose }) {
  return (
    <div className="modalwrap" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">{children}</div>
    </div>
  );
}
/* Shopping/cart header per SRS2 — Customer, Contract Ref, Price List validity,
   Total Allocated Amount, Total Used Amount (rolled from the price list). */
export function ShopHeader({ profile }) {
  if (!profile) return null;
  const pl = profile.priceList;
  return (
    <div className="card shophead">
      <div className="row">
        <span className="b" style={{ color: "#0f2a43" }}>{profile.customer?.name}</span>
        <Chip label={`Contract ${pl.contract}`} color="#0f2a43" />
        <Chip label={pl.name} color="#2f6fb2" />
        <span className="grow" />
        <span className="xs mut">Delivery period: <b>{pl.deliveryPeriod} day{pl.deliveryPeriod === 1 ? "" : "s"}</b></span>
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <span className="xs mut">Price List Validity: <b>{fmtD(pl.validFrom)} → {fmtD(pl.validTill)}</b>{!pl.validToday && <span style={{ color: "#d64545" }}> (not valid today)</span>}</span>
        <span className="grow" />
        <span className="sm" style={{ color: "#d64545" }}>Total Allocated Amount — <b>{fmt(profile.totals.allocatedAmount)}</b></span>
        <span className="sm" style={{ color: "#d64545" }}>Total Used Amount — <b>{fmt(profile.totals.usedAmount)}</b></span>
      </div>
    </div>
  );
}
