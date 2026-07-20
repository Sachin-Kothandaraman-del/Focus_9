import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api";
import { useStore } from "../store";
import { Card, Btn, Chip, KV, Loading } from "../components";
import { C } from "../theme";

export default function ProfileScreen() {
  const { logout } = useStore();
  const [p, setP] = useState(null);

  useFocusEffect(useCallback(() => {
    (async () => { try { setP(await api("/api/profile")); } catch (e) {} })();
  }, []));

  if (!p) return <Loading />;

  return (
    <ScrollView contentContainerStyle={{ padding: 14 }}>
      <Card>
        <KV k="Employee ID" v={p.user.id} />
        <KV k="Name" v={p.user.name} />
        <KV k="Company" v={p.customer?.name || "—"} />
        <KV k="Department" v={p.user.dept || "—"} />
        <KV k="Mobile" v={p.user.phone} />
        <KV k="E-mail" v={p.user.email} />
        <KV k="Approved Price List" v={p.priceList ? `${p.priceList.name} · Contract ${p.priceList.contract}` : "—"} />
      </Card>

      {p.approvedQtyList.length > 0 && (
        <>
          <Text style={s.sec}>Approved Qty List</Text>
          <Card>
            <View style={s.tr}>
              <Text style={[s.th, { flex: 2.4, textAlign: "left" }]}>Item</Text>
              <Text style={s.th}>Alloc</Text>
              <Text style={s.th}>Used</Text>
              <Text style={s.th}>Bal</Text>
              <Text style={[s.th, { flex: 1.3 }]}>Restricted</Text>
            </View>
            {p.approvedQtyList.map(l => (
              <View key={l.code} style={s.tr}>
                <View style={{ flex: 2.4 }}>
                  <Text style={{ fontSize: 12, fontWeight: "600" }}>{l.name}</Text>
                  <Text style={{ fontSize: 10, color: C.mut }}>{l.code} · {l.uom}</Text>
                </View>
                <Text style={s.td}>{l.allocated}</Text>
                <Text style={s.td}>{l.used}</Text>
                <Text style={[s.td, { fontWeight: "800", color: l.balance > 0 ? C.green : C.red }]}>{l.balance}</Text>
                <View style={{ flex: 1.3, alignItems: "flex-end" }}>
                  <Chip label={l.restricted ? "Yes" : "No"} color={l.restricted ? C.red : C.mut} />
                </View>
              </View>
            ))}
          </Card>
        </>
      )}
      <Btn title="Sign out" color={C.navy} onPress={logout} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  sec: { fontSize: 13, fontWeight: "700", color: C.mut, marginBottom: 6, marginTop: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  tr: { flexDirection: "row", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderColor: C.line },
  th: { flex: 1, fontSize: 10, color: C.mut, fontWeight: "700", textAlign: "right" },
  td: { flex: 1, fontSize: 12, textAlign: "right" }
});
