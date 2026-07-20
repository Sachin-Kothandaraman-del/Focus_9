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
  const toDeliver = orders.filter(o => o.status === "in_progress");
  const awaiting = orders.filter(o => ["do_created", "partially_received"].includes(o.status));
  const pendingDNs = erp.dn.filter(d => !d.invoiced);

  async function createDN(ref) {
    setBusy(true);
    try {
      await api(`/api/orders/${ref}/delivery-note`, { method: "POST" });
      await loadAll();
      Alert.alert("Delivery Note created", "The employee can now acknowledge receipt in the app.");
    } catch (e) { Alert.alert("Failed", e.message); } finally { setBusy(false); }
  }
  async function consolidate() {
    setBusy(true);
    try {
      const r = await api("/api/invoices/consolidate", { method: "POST" });
      await loadAll();
      Alert.alert("Invoiced", r.invoices.map(i => `${i.ref} → AED ${fmt(i.total)}`).join("\n"));
    } catch (e) { Alert.alert("Failed", e.message); } finally { setBusy(false); }
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
          <View style={{ flexDirection: "row", gap: 8, marginTop: 9 }}>
            <Btn small title="View" color={C.blue} onPress={() => navigation.navigate("OrderDetail", { ref: o.ref })} />
            <Btn small title="📄 Create Delivery Note" color={C.navy} disabled={busy} onPress={() => createDN(o.ref)} />
          </View>
        </Card>
      ))}

      <Sec t="📦 Delivered — awaiting receipt acknowledgement" />
      {awaiting.length === 0 && <Card><Text style={{ color: C.mut, fontSize: 12 }}>Nothing awaiting acknowledgement.</Text></Card>}
      {awaiting.map(o => (
        <Card key={o.ref}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontWeight: "800", color: C.navy }}>{o.ref}</Text>
            <StatusChip status={o.status} />
          </View>
          <Text style={{ color: C.mut, fontSize: 12, marginTop: 4 }}>DO {o.dns.join(", ")} · {o.empName} · AED {fmt(o.total)}</Text>
        </Card>
      ))}

      <Sec t="🧾 DO consolidation → invoice to EGA" />
      <Card>
        <Text style={{ color: C.mut, fontSize: 12, marginBottom: 6 }}>{pendingDNs.length} delivery note/s pending invoicing.</Text>
        <Btn title="🧾 Consolidate DOs & Invoice EGA" disabled={!pendingDNs.length || busy} onPress={consolidate} />
      </Card>

      <Sec t="🗄 Recent ERP documents" />
      {["so", "dn", "inv", "ret"].flatMap(k => erp[k].slice(0, 3).map(d => (
        <Card key={d.ref}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ fontWeight: "800", color: C.navy }}>{d.ref}</Text>
            <Text style={{ marginLeft: "auto", fontSize: 10, color: C.mut }}>{fmtDT(d.at)}</Text>
          </View>
          <Text style={{ fontSize: 11, color: C.mut, marginTop: 3 }}>
            {{ so: "Sales Order", dn: "Delivery Note", inv: "Invoice to EGA", ret: "Material Return" }[k]}
            {d.order ? ` · order ${d.order}` : ""}{d.dns ? ` · ${d.dns.join(", ")}` : ""} · AED {fmt(d.total)} · {d.status || (d.invoiced ? "Invoiced" : "Open")}
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
