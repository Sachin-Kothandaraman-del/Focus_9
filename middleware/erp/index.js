/**
 * ERP adapter selector. .env ERP_PROVIDER: focus9-stub (default) | erpnext
 * Adapter interface:
 *   createSalesOrder(order) → { soRef }
 *   cancelSalesOrder(soRef)
 *   createDeliveryNote(order, dnRef) → { dnRef }
 *   postReturn(ret)
 *   postInvoice(inv)
 */
const store = require("../store");

function adapter() {
  return (process.env.ERP_PROVIDER || "focus9-stub") === "erpnext"
    ? require("./erpnext")
    : require("./focus9");
}

/** One retry, never crash the order flow on ERP outage. */
async function safeCall(fn, ...args) {
  const a = adapter();
  try {
    return await a[fn](...args);
  } catch (e1) {
    try {
      return await a[fn](...args);
    } catch (e2) {
      await store.erpLog(`⚠ ERP call ${fn} failed after retry: ${e2.message}. Flagged for manual re-sync.`);
      return { error: e2.message };
    }
  }
}

module.exports = { safeCall };
