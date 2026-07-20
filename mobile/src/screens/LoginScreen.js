import React, { useState } from "react";
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Alert, TouchableOpacity, ScrollView } from "react-native";
import { useStore } from "../store";
import { Btn } from "../components";
import { C } from "../theme";

export default function LoginScreen() {
  const { login, signup } = useStore();
  const [mode, setMode] = useState("login"); // login | signup
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      if (mode === "login") {
        if (!email || !password) return Alert.alert("Sign in", "Enter your e-mail and password");
        await login(email, password);
      } else {
        if (!name || !email || !password) return Alert.alert("Create account", "Name, e-mail and password are required");
        const r = await signup({ name, email, phone, password });
        if (r.emailConfirmationRequired) {
          Alert.alert("Confirm your e-mail", "We sent you a confirmation link. Confirm it, then sign in.");
          setMode("login");
        } else if (r.pendingActivation) {
          Alert.alert("Account created", r.message);
        }
      }
    } catch (e) {
      Alert.alert(mode === "login" ? "Sign in failed" : "Sign up failed", e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
        <Text style={s.logo}>PRO<Text style={{ color: C.orange }}>SAFE</Text></Text>
        <Text style={s.sub}>EGA End-to-End Distribution{"\n"}Employee Ordering App</Text>
        <View style={s.form}>
          <View style={s.tabs}>
            <TouchableOpacity style={[s.tabBtn, mode === "login" && s.tabOn]} onPress={() => setMode("login")}>
              <Text style={[s.tabTxt, mode === "login" && { color: "#fff" }]}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.tabBtn, mode === "signup" && s.tabOn]} onPress={() => setMode("signup")}>
              <Text style={[s.tabTxt, mode === "signup" && { color: "#fff" }]}>Create Account</Text>
            </TouchableOpacity>
          </View>
          {mode === "signup" && (
            <>
              <Text style={s.lbl}>FULL NAME</Text>
              <TextInput style={s.inp} value={name} onChangeText={setName} placeholder="Ahmed Al Mansoori" placeholderTextColor="#7d99b5" />
              <Text style={s.lbl}>MOBILE (OPTIONAL)</Text>
              <TextInput style={s.inp} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+971-50-…" placeholderTextColor="#7d99b5" />
            </>
          )}
          <Text style={s.lbl}>E-MAIL</Text>
          <TextInput style={s.inp} value={email} onChangeText={setEmail}
            autoCapitalize="none" keyboardType="email-address" placeholder="you@company.com" placeholderTextColor="#7d99b5" />
          <Text style={s.lbl}>PASSWORD</Text>
          <TextInput style={s.inp} value={password} onChangeText={setPassword}
            secureTextEntry placeholder={mode === "signup" ? "min 8 characters" : "••••••••"} placeholderTextColor="#7d99b5" />
          <Btn title={busy ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account"} onPress={submit} disabled={busy} />
          {mode === "signup" && (
            <Text style={s.hint}>New accounts are activated by the PROSAFE admin, who assigns your company and approved price list.</Text>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.navy, padding: 28 },
  logo: { color: "#fff", fontSize: 40, fontWeight: "800", letterSpacing: 1 },
  sub: { color: "#a9c3da", marginTop: 6, marginBottom: 26, lineHeight: 20 },
  form: { backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 16, padding: 18 },
  tabs: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 10, padding: 3, marginBottom: 6 },
  tabBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: "center" },
  tabOn: { backgroundColor: C.orange },
  tabTxt: { color: "#a9c3da", fontWeight: "700", fontSize: 13 },
  lbl: { color: "#a9c3da", fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 5, marginTop: 12 },
  inp: { backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", paddingHorizontal: 14, paddingVertical: 11, fontSize: 16 },
  hint: { color: "#7d99b5", fontSize: 11, marginTop: 12, lineHeight: 16, textAlign: "center" }
});
