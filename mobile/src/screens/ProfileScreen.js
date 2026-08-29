import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, StyleSheet, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api";
import { useStore } from "../store";
import { Card, Btn, Chip, KV, Loading } from "../components";
import { C } from "../theme";

export default function ProfileScreen() {
  const { logout, deleteAccount } = useStore();
  const [p, setP] = useState(null);

  useFocusEffect(useCallback(() => {
    (async () => { try { setP(await api("/api/profile")); } catch (e) {} })();
  }, []));

  function confirmDelete() {
    Alert.alert(
      "Delete account",
      "This permanently deletes your account and personal data. Past orders remain in the business records. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete my account", style: "destructive",
          onPress: () => Alert.alert("Are you sure?", "Final confirmation — delete your account permanently?", [
            { text: "Keep my account", style: "cancel" },
            {
              text: "Yes, delete", style: "destructive",
              onPress: async () => {
                try { await deleteAccount(); }
                catch (e) { Alert.alert("Could not delete account", e.message); }
              }
            }
          ])
        }
      ]
    );
  }

  if (!p) return <Loading />;

  return (
    <ScrollView contentContainerStyle={{ padding: 14 }}>
      <Card>
        <KV k="Employee ID" v={p.user.empId || "—"} />
        <KV k="Name" v={p.user.name} />
        <KV k="E-mail" v={p.user.email} />
        <KV k="Company" v={p.customer?.name || "—"} />
        <KV k="Department" v={p.user.dept || "—"} />
        <KV k="Mobile" v={p.user.phone || "—"} />
        <KV k="Role" v={p.user.role} />
        {p.user.location ? <KV k="Location" v={p.user.location} /> : null}
        {p.user.role === "employee" ? <KV k="Stores" v={`${p.user.fromStore || "—"} (Main) → ${p.user.toStore || "—"} (Reservation)`} /> : null}
      </Card>

      {(p.priceLists || []).map(pl => (
        <View key={pl.id}>
          <Text style={s.sec}>Approved Qty List — {pl.id} · {pl.name}</Text>
          <Card>
            <Text style={{ color: C.red, fontSize: 11, fontWeight: "600", marginBottom: 6 }}>
              Price List Validity — Start: {pl.validFrom}   End: {pl.validTill}   ·   Delivery Period — {pl.deliveryPeriod} Day/s   ·   Contract {pl.contract}
            </Text>
            <View style={s.tr}>
              <Text style={[s.th, { flex: 2.2, textAlign: "left" }]}>Item</Text>
              <Text style={s.th}>Alloc</Text>
              <Text style={s.th}>Alloc Amt</Text>
              <Text style={s.th}>Used</Text>
              <Text style={s.th}>Used Amt</Text>
              <Text style={s.th}>Bal</Text>
            </View>
            {pl.approvedQtyList.map(l => (
              <View key={l.key} style={s.tr}>
                <View style={{ flex: 2.2 }}>
                  <Text style={{ fontSize: 11, fontWeight: "600" }}>{l.items[0].name}{l.items.length > 1 ? ` (+${l.items.length - 1} sizes)` : ""}</Text>
                  <Text style={{ fontSize: 9, color: C.mut }}>{l.uom} · AED {l.price}</Text>
                </View>
                <Text style={s.td}>{l.allocated}</Text>
                <Text style={[s.td, { color: C.red }]}>{l.allocatedAmount}</Text>
                <Text style={s.td}>{l.used}</Text>
                <Text style={[s.td, { color: C.red }]}>{l.usedAmount}</Text>
                <Text style={[s.td, { fontWeight: "800", color: l.balance > 0 ? C.green : C.red }]}>{l.balance}</Text>
              </View>
            ))}
            <View style={[s.tr, { borderBottomWidth: 0 }]}>
              <Text style={[s.th, { flex: 2.2, textAlign: "left" }]}>Totals</Text>
              <Text style={s.th} />
              <Text style={[s.td, { color: C.red, fontWeight: "800" }]}>{pl.totals.allocatedAmount.toFixed(2)}</Text>
              <Text style={s.th} />
              <Text style={[s.td, { color: C.red, fontWeight: "800" }]}>{pl.totals.usedAmount.toFixed(2)}</Text>
              <Text style={s.th} />
            </View>
            <Text style={{ fontSize: 9, color: C.mut }}>Totals = Total Allocated Amount / Total Used Amount (rolled into the shopping screen header)</Text>
          </Card>
        </View>
      ))}

      <Btn title="Sign out" color={C.navy} onPress={logout} />
      <Btn title="🗑 Delete my account" color={C.red} onPress={confirmDelete} />
      <Text style={{ fontSize: 10, color: C.mut, textAlign: "center", marginTop: 8 }}>
        Deleting removes your login and personal data permanently.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  sec: { fontSize: 13, fontWeight: "700", color: C.mut, marginBottom: 6, marginTop: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  tr: { flexDirection: "row", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderColor: C.line },
  th: { flex: 1, fontSize: 10, color: C.mut, fontWeight: "700", textAlign: "right" },
  td: { flex: 1, fontSize: 12, textAlign: "right" }
});
