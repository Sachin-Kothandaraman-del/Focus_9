import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api";
import { Card, Btn, StatusChip, fmt, fmtDT, Empty, Loading } from "../components";
import { C } from "../theme";

export default function ApprovalsScreen({ navigation }) {
  const [orders, setOrders] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadPending = useCallback(async () => {
    try { setOrders(await api("/api/orders?pending=1")); } catch (e) {}
  }, []);
  useFocusEffect(useCallback(() => { loadPending(); }, [loadPending]));

  if (!orders) return <Loading />;
  const pend = orders.filter(o => o.status === "pending_approval");

  return (
    <ScrollView contentContainerStyle={{ padding: 14 }}
      refreshControl={<RefreshControl refreshing={refreshing}
        onRefresh={async () => { setRefreshing(true); await loadPending(); setRefreshing(false); }} />}>
      <Card>
        <Text style={{ fontSize: 12, color: C.mut }}>
          Orders exceeding allocated quantities or containing restricted items need EGA approval.
          Approving creates the Sales Order in the ERP and raises the employee's approved qty list.
        </Text>
      </Card>
      {pend.length === 0 && <Empty icon="✅" text="No orders awaiting approval" />}
      {pend.map(o => (
        <Card key={o.ref}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Text style={{ fontWeight: "800", color: C.navy, fontSize: 15 }}>{o.ref}</Text>
            <StatusChip status={o.status} />
            <Text style={{ marginLeft: "auto", color: C.mut, fontSize: 11 }}>{fmtDT(o.createdAt)}</Text>
          </View>
          <Text style={{ color: C.mut, fontSize: 12, marginTop: 5 }}>
            {o.empName} ({o.emp}) · {o.dept} · {o.customerName}{"\n"}
            Contract {o.contract} · {o.lines.length} line/s ·{" "}
            <Text style={{ fontWeight: "700", color: C.ink }}>AED {fmt(o.total)}</Text>
          </Text>
          <Btn small title="Review & Decide" color={C.blue} style={{ alignSelf: "flex-start", marginTop: 9 }}
            onPress={() => navigation.navigate("OrderDetail", { ref: o.ref })} />
        </Card>
      ))}
    </ScrollView>
  );
}
