/**
 * Focus9 adapter — STUB (simulates the ERP inside the app database).
 * When Focus Softnet provides API docs, replace the marked TODOs with real
 * HTTP calls (keep the same signatures) — nothing else needs to change.
 */
const store = require("../store");

async function createSalesOrder(order) {
  // TODO(Focus9): POST `${process.env.FOCUS9_URL}/api/salesorder`
  const soRef = "SO" + (await store.nextSeq("so"));
  await store.addErpDoc("so", {
    ref: soRef, at: new Date().toISOString(), order: order.ref, emp: order.emp, empName: order.empName,
    customer: order.customer, customerName: order.customerName, contract: order.contract,
    lines: order.lines.map(l => ({ ...l })), total: order.total, status: "Open"
  });
  await store.erpLog(`Focus9 [stub]: counter document ${soRef} created for order ${order.ref}`);
  return { soRef };
}

async function cancelSalesOrder(soRef) {
  // TODO(Focus9): cancellation endpoint
  await store.updateErpDoc("so", soRef, { status: "Cancelled" });
  await store.erpLog(`Focus9 [stub]: SO ${soRef} cancelled`);
  return { ok: true };
}

async function createDeliveryNote(order, dnRef) {
  // TODO(Focus9): delivery note endpoint
  await store.addErpDoc("dn", {
    ref: dnRef, at: new Date().toISOString(), order: order.ref, so: order.so,
    emp: order.emp, empName: order.empName, customer: order.customer, customerName: order.customerName,
    lines: order.lines.map(l => ({ ...l })), total: order.total, invoiced: false
  });
  await store.erpLog(`Focus9 [stub]: Delivery Note ${dnRef} against SO ${order.so}`);
  return { dnRef };
}

async function postReturn(ret) {
  // TODO(Focus9): sales return endpoint
  await store.addErpDoc("ret", { ...ret, status: "Posted" });
  await store.erpLog(`Focus9 [stub]: Return ${ret.ref} posted against SO ${ret.so}`);
  return { ok: true };
}

async function postInvoice(inv) {
  // TODO(Focus9): invoice endpoint
  await store.addErpDoc("inv", { ...inv, status: "Issued to EGA" });
  await store.erpLog(`Focus9 [stub]: Invoice ${inv.ref} (AED ${inv.total.toFixed(2)}) issued to ${inv.customerName}, consolidating ${inv.dns.join(", ")}`);
  return { ok: true };
}

module.exports = { createSalesOrder, cancelSalesOrder, createDeliveryNote, postReturn, postInvoice };
