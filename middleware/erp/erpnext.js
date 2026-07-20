/**
 * ERPNext adapter — LIVE.
 * Talks to ERPNext's standard REST API using token auth.
 * Prerequisites on the ERPNext site:
 *   - An API user with API key/secret (Settings → My Settings → API Access)
 *   - Items created with the same item_code values as this app's item master
 *   - Customers created with the same names as the customer master
 * Set in .env: ERP_PROVIDER=erpnext, ERPNEXT_URL, ERPNEXT_API_KEY, ERPNEXT_API_SECRET
 */
const db = require("../db");

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `token ${process.env.ERPNEXT_API_KEY}:${process.env.ERPNEXT_API_SECRET}`
  };
}
async function call(method, resource, body) {
  const url = `${process.env.ERPNEXT_URL}/api/resource/${encodeURIComponent(resource)}`;
  const res = await fetch(url, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`ERPNext ${method} ${resource} → HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).data;
}

async function createSalesOrder(order) {
  const customer = db.cust(order.customer).name;
  const data = await call("POST", "Sales Order", {
    customer,
    po_no: order.ref,                       // app order ref stored on the SO
    delivery_date: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10),
    items: order.lines.map(l => ({
      item_code: l.code, qty: l.qty, rate: l.price, uom: l.uom
    }))
  });
  db.erpLog(`ERPNext: Sales Order ${data.name} created for app order ${order.ref}`);
  return { soRef: data.name };
}

async function cancelSalesOrder(soRef) {
  const url = `${process.env.ERPNEXT_URL}/api/method/frappe.client.cancel`;
  const res = await fetch(url, {
    method: "POST", headers: headers(),
    body: JSON.stringify({ doctype: "Sales Order", name: soRef })
  });
  if (!res.ok) throw new Error(`ERPNext cancel ${soRef} → HTTP ${res.status}`);
  db.erpLog(`ERPNext: Sales Order ${soRef} cancelled`);
  return { ok: true };
}

async function createDeliveryNote(order, dnRef) {
  const customer = db.cust(order.customer).name;
  const data = await call("POST", "Delivery Note", {
    customer,
    items: order.lines.map(l => ({
      item_code: l.code, qty: l.qty, rate: l.price, uom: l.uom, against_sales_order: order.so
    }))
  });
  db.erpLog(`ERPNext: Delivery Note ${data.name} created against SO ${order.so}`);
  return { dnRef: data.name };
}

async function postReturn(ret) {
  const order = db.load().orders.find(o => o.ref === ret.order);
  const customer = db.cust(order.customer).name;
  const data = await call("POST", "Delivery Note", {
    customer, is_return: 1, return_against: order.dns[0],
    items: ret.lines.map(l => ({ item_code: l.code, qty: -l.qty, rate: l.price, uom: l.uom }))
  });
  db.erpLog(`ERPNext: Return ${data.name} posted for order ${ret.order}`);
  return { ok: true };
}

async function postInvoice(inv) {
  const customer = db.cust(inv.customer).name;
  const lines = inv.lines || [];
  const data = await call("POST", "Sales Invoice", {
    customer,
    items: lines.map(l => ({ item_code: l.code, qty: l.qty, rate: l.price, uom: l.uom }))
  });
  db.erpLog(`ERPNext: Sales Invoice ${data.name} issued to ${customer}`);
  return { ok: true };
}

module.exports = { createSalesOrder, cancelSalesOrder, createDeliveryNote, postReturn, postInvoice };
