import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert, Modal, StyleSheet } from "react-native";
import { useStore } from "../store";
import { api } from "../api";
import { Card, Btn, Chip, fmt, Empty } from "../components";
import { C } from "../theme";

/* My Carts (SRS2): server-side Order & Approval carts with 10-minute countdown,
   stock / delivery-date preview, Proceed → Order Screen → Place the Order. */
export default function CartsScreen({ navigation }) {
  const { catalog, cart, remainingSec, removeCartLine, refreshCart, refreshCatalog, user } = useStore();
  const [review, setReview] = useState(null); // "order" | "approval" | null
  const [busy, setBusy] = useState(false);

  const total = lines => lines.reduce((s2, x) => s2 + x.amount, 0);
  const profileOf = plId => catalog?.profiles.find(p => p.priceList.id === plId) || catalog?.profiles?.[0];
  const headLines = cart.order.length ? cart.order : cart.approval;
  const headProfile = headLines.length ? profileOf(headLines[0].plId) : null;

  async function place(kind) {
    setBusy(true);
    try {
      const o = await api("/api/orders", { method: "POST", body: { kind } });
      await refreshCart(); await refreshCatalog();
      setReview(null);
      Alert.alert(
        kind === "order" ? "Order placed" : "Sent for approval",
        kind === "order"
          ? `Order ${o.ref} placed — moved to Orders in Progress.${o.so ? `\nERP Sales Order ${o.so} created.` : ""}\nReserved qtys were stock-transferred to the Reservation store.`
          : `Order ${o.ref} moved to the Order Approval bucket.\nEGA has 3 days to approve, otherwise it is cancelled automatically.`
      );
      navigation.navigate("Orders");
    } catch (e) {
      Alert.alert("Could not place order", e.message);
      await refreshCart(); await refreshCatalog();
    } finally {
      setBusy(false);
    }
  }

  function CartSection({ kind, lines, title, chipLabel, chipColor }) {
    return (
      <>
        <Text style={s.sec}>{title} <Chip label={chipLabel} color={chipColor} /></Text>
        <Card>
          {lines.length === 0 ? (
            <Text style={{ color: C.mut, textAlign: "center", padding: 12 }}>Empty</Text>
          ) : (
            <>
              {lines.map(x => (
                <View key={x.id} style={s.line}>
                  <Text style={{ fontSize: 22, marginRight: 10 }}>{x.pic}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "700", fontSize: 13 }}>{x.name}</Text>
                    <Text style={{ color: C.mut, fontSize: 11 }}>{x.qty} {x.uom} × AED {fmt(x.price)}</Text>
                    <Text style={{ fontSize: 10, color: x.stockStatus === "yes" ? C.green : x.stockStatus === "partial" ? C.amber : C.red }}>
                      {x.stockStatus === "yes" ? `In stock — deliver by ${x.deliveryDate}`
                        : x.stockStatus === "partial" ? `${x.reservedQty} reserved (by ${x.deliveryDate}) + ${x.dodQty} DOD to be advised`
                        : "No stock — DOD to be advised"}
                    </Text>
                  </View>
                  <Text style={{ fontWeight: "700", fontSize: 13 }}>AED {fmt(x.amount)}</Text>
                  <TouchableOpacity onPress={() => removeCartLine(x.id)} style={{ padding: 6 }}>
                    <Text style={{ color: C.red }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <Btn title={`Proceed to Order Screen (AED ${fmt(total(lines))})`}
                color={kind === "order" ? C.orange : C.navy}
                onPress={() => setReview(kind)} />
            </>
          )}
        </Card>
      </>
    );
  }

  const reviewLines = review === "order" ? cart.order : cart.approval;
  const reviewProfile = reviewLines.length ? profileOf(reviewLines[0].plId) : null;
  const previewRows = [];
  for (const x of reviewLines) {
    if (x.reservedQty >= x.qty) previewRows.push({ ...x, rid: x.id, qty: x.qty, st: "Yes", date: x.deliveryDate, remark: "" });
    else if (x.reservedQty <= 0) previewRows.push({ ...x, rid: x.id, qty: x.qty, st: "No", date: null, remark: "DOD to be advised" });
    else {
      previewRows.push({ ...x, rid: x.id + "a", qty: x.reservedQty, st: "Yes", date: x.deliveryDate, remark: "" });
      previewRows.push({ ...x, rid: x.id + "b", qty: x.dodQty, st: "No", date: null, remark: "DOD to be advised" });
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 14 }}>
      {remainingSec != null && (cart.order.length + cart.approval.length) > 0 && (
        <Card style={{ backgroundColor: remainingSec < 120 ? "#fdecec" : "#fff8ec" }}>
          <Text style={{ fontSize: 13 }}>
            ⏱ <Text style={{ fontWeight: "800" }}>{String(Math.floor(remainingSec / 60)).padStart(2, "0")}:{String(remainingSec % 60).padStart(2, "0")}</Text> left
            to place the order — after 10 minutes the cart empties and stock is released to the Main store.
          </Text>
        </Card>
      )}
      {headProfile && (cart.order.length + cart.approval.length) > 0 && (
        <Card style={{ borderLeftWidth: 4, borderLeftColor: C.orange }}>
          <Text style={{ fontWeight: "800", color: C.navy }}>{headProfile.customer?.name} · Contract {headProfile.priceList.contract}</Text>
          <Text style={{ color: C.mut, fontSize: 11 }}>Validity {headProfile.priceList.validFrom} → {headProfile.priceList.validTill}</Text>
          <Text style={{ color: C.red, fontSize: 12, marginTop: 3, fontWeight: "600" }}>
            Total Allocated Amount — {fmt(headProfile.totals.allocatedAmount)}   ·   Total Used Amount — {fmt(headProfile.totals.usedAmount)}
          </Text>
        </Card>
      )}
      <CartSection kind="order" lines={cart.order} title="🧺 Order Cart" chipLabel="within limits" chipColor={C.green} />
      <CartSection kind="approval" lines={cart.approval} title="📨 Approval Cart" chipLabel="needs client approval" chipColor={C.amber} />
      {cart.order.length === 0 && cart.approval.length === 0 && (
        <Empty icon="🧺" text="Both carts are empty. Add items from the Shop tab." />
      )}

      {/* ---- Order screen (review before placing) ---- */}
      <Modal visible={!!review} animationType="slide" transparent onRequestClose={() => setReview(null)}>
        <View style={s.modalWrap}>
          <View style={s.modal}>
            <ScrollView>
              <Text style={{ fontSize: 17, fontWeight: "800", color: C.navy, marginBottom: 10 }}>
                Order Screen {review === "approval" ? "· FOR APPROVAL" : ""}
              </Text>
              <Card>
                <Text style={s.kv}>Contract Ref: <Text style={s.b}>{reviewProfile?.priceList.contract}</Text> · Price List: <Text style={s.b}>{reviewProfile?.priceList.name}</Text></Text>
                <Text style={s.kv}>Employee: <Text style={s.b}>{user?.empId} — {user?.name}</Text> · Dept: <Text style={s.b}>{user?.dept || "—"}</Text></Text>
                <Text style={s.kv}>From Store: <Text style={s.b}>{cart.fromStore}</Text> → To Store: <Text style={s.b}>{cart.toStore}</Text></Text>
                <Text style={[s.kv, { color: C.mut, fontSize: 11 }]}>
                  Doc Ref & line numbers are assigned on placing. Delivery dates follow the {reviewProfile?.priceList.deliveryPeriod}-day delivery period rule.
                </Text>
              </Card>
              <Card>
                {previewRows.map((x, ix) => (
                  <View key={x.rid} style={s.line}>
                    <Text style={{ width: 22, color: C.mut, fontSize: 12 }}>{ix + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "700", fontSize: 13 }}>{x.name}</Text>
                      <Text style={{ color: C.mut, fontSize: 11 }}>{x.qty} {x.uom} × AED {fmt(x.price)}</Text>
                      <Text style={{ fontSize: 10, color: x.st === "Yes" ? C.green : C.amber }}>
                        Stock {x.st} · {x.date ? `Delivery ${x.date}` : "DOD to be advised"}
                      </Text>
                    </View>
                    <Text style={{ fontWeight: "700" }}>AED {fmt(x.qty * x.price)}</Text>
                  </View>
                ))}
                <View style={[s.line, { borderTopWidth: 1, borderColor: C.line, paddingTop: 8 }]}>
                  <Text style={{ flex: 1, fontWeight: "800" }}>Total Amount</Text>
                  <Text style={{ fontWeight: "800", color: C.navy }}>AED {fmt(total(reviewLines))}</Text>
                </View>
              </Card>
              <Btn title={busy ? "Placing…" : review === "approval" ? "📨 Place the Order (send for approval)" : "🛒 Place the Order"}
                color={review === "approval" ? C.navy : C.orange}
                disabled={busy} onPress={() => place(review)} />
              <Btn title="Back" color="#8195a8" onPress={() => setReview(null)} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  sec: { fontSize: 13, fontWeight: "700", color: C.mut, marginBottom: 6, marginTop: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  line: { flexDirection: "row", alignItems: "center", paddingVertical: 7 },
  modalWrap: { flex: 1, backgroundColor: "rgba(10,25,40,0.5)", justifyContent: "flex-end" },
  modal: { backgroundColor: C.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, maxHeight: "90%" },
  kv: { fontSize: 13, marginBottom: 3, color: C.ink },
  b: { fontWeight: "700" }
});
