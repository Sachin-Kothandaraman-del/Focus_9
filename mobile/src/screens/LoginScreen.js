import React, { useState } from "react";
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { useStore } from "../store";
import { Btn } from "../components";
import { C } from "../theme";

export default function LoginScreen() {
  const { login } = useStore();
  const [empId, setEmpId] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!empId || !pin) return Alert.alert("Login", "Enter your Employee ID and PIN");
    setBusy(true);
    try {
      await login(empId, pin);
    } catch (e) {
      Alert.alert("Login failed", e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Text style={s.logo}>PRO<Text style={{ color: C.orange }}>SAFE</Text></Text>
      <Text style={s.sub}>EGA End-to-End Distribution{"\n"}Employee Ordering App</Text>
      <View style={s.form}>
        <Text style={s.lbl}>EMPLOYEE ID</Text>
        <TextInput style={s.inp} value={empId} onChangeText={setEmpId}
          autoCapitalize="characters" placeholder="E1001" placeholderTextColor="#7d99b5" />
        <Text style={s.lbl}>PIN</Text>
        <TextInput style={s.inp} value={pin} onChangeText={setPin}
          secureTextEntry keyboardType="number-pad" placeholder="••••" placeholderTextColor="#7d99b5" />
        <Btn title={busy ? "Signing in…" : "Sign In"} onPress={submit} disabled={busy} />
        <Text style={s.hint}>Demo users: E1001/1111 · E1002/2222 · E1003/3333{"\n"}Approver A2001/4444 · Admin S3001/5555</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.navy, justifyContent: "center", padding: 28 },
  logo: { color: "#fff", fontSize: 40, fontWeight: "800", letterSpacing: 1 },
  sub: { color: "#a9c3da", marginTop: 6, marginBottom: 30, lineHeight: 20 },
  form: { backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 16, padding: 18 },
  lbl: { color: "#a9c3da", fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 5, marginTop: 10 },
  inp: { backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", paddingHorizontal: 14, paddingVertical: 11, fontSize: 16 },
  hint: { color: "#7d99b5", fontSize: 11, marginTop: 14, lineHeight: 16, textAlign: "center" }
});
