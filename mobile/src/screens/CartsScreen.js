import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert, Modal, StyleSheet } from "react-native";
import { useStore } from "../store";
import { api } from "../api";
import { Card, Btn, Chip, fmt, Empty } from "../components";
import { C } from "../theme";

export default function CartsScreen({ navigation }) {
  const { catalog, orderCart, approvalCart, removeFromCart, clearCart, refreshCatalog, user } = useStore();
  const [review, setReview] = useState(null); // "order" | "approval" | null
  const [busy, setBusy] = useState(false);

  const lineOf = code => catalog?.lines.find(l => l.code === code);
  const cartTotal = cart => cart.reduce((s, x) => s + x.qty * (lineOf(x.code)?.price || 0), 0);

  async function place(kind) {
    const cart = kind === "order" ? orderCart : approvalCart;
    setBusy(true);
    try {
      const o = await api("/api/orders", {
        method: "POST",
        body: { kind, lines: cart.map(x => ({ code: x.code, qty: x.qty })), contract: catalog.priceList.contract }
      });
      clearCart(kind);
      await refreshCatalog();
      setReview(null);
      Alert.alert(
        kind === "order" ? "Order placed" : "Sent for approval",
        kind === "order"
          ? `Order ${o.ref} placed — moved to Order in Progress.${o.so ? `\nERP Sales Order ${o.so} created.` : ""}`
          : `Order ${o.ref} moved to the Order Approval bucket.`
      );
      navigation.navigate("Orders");
    } catch (e) {
      Alert.alert("Could not place order", e.message);
    } finally {
      setBusy(false);
    }
  }

  function CartSection({ kind, cart, title, chipLabel, chipColor }) {
    return (
      <>
        <Text style={s.sec}>{title} <Chip label={chipLabel} color={chipColor} /></Text>
        <Card>
          {cart.length === 0 ? (
            <Text style={{ color: C.mut, textAlign: "center", padding: 12 }}>Empty</Text>
          ) : (
            <>
              {cart.map(x => {
                const l = lineOf(x.code);
                if (!l) return null;
                return (
                  <View key={x.code} style={s.line}>
                    <Text style={{ fontSize: 22, marginRight: 10 }}>{l.item.pic}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "700", fontSize: 13 }}>{l.item.name}</Text>
                      <Text style={{ color: C.mut, fontSize: 11 }}>{x.qty} {l.item.uom} × AED {fmt(l.price)}</Text>
                    </View>
                    <Text style={{ fontWeight: "700", fontSize: 13 }}>AED {fmt(x.qty * l.price)}</Text>
                    <TouchableOpacity onPress={() => removeFromCart(kind, x.code)} style={{ padding: 6 }}>
                      <Text style={{ color: C.red }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
              <Btn title={`Proceed to Order Screen (AED ${fmt(cartTotal(cart))})`}
                color={kind === "order" ? C.orange : C.navy}
                onPress={() => setReview(kind)} />
            </>
          )}
        </Card>
      </>
    );
  }

  const reviewCart = review === "order" ? orderCart : approvalCart;

  return (
    <ScrollView contentContainerStyle={{ padding: 14 }}>
      <CartSection kind="order" cart={orderCart} title="🧺 Order Cart" chipLabel="within limits" chipColor={C.green} />
      <CartSection kind="approval" cart={approvalCart} title="📨 Approval Cart" chipLabel="needs client approval" chipColor={C.amber} />
      {orderCart.length === 0 && approvalCart.length === 0 && (
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
                <Text style={s.kv}>Contract Ref: <Text style={s.b}>{catalog?.priceList.contract}</Text></Text>
                <Text style={s.kv}>Employee: <Text style={s.b}>{user?.id} — {user?.name}</Text></Text>
                <Text style={s.kv}>Department: <Text style={s.b}>{user?.dept}</Text></Text>
                <Text style={[s.kv, { color: C.mut, fontSize: 11 }]}>Doc Ref & line numbers are assigned by the system on placing.</Text>
              </Card>
              <Card>
                {reviewCart.map((x, ix) => {
                  const l = lineOf(x.code);
                  return (
                    <View key={x.code} style={s.line}>
                      <Text style={{ width: 22, color: C.mut, fontSize: 12 }}>{ix + 1}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: "700", fontSize: 13 }}>{l.item.name}</Text>
                        <Text style={{ color: C.mut, fontSize: 11 }}>{x.qty} {l.item.uom} × AED {fmt(l.price)}</Text>
                      </View>
                      <Text style={{ fontWeight: "700" }}>AED {fmt(x.qty * l.price)}</Text>
                    </View>
                  );
                })}
                <View style={[s.line, { borderTopWidth: 1, borderColor: C.line, paddingTop: 8 }]}>
                  <Text style={{ flex: 1, fontWeight: "800" }}>Total Amount</Text>
                  <Text style={{ fontWeight: "800", color: C.navy }}>AED {fmt(cartTotal(reviewCart))}</Text>
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
