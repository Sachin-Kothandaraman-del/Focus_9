/**
 * Focus9 adapter — STUB (simulates the ERP inside the app database).
 * When Focus Softnet provides API docs, replace the marked TODOs with real
 * HTTP calls (keep the same signatures) — nothing else needs to change.
 *
 * SRS2 (25-08-26): Receipt Voucher process removed; Stock Transfer (Issue +
 * Receipt vouchers) and Credit Note added.
 */
const store = require("../store");

async function createSalesOrder(order) {
  // TODO(Focus9): POST `${process.env.FOCUS9_URL}/api/salesorder`
  const soRef = "SO" + (await store.nextSeq("so"));
  const lines = order.lines.filter(l => (l.approvedQty ?? l.qty) > 0)
    .map(l => ({ ...l, qty: l.approvedQty ?? l.qty, amount: +((l.approvedQty ?? l.qty) * l.price).toFixed(2) }));
  await store.addErpDoc("so", {
    ref: soRef, at: new Date().toISOString(), order: order.ref, emp: order.emp, empName: order.empName,
    customer: order.customer, customerName: order.customerName, contract: order.contract,
    fromStore: order.fromStore, toStore: order.toStore,
    lines, total: order.total, status: "Open"
  });
  await store.erpLog(`Focus9 [stub]: counter document ${soRef} created for order ${order.ref}`);
  return { soRef };
}

async function updateSalesOrderPlanning(order) {
  // TODO(Focus9): update SO line delivery dates/remarks in the live API.
  await store.updateErpDoc("so", order.so, {
    lines: order.lines.filter(l => (l.approvedQty ?? l.qty) > 0)
      .map(l => ({ ...l, qty: l.approvedQty ?? l.qty }))
  });
  await store.erpLog(`Focus9 [stub]: delivery planning updated for ${order.so}`);
  return { ok: true };
}

async function cancelSalesOrder(soRef) {
  // TODO(Focus9): cancellation endpoint
  await store.updateErpDoc("so", soRef, { status: "Cancelled" });
  await store.erpLog(`Focus9 [stub]: SO ${soRef} cancelled`);
  return { ok: true };
}

async function createDeliveryNote(order, delivery) {
  // TODO(Focus9): delivery note endpoint (issued from the Reservation store)
  await store.addErpDoc("dn", {
    ref: delivery.ref, at: delivery.at, order: order.ref, so: order.so, store: delivery.store,
    emp: order.emp, empName: order.empName, customer: order.customer, customerName: order.customerName,
    lines: delivery.lines.map(l => ({ ...l })), total: delivery.total, invoiced: false
  });
  await store.erpLog(`Focus9 [stub]: Delivery Note ${delivery.ref} against SO ${order.so} from store ${delivery.store}`);
  return { dnRef: delivery.ref };
}

async function createStockTransfer(stv) {
  // TODO(Focus9): stock transfer — Issue voucher (from) + Receipt voucher (to).
  // The app already mirrors the document (kind "stv") in its own database.
  await store.erpLog(`Focus9 [stub]: Stock Transfer ${stv.ref} (${stv.issueRef}/${stv.receiptRef}) ${stv.from} → ${stv.to}${stv.order ? ` for order ${stv.order}` : ""}`);
  return { stvRef: stv.ref };
}

async function postReturn(ret) {
  // TODO(Focus9): sales return endpoint
  await store.addErpDoc("ret", { ...ret, status: ret.status || "Posted" });
  await store.erpLog(`Focus9 [stub]: Return ${ret.ref} posted against SO ${ret.so}`);
  return { ok: true };
}

async function postCreditNote(cn) {
  // TODO(Focus9): credit note endpoint.
  // The app already mirrors the document (kind "cn") in its own database.
  await store.erpLog(`Focus9 [stub]: Credit Note ${cn.ref} (AED ${Number(cn.total).toFixed(2)}) issued against return ${cn.rma}`);
  return { ok: true };
}

async function postInvoice(inv) {
  // TODO(Focus9): invoice endpoint
  await store.addErpDoc("inv", { ...inv, status: "Issued to EGA" });
  await store.erpLog(`Focus9 [stub]: Invoice ${inv.ref} (AED ${inv.total.toFixed(2)}) issued to ${inv.customerName}, consolidating ${inv.dns.join(", ")}`);
  return { ok: true };
}

module.exports = {
  createSalesOrder, updateSalesOrderPlanning, cancelSalesOrder,
  createDeliveryNote, createStockTransfer, postReturn, postCreditNote, postInvoice
};
