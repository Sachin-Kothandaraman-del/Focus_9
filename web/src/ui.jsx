import React from "react";

export const fmt = n => Number(n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtDT = iso => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB") + " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};

export const STATUS = {
  pending_approval:   { label: "Order Approval",       color: "#e8a213" },
  in_progress:        { label: "Order in Progress",    color: "#2f6fb2" },
  do_created:         { label: "DO Created — Receive", color: "#0f2a43" },
  partially_received: { label: "Partially Received",   color: "#f4791f" },
  complete:           { label: "Order Complete",       color: "#1e9e6a" },
  cancelled:          { label: "Cancelled",            color: "#d64545" },
  rejected:           { label: "Rejected",             color: "#d64545" }
};

export function Chip({ label, color = "#6b7c8d" }) {
  return <span className="chip" style={{ background: color + "22", color }}>{label}</span>;
}
export function StatusChip({ status }) {
  const st = STATUS[status] || { label: status, color: "#6b7c8d" };
  return <Chip label={st.label} color={st.color} />;
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
