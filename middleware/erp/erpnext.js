/**
 * ERPNext adapter — LIVE (standard ERPNext REST API, token auth).
 * Prerequisites on your ERPNext site:
 *   - API key/secret for an API user (Settings → My Settings → API Access)
 *   - Items with the same item_code values as this app's item master
 *   - Customers with the same names as the customer master
 * .env: ERP_PROVIDER=erpnext, ERPNEXT_URL, ERPNEXT_API_KEY, ERPNEXT_API_SECRET
 * ERP documents are also mirrored into the app database so the apps can
 * display them without extra ERPNext round-trips.
 */
const store = require("../store");

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
  const lines = order.lines.filter(l => (l.approvedQty ?? l.qty) > 0);
  const dated = lines.map(l => l.deliveryDate).filter(Boolean).sort();
  const data = await call("POST", "Sales Order", {
    customer: order.customerName,
    po_no: order.ref,
    delivery_date: dated[0] || new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10),
    items: lines.map(l => ({
      item_code: l.code, qty: l.approvedQty ?? l.qty, rate: l.price, uom: l.uom,
      delivery_date: l.deliveryDate || undefined,
      description: l.remark || undefined
    }))
  });
  await store.addErpDoc("so", {
    ref: data.name, at: new Date().toISOString(), order: order.ref, emp: order.emp, empName: order.empName,
    customer: order.customer, customerName: order.customerName, contract: order.contract,
    lines: lines.map(l => ({ ...l, qty: l.approvedQty ?? l.qty })), total: order.total, status: "Open"
  });
  await store.erpLog(`ERPNext: Sales Order ${data.name} created for app order ${order.ref}`);
  return { soRef: data.name };
}

async function updateSalesOrderPlanning(order) {
  const dated = order.lines.map(l => l.deliveryDate).filter(Boolean).sort();
  if (dated.length) {
    const url = `${process.env.ERPNEXT_URL}/api/resource/Sales%20Order/${encodeURIComponent(order.so)}`;
    const res = await fetch(url, {
      method: "PUT", headers: headers(), body: JSON.stringify({ delivery_date: dated[0] })
    });
    if (!res.ok) throw new Error(`ERPNext update Sales Order ${order.so} → HTTP ${res.status}`);
  }
  await store.updateErpDoc("so", order.so, {
    lines: order.lines.filter(l => (l.approvedQty ?? l.qty) > 0)
      .map(l => ({ ...l, qty: l.approvedQty ?? l.qty }))
  });
  await store.erpLog(`ERPNext: delivery planning updated for ${order.so}`);
  return { ok: true };
}

async function cancelSalesOrder(soRef) {
  const res = await fetch(`${process.env.ERPNEXT_URL}/api/method/frappe.client.cancel`, {
    method: "POST", headers: headers(),
    body: JSON.stringify({ doctype: "Sales Order", name: soRef })
  });
  if (!res.ok) throw new Error(`ERPNext cancel ${soRef} → HTTP ${res.status}`);
  await store.updateErpDoc("so", soRef, { status: "Cancelled" });
  await store.erpLog(`ERPNext: Sales Order ${soRef} cancelled`);
  return { ok: true };
}

async function createDeliveryNote(order, delivery) {
  const data = await call("POST", "Delivery Note", {
    customer: order.customerName,
    items: delivery.lines.map(l => ({
      item_code: l.code, qty: l.qty, rate: l.price, uom: l.uom,
      against_sales_order: order.so
    }))
  });
  await store.addErpDoc("dn", {
    ref: data.name, at: delivery.at, order: order.ref, so: order.so,
    emp: order.emp, empName: order.empName, customer: order.customer, customerName: order.customerName,
    lines: delivery.lines.map(l => ({ ...l })), total: delivery.total, invoiced: false
  });
  await store.erpLog(`ERPNext: Delivery Note ${data.name} created against SO ${order.so}`);
  return { dnRef: data.name };
}

async function createStockTransfer(stv) {
  // Maps to an ERPNext "Stock Entry" (Material Transfer) between warehouses.
  // Requires warehouses named after the app's store codes; adjust to your site.
  try {
    const data = await call("POST", "Stock Entry", {
      stock_entry_type: "Material Transfer",
      items: stv.lines.map(l => ({
        item_code: l.code, qty: l.qty,
        s_warehouse: stv.from, t_warehouse: stv.to
      }))
    });
    await store.erpLog(`ERPNext: Stock Entry ${data.name} (${stv.from} → ${stv.to}) for ${stv.order || "manual transfer"}`);
    return { stvRef: data.name };
  } catch (e) {
    await store.erpLog(`ERPNext: Stock Transfer ${stv.ref} mirrored locally only (${e.message})`);
    return { stvRef: stv.ref };
  }
}

async function postReturn(ret) {
  const data = await call("POST", "Delivery Note", {
    customer: ret.customerName, is_return: 1, ...(ret.dn ? { return_against: ret.dn } : {}),
    items: ret.lines.map(l => ({ item_code: l.code, qty: -l.qty, rate: l.price, uom: l.uom }))
  });
  await store.addErpDoc("ret", { ...ret, erpRef: data.name, status: ret.status || "Posted" });
  await store.erpLog(`ERPNext: Return ${data.name} posted for order ${ret.order}`);
  return { ok: true };
}

async function postCreditNote(cn) {
  try {
    const data = await call("POST", "Sales Invoice", {
      customer: cn.customerName, is_return: 1,
      items: cn.lines.map(l => ({ item_code: l.code, qty: -l.qty, rate: l.price, uom: l.uom }))
    });
    await store.erpLog(`ERPNext: Credit Note ${data.name} issued against return ${cn.rma}`);
    return { cnRef: data.name };
  } catch (e) {
    await store.erpLog(`ERPNext: Credit Note ${cn.ref} mirrored locally only (${e.message})`);
    return { cnRef: cn.ref };
  }
}

async function postInvoice(inv) {
  const data = await call("POST", "Sales Invoice", {
    customer: inv.customerName,
    items: inv.lines.map(l => ({ item_code: l.code, qty: l.qty, rate: l.price, uom: l.uom }))
  });
  await store.addErpDoc("inv", { ...inv, erpRef: data.name, status: "Issued to EGA" });
  await store.erpLog(`ERPNext: Sales Invoice ${data.name} issued to ${inv.customerName}`);
  return { ok: true };
}

module.exports = {
  createSalesOrder, updateSalesOrderPlanning, cancelSalesOrder,
  createDeliveryNote, createStockTransfer, postReturn, postCreditNote, postInvoice
};
