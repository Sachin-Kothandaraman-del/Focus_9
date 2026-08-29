import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, Alert, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api";
import { Card, Btn, StatusChip, fmt, fmtDT, Empty, Loading } from "../components";
import { C } from "../theme";

export default function FulfilScreen({ navigation }) {
  const [orders, setOrders] = useState(null);
  const [erp, setErp] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [o, e] = await Promise.all([api("/api/orders"), api("/api/erp/documents")]);
      setOrders(o); setErp(e);
    } catch (e) {}
  }, []);
  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  if (!orders || !erp) return <Loading />;
  const openStatuses = ["in_progress", "partially_delivered", "partially_received"];
  const toDeliver = orders.filter(o => openStatuses.includes(o.status) &&
    o.lines.some(l => (l.delivered || 0) < (l.approvedQty ?? l.qty)));
  const dodOrders = orders.filter(o => o.resavable);
  const pendingReturns = orders.flatMap(o => (o.returns || [])
    .filter(r => r.status === "pending")
    .map(r => ({ order: o, rma: r })));
  const awaiting = orders.flatMap(o => (o.deliveries || [])
    .filter(d => d.lines.some(l => l.qty > (l.received || 0)))
    .map(d => ({ order: o, delivery: d })));
  const pendingDNs = erp.dn.filter(d => !d.invoiced);
  async function consolidate() {
    setBusy(true);
    try {
      const r = await api("/api/invoices/consolidate", { method: "POST" });
      await loadAll();
      Alert.alert("Invoiced", r.invoices.map(i => `${i.ref} → AED ${fmt(i.total)}`).join("\n"));
    } catch (e) { Alert.alert("Failed", e.message); } finally { setBusy(false); }
  }
  async function resaveAll() {
    setBusy(true);
    try {
      const r = await api("/api/orders/resave-all", { method: "POST" });
      await loadAll();
      Alert.alert("Re-save", r.resaved.length
        ? r.resaved.map(x => `${x.ref}: ${x.updated.join(", ")}`).join("\n")
        : "No DOD lines could be filled — Main-store stock still insufficient.");
    } catch (e) { Alert.alert("Failed", e.message); } finally { setBusy(false); }
  }
  async function confirmReturn(orderRef, rt) {
    Alert.alert("Return Confirmation", `Confirm receipt of returned items on ${rt}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Confirm", onPress: async () => {
        setBusy(true);
        try { await api(`/api/orders/${orderRef}/returns/${rt}/confirm`, { method: "POST" }); await loadAll(); }
        catch (e) { Alert.alert("Failed", e.message); } finally { setBusy(false); }
      } }
    ]);
  }

  const Sec = ({ t }) => <Text style={{ fontSize: 13, fontWeight: "700", color: C.mut, marginVertical: 8, textTransform: "uppercase" }}>{t}</Text>;

  return (
    <ScrollView contentContainerStyle={{ padding: 14 }}
      refreshControl={<RefreshControl refreshing={refreshing}
        onRefresh={async () => { setRefreshing(true); await loadAll(); setRefreshing(false); }} />}>
      <Sec t="🚚 SOs ready for Delivery Note" />
      {toDeliver.length === 0 && <Card><Text style={{ color: C.mut, fontSize: 12 }}>No open SOs awaiting delivery.</Text></Card>}
      {toDeliver.map(o => (
        <Card key={o.ref}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Text style={{ fontWeight: "800", color: C.navy }}>{o.ref}</Text>
            <StatusChip status={o.status} />
            <Text style={{ marginLeft: "auto", fontSize: 11, color: C.mut }}>SO {o.so}</Text>
          </View>
          <Text style={{ color: C.mut, fontSize: 12, marginTop: 4 }}>{o.empName} · {o.customerName} · AED {fmt(o.total)}</Text>
          <Text style={{ color: C.ink, fontSize: 11, marginTop: 4 }}>
            Remaining: {o.lines.filter(l => (l.delivered || 0) < (l.approvedQty ?? l.qty)).map(l => `${l.code} ${(l.approvedQty ?? l.qty) - (l.delivered || 0)}`).join(" · ")}
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 9 }}>
            <Btn small title="View" color={C.blue} onPress={() => navigation.navigate("OrderDetail", { ref: o.ref })} />
            <Btn small title="📄 Select Delivery Qty" color={C.navy} disabled={busy}
              onPress={() => navigation.navigate("OrderDetail", { ref: o.ref })} />
          </View>
        </Card>
      ))}

      <Sec t="📦 Delivered — awaiting receipt acknowledgement" />
      {awaiting.length === 0 && <Card><Text style={{ color: C.mut, fontSize: 12 }}>Nothing awaiting acknowledgement.</Text></Card>}
      {awaiting.map(({ order: o, delivery: d }) => (
        <Card key={d.ref}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontWeight: "800", color: C.navy }}>{o.ref}</Text>
            <StatusChip status={o.status} />
          </View>
          <Text style={{ color: C.mut, fontSize: 12, marginTop: 4 }}>DO {d.ref} · {o.empName} · AED {fmt(d.total)}</Text>
          <Text style={{ color: C.ink, fontSize: 11, marginTop: 4 }}>
            Awaiting receipt: {d.lines.filter(l => l.qty > (l.received || 0)).map(l => `${l.code} ${l.qty - (l.received || 0)}`).join(" · ")}
          </Text>
        </Card>
      ))}

      <Sec t="💾 Re-save — fill DOD lines when stock arrives" />
      <Card>
        <Text style={{ color: C.mut, fontSize: 12, marginBottom: 6 }}>
          {dodOrders.length} order/s have unreserved (DOD) quantities{dodOrders.length ? `: ${dodOrders.map(o => o.ref).join(", ")}` : "."}
        </Text>
        <Btn title="💾 Re-save all Orders" color={C.navy} disabled={!dodOrders.length || busy} onPress={resaveAll} />
      </Card>

      <Sec t="↩ Returns awaiting Return Confirmation" />
      {pendingReturns.length === 0 && <Card><Text style={{ color: C.mut, fontSize: 12 }}>No returns awaiting confirmation.</Text></Card>}
      {pendingReturns.map(({ order: o, rma }) => (
        <Card key={rma.ref}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontWeight: "800", color: C.navy }}>{rma.ref}</Text>
            <Text style={{ marginLeft: "auto", fontSize: 11, color: C.mut }}>{o.ref} · {o.empName}</Text>
          </View>
          <Text style={{ fontSize: 11, color: C.mut, marginTop: 3 }}>
            {rma.lines.map(l => `${l.code}: ${l.qty}${l.remark ? ` (${l.remark})` : ""}`).join(" · ")} — AED {fmt(rma.total)}
          </Text>
          <Btn small title="✅ Return Confirmation" color={C.green} disabled={busy}
            style={{ alignSelf: "flex-start", marginTop: 8 }} onPress={() => confirmReturn(o.ref, rma.ref)} />
        </Card>
      ))}

      <Sec t="🧾 DO consolidation → invoice to EGA" />
      <Card>
        <Text style={{ color: C.mut, fontSize: 12, marginBottom: 6 }}>{pendingDNs.length} delivery note/s pending invoicing.</Text>
        <Btn title="🧾 Consolidate DOs & Invoice EGA" disabled={!pendingDNs.length || busy} onPress={consolidate} />
      </Card>

      <Sec t="🗄 Recent ERP documents" />
      {["so", "dn", "stv", "inv", "ret", "cn"].flatMap(k => (erp[k] || []).slice(0, 3).map(d => (
        <Card key={k + d.ref}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ fontWeight: "800", color: C.navy }}>{d.ref}</Text>
            <Text style={{ marginLeft: "auto", fontSize: 10, color: C.mut }}>{fmtDT(d.at)}</Text>
          </View>
          <Text style={{ fontSize: 11, color: C.mut, marginTop: 3 }}>
            {{ so: "Sales Order", dn: "Delivery Note", stv: "Stock Transfer (Issue + Receipt)", inv: "Invoice to EGA", ret: "Material Return", cn: "Credit Note" }[k]}
            {d.order ? ` · order ${d.order}` : ""}{d.dns ? ` · ${d.dns.join(", ")}` : ""}
            {k === "stv" ? ` · ${d.from} → ${d.to}` : ` · AED ${fmt(d.total)}`} · {d.status || (d.invoiced ? "Invoiced" : "Open")}
          </Text>
        </Card>
      )))}
      {erp.log.slice(0, 6).map((l, i) => (
        <Card key={i} style={{ backgroundColor: "#122942" }}>
          <Text style={{ color: "#7d99b5", fontSize: 9 }}>{fmtDT(l.at)}</Text>
          <Text style={{ color: "#c9dcec", fontSize: 11 }}>{l.msg}</Text>
        </Card>
      ))}
    </ScrollView>
  );
}
