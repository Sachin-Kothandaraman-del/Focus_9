import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api";
import { useStore } from "../store";
import { Card, Btn, StatusChip, fmt, fmtDT, Empty, Loading } from "../components";
import { C } from "../theme";

const BUCKETS = [
  ["all", "Orders"], ["progress", "In Progress"], ["approval", "Order Approval"],
  ["complete", "Complete"], ["cancel", "Cancelled"], ["reject", "Rejected"]
];
const bucketOf = o => ({
  pending_approval: "approval", in_progress: "progress", do_created: "progress",
  partially_received: "progress", complete: "complete", cancelled: "cancel", rejected: "reject"
}[o.status] || "all");

export default function OrdersScreen({ navigation }) {
  const { user } = useStore();
  const [orders, setOrders] = useState(null);
  const [bucket, setBucket] = useState("all");
  const [refreshing, setRefreshing] = useState(false);

  const loadOrders = useCallback(async () => {
    try { setOrders(await api("/api/orders")); } catch (e) {}
  }, []);
  useFocusEffect(useCallback(() => { loadOrders(); }, [loadOrders]));

  if (!orders) return <Loading />;
  const list = bucket === "all" ? orders : orders.filter(o => bucketOf(o) === bucket);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, padding: 10 }}>
        {BUCKETS.map(([id, lbl]) => {
          const n = id === "all" ? orders.length : orders.filter(o => bucketOf(o) === id).length;
          return (
            <TouchableOpacity key={id} onPress={() => setBucket(id)}
              style={[s.tab, bucket === id && { backgroundColor: C.navy }]}>
              <Text style={[s.tabTxt, bucket === id && { color: "#fff" }]}>{lbl}{n ? ` (${n})` : ""}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <ScrollView contentContainerStyle={{ padding: 14, paddingTop: 4 }}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={async () => { setRefreshing(true); await loadOrders(); setRefreshing(false); }} />}>
        {list.length === 0 && <Empty text="No orders in this bucket" />}
        {list.map(o => (
          <Card key={o.ref}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Text style={{ fontWeight: "800", color: C.navy, fontSize: 15 }}>{o.ref}</Text>
              <StatusChip status={o.status} />
              <Text style={{ marginLeft: "auto", color: C.mut, fontSize: 11 }}>{fmtDT(o.createdAt)}</Text>
            </View>
            <Text style={{ color: C.mut, fontSize: 12, marginTop: 5 }}>
              {user.role !== "employee" ? `${o.empName} · ` : ""}Contract {o.contract} · {o.lines.length} line{o.lines.length > 1 ? "s" : ""} ·{" "}
              <Text style={{ fontWeight: "700", color: C.ink }}>AED {fmt(o.total)}</Text>
              {o.so ? ` · SO ${o.so}` : ""}{o.dns?.length ? ` · DO ${o.dns.join(", ")}` : ""}
            </Text>
            <Btn small title="View / Actions" color={C.blue} style={{ alignSelf: "flex-start", marginTop: 9 }}
              onPress={() => navigation.navigate("OrderDetail", { ref: o.ref })} />
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  tab: { backgroundColor: "#e4eaf1", borderRadius: 9, paddingHorizontal: 12, paddingVertical: 7, marginRight: 6, height: 32 },
  tabTxt: { fontSize: 12, fontWeight: "600", color: C.mut }
});
