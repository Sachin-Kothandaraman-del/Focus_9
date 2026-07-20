import React, { useState, useMemo } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, RefreshControl } from "react-native";
import { useStore } from "../store";
import { Card, Chip, fmt, Loading } from "../components";
import { C } from "../theme";

export default function ShopScreen() {
  const { catalog, refreshCatalog, addToCart, orderCart } = useStore();
  const [group, setGroup] = useState(null);
  const [cat, setCat] = useState(null);
  const [qtys, setQtys] = useState({});
  const [refreshing, setRefreshing] = useState(false);

  const groups = useMemo(
    () => catalog ? [...new Set(catalog.lines.map(l => l.item.group))] : [],
    [catalog]
  );
  const activeGroup = group || groups[0];
  const cats = useMemo(
    () => catalog ? [...new Set(catalog.lines.filter(l => l.item.group === activeGroup).map(l => l.item.cat))] : [],
    [catalog, activeGroup]
  );
  if (!catalog) return <Loading />;

  const lines = catalog.lines.filter(l => l.item.group === activeGroup && (!cat || l.item.cat === cat));
  const qtyOf = code => Math.max(1, parseInt(qtys[code]) || 1);

  function inOrderCart(code) {
    return orderCart.filter(x => x.code === code).reduce((s, x) => s + x.qty, 0);
  }

  function add(l) {
    const qty = qtyOf(l.code);
    const withinLimit = !l.restricted && qty + inOrderCart(l.code) <= l.balance;
    if (withinLimit) {
      addToCart("order", l.code, qty);
      Alert.alert("Added to Order Cart", `${qty} × ${l.item.name}`);
    } else {
      const why = l.restricted
        ? "This item is restricted and needs client approval."
        : `Requested qty exceeds your allocated balance (${l.balance} available).`;
      Alert.alert("Approval needed", `${why}\n\nDo you want to send it for approval?`, [
        { text: "No", style: "cancel" },
        { text: "Yes, send for approval", onPress: () => addToCart("approval", l.code, qty) }
      ]);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1 }} contentContainerStyle={{ padding: 14 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refreshCatalog(); setRefreshing(false); }} />}>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
          <Text style={{ fontWeight: "800", color: C.navy }}>Contract {catalog.priceList.contract}</Text>
          <Chip label={catalog.priceList.name} color={C.navy} />
          <Chip label={catalog.customer.name} color={C.mut} />
        </View>
        <Text style={{ color: C.mut, fontSize: 11, marginTop: 4 }}>
          Valid {catalog.priceList.validFrom} → {catalog.priceList.validTill} · items limited to your approved price list
        </Text>
      </Card>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
        {groups.map(g => (
          <TouchableOpacity key={g} onPress={() => { setGroup(g); setCat(null); }}
            style={[s.tab, activeGroup === g && { backgroundColor: C.navy }]}>
            <Text style={[s.tabTxt, activeGroup === g && { color: "#fff" }]}>{g}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
        <TouchableOpacity onPress={() => setCat(null)} style={[s.tab, !cat && { backgroundColor: C.orange }]}>
          <Text style={[s.tabTxt, !cat && { color: "#fff" }]}>All</Text>
        </TouchableOpacity>
        {cats.map(ct => (
          <TouchableOpacity key={ct} onPress={() => setCat(ct)} style={[s.tab, cat === ct && { backgroundColor: C.orange }]}>
            <Text style={[s.tabTxt, cat === ct && { color: "#fff" }]}>{ct}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
        {lines.map(l => (
          <Card key={l.code} style={{ width: "48.5%" }}>
            {l.restricted && <Chip label="RESTRICTED" color={C.red} />}
            <Text style={{ fontSize: 34, textAlign: "center", marginVertical: 6 }}>{l.item.pic}</Text>
            <Text style={{ fontWeight: "700", fontSize: 13, minHeight: 34 }}>{l.item.name}</Text>
            <Text style={{ color: C.mut, fontSize: 10 }}>{l.code} · {l.item.uom}</Text>
            <Text style={{ fontWeight: "800", color: C.navy, marginTop: 3 }}>AED {fmt(l.price)}</Text>
            <Text style={{ fontSize: 10, color: C.mut, marginBottom: 6 }}>
              Allocated {l.allocated} · <Text style={{ color: l.balance > 0 ? C.green : C.red, fontWeight: "700" }}>Bal {l.balance}</Text>
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
              <TouchableOpacity style={s.step} onPress={() => setQtys(q => ({ ...q, [l.code]: Math.max(1, qtyOf(l.code) - 1) }))}>
                <Text style={s.stepTxt}>−</Text>
              </TouchableOpacity>
              <TextInput style={s.qty} keyboardType="number-pad"
                value={String(qtys[l.code] ?? 1)}
                onChangeText={v => setQtys(q => ({ ...q, [l.code]: v.replace(/[^0-9]/g, "") }))} />
              <TouchableOpacity style={s.step} onPress={() => setQtys(q => ({ ...q, [l.code]: qtyOf(l.code) + 1 }))}>
                <Text style={s.stepTxt}>+</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={s.add} onPress={() => add(l)}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Add ➜</Text>
            </TouchableOpacity>
          </Card>
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  tab: { borderWidth: 1.5, borderColor: C.line, backgroundColor: "#fff", borderRadius: 20, paddingHorizontal: 13, paddingVertical: 7, marginRight: 7 },
  tabTxt: { fontSize: 12, color: C.ink },
  step: { width: 28, height: 28, borderRadius: 8, borderWidth: 1.5, borderColor: C.line, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  stepTxt: { fontSize: 16, fontWeight: "700", color: C.navy },
  qty: { flex: 1, textAlign: "center", borderWidth: 1.5, borderColor: C.line, borderRadius: 8, marginHorizontal: 5, paddingVertical: 4, backgroundColor: "#fff" },
  add: { backgroundColor: C.navy, borderRadius: 9, paddingVertical: 9, alignItems: "center" }
});
