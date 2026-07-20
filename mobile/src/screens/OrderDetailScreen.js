import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, TextInput, Alert, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api";
import { useStore } from "../store";
import { Card, Btn, StatusChip, KV, fmt, fmtDT, Loading } from "../components";
import { C } from "../theme";

export default function OrderDetailScreen({ route, navigation }) {
  const { user, refreshCatalog } = useStore();
  const { ref } = route.params;
  const [o, setO] = useState(null);
  const [mode, setMode] = useState(null); // null | "receive" | "return"
  const [vals, setVals] = useState({});
  const [busy, setBusy] = useState(false);

  const loadOrder = useCallback(async () => {
    try { setO(await api(`/api/orders/${ref}`)); } catch (e) { Alert.alert("Error", e.message); }
  }, [ref]);
  useFocusEffect(useCallback(() => { loadOrder(); }, [loadOrder]));

  if (!o) return <Loading />;

  const mine = user.role === "employee" && o.emp === user.id;
  const canCancel = mine && o.cancellable;
  const canReceive = mine && ["do_created", "partially_received"].includes(o.status);
  const canReturn = mine && o.status === "complete";
  const canDecide = user.role === "approver" && o.status === "pending_approval";
  const canDN = user.role === "admin" && o.status === "in_progress";

  async function act(path, body, okMsg) {
    setBusy(true);
    try {
      await api(`/api/orders/${ref}/${path}`, { method: "POST", body });
      await loadOrder();
      if (mine) await refreshCatalog();
      setMode(null); setVals({});
      if (okMsg) Alert.alert("Done", okMsg);
    } catch (e) {
      Alert.alert("Action failed", e.message);
    } finally {
      setBusy(false);
    }
  }

  function submitQtyMode() {
    const lines = o.lines
      .map(l => ({ lineRef: l.lineRef, qty: Number(vals[l.lineRef]) || 0 }))
      .filter(l => l.qty > 0);
    if (!lines.length) return Alert.alert("Enter a quantity first");
    if (mode === "receive") act("receive", { lines }, "Receipt acknowledged — order quantities updated.");
    else act("return", { lines }, "Return submitted — your approved qty list has been credited.");
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <Text style={{ fontSize: 19, fontWeight: "800", color: C.navy }}>{o.ref}</Text>
        <StatusChip status={o.status} />
      </View>
      <Card>
        <KV k="Date" v={fmtDT(o.createdAt)} />
        <KV k="Contract Ref" v={o.contract} />
        <KV k="Employee" v={`${o.emp} — ${o.empName}`} />
        <KV k="Department" v={o.dept || "—"} />
        <KV k="Customer" v={o.customerName} />
        {o.so ? <KV k="ERP Sales Order" v={o.so} /> : null}
        {o.dns?.length ? <KV k="Delivery Notes" v={o.dns.join(", ")} /> : null}
      </Card>

      <Card>
        <View style={s.tr}>
          <Text style={[s.th, { flex: 2.2 }]}>Item</Text>
          <Text style={s.th}>Qty</Text>
          <Text style={s.th}>Price</Text>
          <Text style={s.th}>Amount</Text>
          <Text style={s.th}>Recvd</Text>
          <Text style={s.th}>Bal</Text>
        </View>
        {o.lines.map(l => (
          <View key={l.lineRef} style={s.tr}>
            <View style={{ flex: 2.2 }}>
              <Text style={{ fontSize: 12, fontWeight: "600" }}>{l.code}</Text>
              <Text style={{ fontSize: 10, color: C.mut }}>{l.lineRef} · {l.uom}</Text>
            </View>
            <Text style={s.td}>{l.qty}</Text>
            <Text style={s.td}>{fmt(l.price)}</Text>
            <Text style={s.td}>{fmt(l.amount)}</Text>
            <Text style={s.td}>{l.received}</Text>
            <Text style={s.td}>{l.qty - l.received}</Text>
          </View>
        ))}
        <View style={[s.tr, { borderTopWidth: 1, borderColor: C.line }]}>
          <Text style={{ flex: 2.2, fontWeight: "800" }}>Total Amount</Text>
          <Text style={{ fontWeight: "800", color: C.navy }}>AED {fmt(o.total)}</Text>
        </View>
      </Card>

      {(mode === "receive" || mode === "return") && (
        <Card>
          <Text style={{ fontWeight: "800", marginBottom: 8 }}>
            {mode === "receive" ? "Receive — enter quantities now received" : "Return — enter quantities to return"}
          </Text>
          {o.lines.map(l => {
            const max = mode === "receive" ? l.qty - l.received : l.received;
            if (max <= 0) return null;
            return (
              <View key={l.lineRef} style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                <Text style={{ flex: 1, fontSize: 12 }}>{l.code} (max {max})</Text>
                <TextInput
                  style={s.inp} keyboardType="number-pad"
                  value={String(vals[l.lineRef] ?? (mode === "receive" ? max : 0))}
                  onChangeText={v => setVals(x => ({ ...x, [l.lineRef]: v.replace(/[^0-9]/g, "") }))} />
              </View>
            );
          })}
          <Btn title={busy ? "Submitting…" : mode === "receive" ? "✅ Confirm Receipt" : "↩ Submit Return"}
            color={mode === "receive" ? C.green : C.blue} disabled={busy} onPress={submitQtyMode} />
          <Btn title="Back" color="#8195a8" onPress={() => setMode(null)} />
        </Card>
      )}

      {mode === null && (
        <>
          {o.status === "in_progress" && mine && (
            <Btn title={canCancel ? "🗑 Cancel the Order (within 15 min)" : "Cancel window closed (15 min)"}
              color={C.red} disabled={!canCancel || busy}
              onPress={() =>
                Alert.alert("Cancel order", `Cancel ${o.ref}? The ERP SO will be cancelled and your allocation restored.`, [
                  { text: "Keep order", style: "cancel" },
                  { text: "Cancel the Order", style: "destructive", onPress: () => act("cancel", null, "Order moved to the Cancel Orders bucket.") }
                ])} />
          )}
          {canReceive && <Btn title="📦 Order Complete — Receive items" color={C.green} onPress={() => setMode("receive")} />}
          {canReturn && <Btn title="↩ Return Order" color={C.blue} onPress={() => setMode("return")} />}
          {canDecide && (
            <>
              <Btn title={busy ? "…" : "✅ Approve — create SO in ERP"} color={C.green} disabled={busy}
                onPress={() => act("approve", null, "Order approved — moved to Orders bucket, SO created.")} />
              <Btn title="✕ Reject Order" color={C.red} disabled={busy}
                onPress={() =>
                  Alert.alert("Reject order", `Reject ${o.ref}?`, [
                    { text: "Back", style: "cancel" },
                    { text: "Reject", style: "destructive", onPress: () => act("reject", null, "Order rejected.") }
                  ])} />
            </>
          )}
          {canDN && <Btn title="📄 Create Delivery Note" color={C.navy} disabled={busy}
            onPress={() => act("delivery-note", null, "Delivery Note created — employee can acknowledge receipt.")} />}
        </>
      )}

      <Card style={{ marginTop: 12 }}>
        <Text style={{ fontWeight: "800", marginBottom: 6 }}>History</Text>
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
  tr: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  th: { flex: 1, fontSize: 10, color: C.mut, fontWeight: "700", textAlign: "right" },
  td: { flex: 1, fontSize: 11, textAlign: "right" },
  inp: { width: 70, borderWidth: 1.5, borderColor: C.line, borderRadius: 8, textAlign: "right", paddingVertical: 5, paddingHorizontal: 8, backgroundColor: "#fff" }
});
