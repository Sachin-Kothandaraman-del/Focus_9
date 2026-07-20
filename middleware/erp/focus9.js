/**
 * Focus9 adapter — STUB.
 * Focus Softnet has not yet published public API docs; once you receive them,
 * replace the marked sections with real HTTP calls (keep the same signatures).
 * Until then this adapter simulates the ERP inside the middleware database so
 * the whole app works end to end.
 */
const db = require("../db");

async function createSalesOrder(order) {
  // TODO(Focus9): POST `${process.env.FOCUS9_URL}/api/salesorder` with auth header
  const soRef = db.nextSeq("so", "SO");
  db.load().erp.so.unshift({
    ref: soRef, at: new Date().toISOString(), order: order.ref, emp: order.emp,
    customer: order.customer, contract: order.contract,
    lines: order.lines.map(l => ({ ...l })), total: order.total, status: "Open"
  });
  db.erpLog(`Focus9 [stub]: counter document ${soRef} created for order ${order.ref}`);
  return { soRef };
}

async function cancelSalesOrder(soRef) {
  // TODO(Focus9): cancellation endpoint
  const so = db.load().erp.so.find(s => s.ref === soRef);
  if (so) so.status = "Cancelled";
  db.erpLog(`Focus9 [stub]: SO ${soRef} cancelled`);
  return { ok: true };
}

async function createDeliveryNote(order, dnRef) {
  // TODO(Focus9): delivery note endpoint
  db.load().erp.dn.unshift({
    ref: dnRef, at: new Date().toISOString(), order: order.ref, so: order.so,
    emp: order.emp, customer: order.customer,
    lines: order.lines.map(l => ({ ...l })), total: order.total, invoiced: false
  });
  db.erpLog(`Focus9 [stub]: Delivery Note ${dnRef} against SO ${order.so}`);
  return { dnRef };
}

async function postReturn(ret) {
  // TODO(Focus9): sales return endpoint
  db.load().erp.ret.unshift({ ...ret, status: "Posted" });
  db.erpLog(`Focus9 [stub]: Return ${ret.ref} posted against SO ${ret.so}`);
  return { ok: true };
}

async function postInvoice(inv) {
  // TODO(Focus9): invoice endpoint
  db.load().erp.inv.unshift({ ...inv, status: "Issued to EGA" });
  db.erpLog(`Focus9 [stub]: Invoice ${inv.ref} (AED ${inv.total.toFixed(2)}) issued, consolidating ${inv.dns.join(", ")}`);
  return { ok: true };
}

module.exports = { createSalesOrder, cancelSalesOrder, createDeliveryNote, postReturn, postInvoice };
