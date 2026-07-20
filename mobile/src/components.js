import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { C, STATUS } from "./theme";

export const fmt = n => Number(n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtDT = iso => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB") + " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};

export function Card({ children, style }) {
  return <View style={[s.card, style]}>{children}</View>;
}
export function Btn({ title, onPress, color = C.orange, disabled, small, style }) {
  return (
    <TouchableOpacity
      onPress={onPress} disabled={disabled}
      style={[s.btn, small && s.btnSm, { backgroundColor: disabled ? "#c6cfd8" : color }, style]}>
      <Text style={[s.btnTxt, small && { fontSize: 12 }]}>{title}</Text>
    </TouchableOpacity>
  );
}
export function Chip({ label, color = C.mut }) {
  return (
    <View style={[s.chip, { backgroundColor: color + "22" }]}>
      <Text style={{ color, fontSize: 11, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}
export function StatusChip({ status }) {
  const st = STATUS[status] || { label: status, color: C.mut };
  return <Chip label={st.label} color={st.color} />;
}
export function Empty({ icon = "📭", text }) {
  return (
    <View style={{ alignItems: "center", padding: 40 }}>
      <Text style={{ fontSize: 40, marginBottom: 8 }}>{icon}</Text>
      <Text style={{ color: C.mut, textAlign: "center" }}>{text}</Text>
    </View>
  );
}
export function Loading() {
  return <ActivityIndicator size="large" color={C.orange} style={{ marginTop: 40 }} />;
}
export function KV({ k, v }) {
  return (
    <View style={{ flexDirection: "row", paddingVertical: 3 }}>
      <Text style={{ color: C.mut, width: 130, fontSize: 13 }}>{k}</Text>
      <Text style={{ color: C.ink, flex: 1, fontSize: 13, fontWeight: "600" }}>{v}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 12,
    shadowColor: C.navy, shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2
  },
  btn: { borderRadius: 11, paddingVertical: 12, paddingHorizontal: 16, alignItems: "center", marginTop: 8 },
  btnSm: { paddingVertical: 8, paddingHorizontal: 12, marginTop: 0 },
  btnTxt: { color: "#fff", fontWeight: "700", fontSize: 14 },
  chip: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, alignSelf: "flex-start" }
});
