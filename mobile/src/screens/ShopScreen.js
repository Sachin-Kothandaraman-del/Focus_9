import React, { useState } from "react";
import { View, Text, Image, ScrollView, TouchableOpacity, StyleSheet, Alert, RefreshControl } from "react-native";
import { useStore } from "../store";
import { Card, Chip, fmt, Loading, Empty, variantLabel, variantKind } from "../components";
import { C } from "../theme";

/* Shopping List (SRS2): one tab per assigned price list, header with contract /
   validity / Total Allocated & Used Amounts, Groups & Categories filters,
   live Main-store stock, size variants sharing one allocation. */
export default function ShopScreen() {
  const { catalog, refreshCatalog, refreshCart, addToCart, cart } = useStore();
  const [plIx, setPlIx] = useState(0);
  const [group, setGroup] = useState(null);
  const [cat, setCat] = useState(null);
  const [sizeSel, setSizeSel] = useState({});
  const [refreshing, setRefreshing] = useState(false);

  if (!catalog) return <Loading />;
  const profiles = catalog.profiles || [];
  const profile = profiles[Math.min(plIx, profiles.length - 1)];
  if (!profile) return <Empty icon="🛒" text="No price list is assigned to you yet — contact the PROSAFE admin." />;

  const groups = [];
  for (const l of profile.lines) if (l.group && !groups.find(g => g.code === l.group.code)) groups.push(l.group);
  const activeGroup = groups.find(g => g.code === group) || groups[0] || null;
  const cats = [];
  for (const l of profile.lines)
    if (l.group?.code === activeGroup?.code && l.cat && !cats.find(c => c.code === l.cat.code)) cats.push(l.cat);
  const lines = profile.lines.filter(l =>
    (!activeGroup || l.group?.code === activeGroup.code) && (!cat || l.cat?.code === cat));

  const cartQtyOf = code =>
    cart.order.filter(x => x.code === code).reduce((s, x) => s + x.qty, 0) +
    cart.approval.filter(x => x.code === code).reduce((s, x) => s + x.qty, 0);

  async function addOne(l, code) {
    const r = await addToCart(profile.priceList.id, code, 1);
    if (r.ok) {
      if (r.notice) Alert.alert("Stock notice", r.notice);
      return;
    }
    if (r.needsApproval) {
      Alert.alert("Approval needed", `${r.error.replace(" Send it for approval?", "")}\n\nDo you want to send the Order for approval?`, [
        { text: "Cancel", style: "cancel" },
        { text: "OK — send for approval", onPress: async () => {
          const r2 = await addToCart(profile.priceList.id, code, 1, true);
          if (!r2.ok) Alert.alert("Error", r2.error);
          else if (r2.notice) Alert.alert("Stock notice", r2.notice);
        } }
      ]);
    } else {
      Alert.alert("Error", r.error);
    }
  }
  async function subtractOne(code) {
    const r = await addToCart(profile.priceList.id, code, -1);
    if (!r.ok) Alert.alert("Error", r.error);
  }

  return (
    <ScrollView
      style={{ flex: 1 }} contentContainerStyle={{ padding: 14 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refreshCatalog(); await refreshCart(); setRefreshing(false); }} />}>
      {profiles.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          {profiles.map((p, ix) => (
            <TouchableOpacity key={p.priceList.id} onPress={() => { setPlIx(ix); setGroup(null); setCat(null); }}
              style={[s.tab, plIx === ix && { backgroundColor: C.orange, borderColor: C.orange }]}>
              <Text style={[s.tabTxt, plIx === ix && { color: "#fff", fontWeight: "700" }]}>{p.priceList.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      <Card style={{ borderLeftWidth: 4, borderLeftColor: C.orange }}>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
          <Text style={{ fontWeight: "800", color: C.navy }}>{profile.customer?.name}</Text>
          <Chip label={`Contract ${profile.priceList.contract}`} color={C.navy} />
          <Chip label={profile.priceList.name} color={C.blue} />
        </View>
        <Text style={{ color: C.mut, fontSize: 11, marginTop: 4 }}>
          Validity {profile.priceList.validFrom} → {profile.priceList.validTill} · Delivery period {profile.priceList.deliveryPeriod} day/s
        </Text>
        <Text style={{ color: C.red, fontSize: 12, marginTop: 4, fontWeight: "600" }}>
          Total Allocated Amount — {fmt(profile.totals.allocatedAmount)}   ·   Total Used Amount — {fmt(profile.totals.usedAmount)}
        </Text>
      </Card>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
        {groups.map(g => (
          <TouchableOpacity key={g.code} onPress={() => { setGroup(g.code); setCat(null); }}
            style={[s.tab, activeGroup?.code === g.code && { backgroundColor: C.navy }]}>
            <Text style={[s.tabTxt, activeGroup?.code === g.code && { color: "#fff" }]}>{g.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {cats.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
          <TouchableOpacity onPress={() => setCat(null)} style={[s.tab, !cat && { backgroundColor: C.orange }]}>
            <Text style={[s.tabTxt, !cat && { color: "#fff" }]}>All</Text>
          </TouchableOpacity>
          {cats.map(ct => (
            <TouchableOpacity key={ct.code} onPress={() => setCat(ct.code)} style={[s.tab, cat === ct.code && { backgroundColor: C.orange }]}>
              <Text style={[s.tabTxt, cat === ct.code && { color: "#fff" }]}>{ct.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
        {lines.map(l => {
          const selected = l.items.find(i => i.code === sizeSel[l.key]) || l.items[0];
          const myQty = cartQtyOf(selected.code);
          const lineQty = l.items.reduce((s2, i) => s2 + cartQtyOf(i.code), 0);
          return (
            <Card key={l.key} style={[{ width: "48.5%" }, lineQty > 0 && { borderWidth: 2, borderColor: C.green }]}>
              {selected.img
                ? <Image source={{ uri: selected.img }} style={{ width: 84, height: 84, alignSelf: "center", marginVertical: 6, borderRadius: 8 }} resizeMode="contain" />
                : <Text style={{ fontSize: 34, textAlign: "center", marginVertical: 6 }}>{selected.pic}</Text>}
              <Text style={{ fontWeight: "700", fontSize: 12, minHeight: 44 }}>{selected.name}</Text>
              <Text style={{ color: C.mut, fontSize: 10 }}>{selected.code} · {l.uom}</Text>
              {l.items.length > 1 && (
                <>
                  <Text style={{ fontSize: 9, color: C.mut, marginTop: 2 }}>{variantKind(l.items)}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 3 }}>
                    {l.items.map(i => (
                      <TouchableOpacity key={i.code} onPress={() => setSizeSel({ ...sizeSel, [l.key]: i.code })}
                        style={[s.size, selected.code === i.code && { backgroundColor: C.navy, borderColor: C.navy }]}>
                        <Text style={{ fontSize: 9, color: selected.code === i.code ? "#fff" : C.ink }}>
                          {variantLabel(i)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                <Text style={{ fontWeight: "800", color: C.navy }}>AED {fmt(l.price)}</Text>
                <Chip label={`Stock ${selected.stock}`} color={selected.stock > 0 ? C.green : C.red} />
              </View>
              <Text style={{ fontSize: 10, color: C.mut, marginVertical: 3 }}>
                Alloc {l.allocated} · Used {l.used} · <Text style={{ color: l.balance > 0 ? C.green : C.red, fontWeight: "700" }}>Bal {l.balance}</Text>
              </Text>
              {selected.stock <= 0 && <Text style={{ fontSize: 9, color: C.amber }}>No stock — DOD to be advised</Text>}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 5 }}>
                <TouchableOpacity style={s.step} disabled={myQty === 0} onPress={() => subtractOne(selected.code)}>
                  <Text style={[s.stepTxt, myQty === 0 && { color: C.line }]}>−</Text>
                </TouchableOpacity>
                <Text style={{ minWidth: 34, textAlign: "center", fontWeight: "800", fontSize: 15 }}>{myQty}</Text>
                <TouchableOpacity style={[s.step, { backgroundColor: lineQty > 0 ? C.green : C.navy, borderColor: "transparent" }]}
                  onPress={() => addOne(l, selected.code)}>
                  <Text style={[s.stepTxt, { color: "#fff" }]}>＋</Text>
                </TouchableOpacity>
              </View>
            </Card>
          );
        })}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  tab: { borderWidth: 1.5, borderColor: C.line, backgroundColor: "#fff", borderRadius: 20, paddingHorizontal: 13, paddingVertical: 7, marginRight: 7 },
  tabTxt: { fontSize: 12, color: C.ink },
  size: { borderWidth: 1, borderColor: C.line, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, marginRight: 4, backgroundColor: "#fff" },
  step: { width: 32, height: 32, borderRadius: 8, borderWidth: 1.5, borderColor: C.line, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  stepTxt: { fontSize: 17, fontWeight: "700", color: C.navy }
});
