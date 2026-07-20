export const C = {
  navy: "#0f2a43", navy2: "#16385a", orange: "#f4791f",
  bg: "#eef2f6", card: "#ffffff", ink: "#1c2b3a", mut: "#6b7c8d", line: "#e3e9ef",
  green: "#1e9e6a", red: "#d64545", amber: "#e8a213", blue: "#2f6fb2"
};

export const STATUS = {
  pending_approval:   { label: "Order Approval",       color: C.amber },
  in_progress:        { label: "Order in Progress",    color: C.blue },
  do_created:         { label: "DO Created — Receive", color: C.navy },
  partially_received: { label: "Partially Received",   color: C.orange },
  complete:           { label: "Order Complete",       color: C.green },
  cancelled:          { label: "Cancelled",            color: C.red },
  rejected:           { label: "Rejected",             color: C.red }
};
