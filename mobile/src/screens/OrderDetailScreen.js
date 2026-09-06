import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, TextInput, Alert, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api";
import { useStore } from "../store";
import { Card, Btn, Chip, StatusChip, KV, fmt, fmtDT, Loading } from "../components";
import { C } from "../theme";

/* Order detail (SRS2): full column set (ordered/approved/delivered/awaiting/
   not delivered/stock/delivery date), DO acknowledgement (Receipt Voucher
   process removed), returns within 3 days with store confirmation, Re-save
   and balance cancellation for Stores. */
export default function OrderDetailScreen({ route, navigation }) {
  const { user, refreshCatalog, refreshCart } = useStore();
  const { ref } = route.params;
  const [o, setO] = useState(null);
  const [mode, setMode] = useState(null); // null | "deliver" | "return"
  const [vals, setVals] = useState({});
  const [remarks, setRemarks] = useState({});
  const [selectedDN, setSelectedDN] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadOrder = useCallback(async () => {
    try { setO(await api(`/api/orders/${ref}`)); } catch (e) { Alert.alert("Error", e.message); }
  }, [ref]);
  useFocusEffect(useCallback(() => { loadOrder(); }, [loadOrder]));

  if (!o) return <Loading />;

  const mine = user.role === "employee" && o.emp === user.id;
  /* Store Module actions belong to the store role only (SRS2 module split). */
  const isAdmin = user.role === "store";
  const canCancel = mine && o.status === "in_progress";
  const canReturn = mine && ["complete", "partially_received"].includes(o.status);
  const returnable = l => Math.max(0, (l.received || 0) - (l.returned || 0));
  const deliverable = l => Math.min(Math.max(0, (l.approvedQty ?? l.qty) - (l.delivered || 0)), l.reservedQty || 0);
  const canDN = isAdmin && ["in_progress", "partially_delivered", "partially_received"].includes(o.status) &&
    o.lines.some(l => deliverable(l) > 0);
  const canDecide = user.role === "approver" && o.status === "pending_approval";

  async function act(path, body, okMsg) {
    setBusy(true);
    try {
      const r = await api(`/api/orders/${ref}/${path}`, { method: "POST", body });
      await loadOrder();
      if (mine) { await refreshCatalog(); await refreshCart(); }
      setMode(null); setVals({}); setRemarks({});
      if (okMsg) Alert.alert("Done", okMsg);
      return r;
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setBusy(false);
    }
  }

  function submitReturn() {
    const lines = o.lines
      .map(l => ({ lineRef: l.lineRef, qty: Number(vals[l.lineRef]) || 0, remark: remarks[l.lineRef] || "" }))
      .filter(l => l.qty > 0);
    if (!lines.length) return Alert.alert("Return", "Enter a return quantity first.");
    act("return", { lines }, "Return submitted — PROSAFE Stores will confirm receipt of the returned items.");
  }
  function submitApprove() {
    const lines = o.lines.map(l => ({ lineRef: l.lineRef, approvedQty: Number(vals[l.lineRef] ?? l.orderedQty) || 0 }));
    act("approve", { lines }, "Approved — Sales Order created; unapproved qtys were credited back.");
  }
  function submitDN() {
    const lines = o.lines
      .map(l => ({ lineRef: l.lineRef, qty: Number(vals[l.lineRef]) || 0 }))
      .filter(l => l.qty > 0);
    if (!lines.length) return Alert.alert("Delivery Note", "Enter a delivery quantity first.");
    act("delivery-note", { lines }, "Delivery Note created from the Reservation store.");
  }
  async function acknowledgeDN(d) {
    const lines = d.lines
      .map(l => ({ lineRef: l.lineRef, qty: Number(vals[l.lineRef] ?? (l.qty - (l.received || 0))) || 0 }))
      .filter(l => l.qty > 0);
    if (!lines.length) return Alert.alert("Acknowledge", "Nothing left to acknowledge on this DO.");
    setBusy(true);
    try {
      await api(`/api/orders/${ref}/deliveries/${d.ref}/receive`, { method: "POST", body: { lines } });
      await loadOrder(); setSelectedDN(null); setVals({});
      Alert.alert("Received", "Delivery acknowledged. Returns are possible within 3 days of receipt.");
    } catch (e) { Alert.alert("Error", e.message); } finally { setBusy(false); }
  }
  async function resave() {
    setBusy(true);
    try {
      const r = await api(`/api/orders/${ref}/resave`, { method: "POST" });
      await loadOrder();
      Alert.alert("Re-saved", r.updated.length
        ? "Stock secured & delivery dates updated:\n" + r.updated.join("\n")
        : "No DOD line could be filled yet — Main-store stock still insufficient.");
    } catch (e) { Alert.alert("Error", e.message); } finally { setBusy(false); }
  }
  async function confirmReturn(rt) {
    Alert.alert("Return Confirmation", `Confirm receipt of returned items on ${rt}? Credits the price list & Main store and raises a Credit Note.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Confirm", onPress: async () => {
        setBusy(true);
        try { await api(`/api/orders/${ref}/returns/${rt}/confirm`, { method: "POST" }); await loadOrder(); }
        catch (e) { Alert.alert("Error", e.message); } finally { setBusy(false); }
      } }
    ]);
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <Text style={{ fontSize: 18, fontWeight: "800", color: C.navy }}>{o.ref}</Text>
        <StatusChip status={o.status} />
      </View>
      <Card>
        <KV k="Date" v={fmtDT(o.createdAt)} />
        <KV k="Contract Ref" v={o.contract} />
        <KV k="Employee" v={`${o.empId} ${o.empName}`} />
        <KV k="Dept / Location" v={`${o.dept || "—"} / ${o.location || "—"}`} />
        <KV k="Customer" v={o.customerName} />
        <KV k="From → To Store" v={`${o.fromStore} → ${o.toStore}`} />
        {o.so ? <KV k="ERP SO" v={o.so} /> : null}
        {o.dns?.length ? <KV k="Delivery Notes" v={o.dns.join(", ")} /> : null}
        {o.status === "pending_approval" && o.approvalDeadline ? <KV k="Approval deadline" v={fmtDT(o.approvalDeadline)} /> : null}
      </Card>

      {o.lines.map(l => (
        <Card key={l.lineRef}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={{ fontWeight: "800", fontSize: 13, flex: 1 }}>{l.name || l.code}</Text>
            <Chip label={`Stock ${l.stock}`} color={l.stock === "Yes" ? C.green : C.red} />
          </View>
          <Text style={{ color: C.mut, fontSize: 10, marginBottom: 4 }}>{l.lineRef} · {l.code} · {l.uom} · AED {fmt(l.price)}</Text>
          <View style={s.grid}>
            <Text style={s.cell}>Ordered <Text style={s.b}>{l.orderedQty}</Text></Text>
            <Text style={s.cell}>Approved <Text style={s.b}>{l.approvedQty}</Text></Text>
            <Text style={s.cell}>Delivered <Text style={s.b}>{l.received || 0}</Text></Text>
            <Text style={s.cell}>Awaiting <Text style={s.b}>{l.awaitingReceipt}</Text></Text>
            <Text style={s.cell}>Not delivered <Text style={s.b}>{l.notDelivered}</Text></Text>
            <Text style={s.cell}>Amount <Text style={s.b}>{fmt(l.amount)}</Text></Text>
          </View>
          <Text style={{ fontSize: 11, color: l.deliveryDate ? C.ink : C.amber, marginTop: 3 }}>
            {l.deliveryDate ? `Delivery date: ${l.deliveryDate}` : (l.remark || "DOD to be advised")}
            {l.returned > 0 ? `  ·  Returned: ${l.returned}` : ""}
          </Text>
          {mode === "return" && returnable(l) > 0 && (
            <View style={{ flexDirection: "row", gap: 6, marginTop: 6, alignItems: "center" }}>
              <TextInput style={s.inp} keyboardType="number-pad" placeholder={`Return ≤ ${returnable(l)}`}
                value={String(vals[l.lineRef] ?? "")}
                onChangeText={v => setVals({ ...vals, [l.lineRef]: v.replace(/[^0-9]/g, "") })} />
              <TextInput style={[s.inp, { flex: 1 }]} placeholder="Reason"
                value={remarks[l.lineRef] ?? ""}
                onChangeText={v => setRemarks({ ...remarks, [l.lineRef]: v })} />
            </View>
          )}
          {mode === "deliver" && deliverable(l) > 0 && (
            <TextInput style={[s.inp, { marginTop: 6 }]} keyboardType="number-pad"
              placeholder={`Deliver now ≤ ${deliverable(l)} (reserved)`}
              value={String(vals[l.lineRef] ?? "")}
              onChangeText={v => setVals({ ...vals, [l.lineRef]: v.replace(/[^0-9]/g, "") })} />
          )}
          {mode === "approve" && (
            <TextInput style={[s.inp, { marginTop: 6 }]} keyboardType="number-pad"
              placeholder={`Approve ≤ ${l.orderedQty}`}
              value={String(vals[l.lineRef] ?? l.orderedQty)}
              onChangeText={v => setVals({ ...vals, [l.lineRef]: v.replace(/[^0-9]/g, "") })} />
          )}
        </Card>
      ))}
      <Card>
        <View style={{ flexDirection: "row" }}>
          <Text style={{ flex: 1, fontWeight: "800" }}>Total Amount</Text>
          <Text style={{ fontWeight: "800", color: C.navy }}>AED {fmt(o.total)}</Text>
        </View>
      </Card>

      {(o.returns || []).length > 0 && (
        <>
          <Text style={s.sec}>Returns (RMA)</Text>
          {o.returns.map(r => (
            <Card key={r.ref}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <Text style={{ fontWeight: "800" }}>{r.ref}</Text>
                <Chip label={r.status === "pending" ? "Awaiting Return Confirmation" : "Confirmed"} color={r.status === "pending" ? C.amber : C.green} />
              </View>
              <Text style={{ fontSize: 11, color: C.mut, marginTop: 3 }}>
                {r.lines.map(l => `${l.code}: ${l.qty}${l.remark ? ` (${l.remark})` : ""}`).join(" · ")} — AED {fmt(r.total)}
              </Text>
              {isAdmin && r.status === "pending" &&
                <Btn small title="✅ Return Confirmation" color={C.green} style={{ marginTop: 8, alignSelf: "flex-start" }} onPress={() => confirmReturn(r.ref)} />}
            </Card>
          ))}
        </>
      )}

      {(o.deliveries || []).length > 0 && (
        <>
          <Text style={s.sec}>Delivery Notes (from {o.toStore})</Text>
          {o.deliveries.map(d => (
            <Card key={d.ref}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <Text style={{ fontWeight: "800" }}>{d.ref}</Text>
                <Chip label={d.status || "awaiting_receipt"} color={d.status === "received" ? C.green : C.amber} />
                <Text style={{ marginLeft: "auto", fontSize: 10, color: C.mut }}>{fmtDT(d.at)}</Text>
              </View>
              {d.lines.map(l => {
                const remaining = l.qty - (l.received || 0);
                return (
                  <View key={l.lineRef} style={{ flexDirection: "row", alignItems: "center", marginTop: 5, gap: 6 }}>
                    <Text style={{ flex: 1, fontSize: 12 }}>{l.code} — DO {l.qty}, acknowledged {l.received || 0}</Text>
                    {mine && selectedDN === d.ref && remaining > 0 && (
                      <TextInput style={s.inp} keyboardType="number-pad"
                        placeholder={`≤ ${remaining}`}
                        value={String(vals[l.lineRef] ?? remaining)}
                        onChangeText={v => setVals({ ...vals, [l.lineRef]: v.replace(/[^0-9]/g, "") })} />
                    )}
                  </View>
                );
              })}
              {mine && d.lines.some(l => l.qty > (l.received || 0)) && (
                selectedDN === d.ref
                  ? <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                      <Btn small title="Cancel" color="#8195a8" onPress={() => { setSelectedDN(null); setVals({}); }} />
                      <Btn small title={busy ? "…" : "Acknowledge Delivered Items"} color={C.green} disabled={busy} onPress={() => acknowledgeDN(d)} />
                    </View>
                  : <Btn small title="Acknowledge receipt" color={C.green} style={{ marginTop: 8, alignSelf: "flex-start" }}
                      onPress={() => { setSelectedDN(d.ref); setVals({}); }} />
              )}
            </Card>
          ))}
        </>
      )}

      {/* actions */}
      {mode
        ? <>
            <Btn title={busy ? "…" : mode === "return" ? "↩ Submit Return" : mode === "approve" ? "✅ Approve selected quantities — create SO" : "📄 Create Delivery Note"}
              color={mode === "return" ? C.blue : mode === "approve" ? C.green : C.navy} disabled={busy}
              onPress={mode === "return" ? submitReturn : mode === "approve" ? submitApprove : submitDN} />
            <Btn title="Back" color="#8195a8" onPress={() => { setMode(null); setVals({}); setRemarks({}); }} />
          </>
        : <>
            {canDecide && <Btn title="✅ Review approved quantities" color={C.green} onPress={() => { setMode("approve"); setVals({}); }} />}
            {canDecide && (
              <Btn title="✕ Reject entire order" color={C.red} disabled={busy}
                onPress={() => Alert.alert("Reject", `Reject ${o.ref}? Reserved stock returns to the Main store and the price list is credited.`, [
                  { text: "Cancel", style: "cancel" },
                  { text: "Reject", style: "destructive", onPress: () => act("reject", null, "Order rejected.") }
                ])} />
            )}
            {canCancel && (
              <Btn title={o.cancellable ? "🗑 Cancel the Order" : "🗑 Cancel (window passed — ask Stores)"} color={C.red} disabled={busy || !o.cancellable}
                onPress={() => Alert.alert("Cancel order", `Cancel ${o.ref}? Reserved stock returns to the Main store and your allocation is restored.`, [
                  { text: "No", style: "cancel" },
                  { text: "Yes, cancel", style: "destructive", onPress: () => act("cancel", null, "Order cancelled.") }
                ])} />
            )}
            {canReturn && <Btn title="↩ Return Order (within 3 days of receipt)" color={C.blue} onPress={() => setMode("return")} />}
            {canDN && <Btn title="📄 Create Delivery Note (reserved qtys)" color={C.navy} onPress={() => { setMode("deliver"); setVals(Object.fromEntries(o.lines.map(l => [l.lineRef, deliverable(l) || ""]))); }} />}
            {isAdmin && o.resavable && <Btn title={busy ? "…" : "💾 Re-save Order (fill DOD lines)"} color={C.navy} disabled={busy} onPress={resave} />}
            {isAdmin && ["in_progress", "pending_approval", "partially_delivered", "do_created", "partially_received"].includes(o.status) && (
              <Btn title="🗑 Cancel Order / undelivered balance" color={C.red} disabled={busy}
                onPress={() => Alert.alert("Cancel", `Cancel the undelivered balance of ${o.ref}?`, [
                  { text: "No", style: "cancel" },
                  { text: "Yes", style: "destructive", onPress: () => act("cancel", null, "Cancelled.") }
                ])} />
            )}
          </>}

      <Text style={s.sec}>History</Text>
      <Card>
        {o.history.map((h, i) => (
          <View key={i} style={{ paddingVertical: 4, borderBottomWidth: i < o.history.length - 1 ? 1 : 0, borderColor: C.line }}>
            <Text style={{ fontSize: 10, color: C.mut }}>{fmtDT(h.at)}</Text>
            <Text style={{ fontSize: 12 }}>{h.ev}</Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  sec: { fontSize: 13, fontWeight: "700", color: C.mut, marginVertical: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cell: { fontSize: 11, color: C.mut, backgroundColor: "#f2f5f9", borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 },
  b: { fontWeight: "800", color: C.ink },
  inp: { borderWidth: 1.5, borderColor: C.line, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: "#fff", minWidth: 90, fontSize: 12 }
});
