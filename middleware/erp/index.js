/**
 * ERP adapter selector. Set ERP_PROVIDER in .env:
 *   focus9-stub  → simulated Focus9 (default; activate real calls when API docs arrive)
 *   erpnext      → live ERPNext REST adapter
 * Every adapter implements:
 *   createSalesOrder(order) → { soRef }
 *   cancelSalesOrder(soRef)
 *   createDeliveryNote(order, dnRef)
 *   postReturn(ret)
 *   postInvoice(inv)
 */
const focus9 = require("./focus9");
const erpnext = require("./erpnext");

function adapter() {
  return (process.env.ERP_PROVIDER || "focus9-stub") === "erpnext" ? erpnext : focus9;
}

/** Wrap ERP calls: one retry, never crash the order flow on ERP outage. */
async function safeCall(fn, ...args) {
  const a = adapter();
  try {
    return await a[fn](...args);
  } catch (e1) {
    try {
      return await a[fn](...args); // retry once
    } catch (e2) {
      const db = require("../db");
      db.erpLog(`⚠ ERP call ${fn} failed after retry: ${e2.message}. Queued for manual re-sync.`);
      return { error: e2.message };
    }
  }
}

module.exports = { safeCall, adapter };
