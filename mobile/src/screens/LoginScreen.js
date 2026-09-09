import React, { useState } from "react";
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Alert, TouchableOpacity, ScrollView, Image } from "react-native";
import { useStore } from "../store";
import { Btn } from "../components";
import { C } from "../theme";
import LOGO from "../logo";

/* Registration per SRS2 (Sept-26): the employee gives the two data points
   checked against the Employee Master — Employee ID and Mobile Phone — and
   the rest of the form is filled in from that record. If the two do not
   match, registration is refused. */

const LIMITS = { empId: 15, phone: 15, name: 30, customer: 35, dept: 25, location: 25, telephone: 15, email: 30, username: 8 };
const BLANK = {
  empId: "", phone: "", name: "", customer: "", dept: "", location: "",
  telephone: "", email: "", username: "", password: "", confirmPassword: ""
};

/* Defined outside the screen so typing does not remount the inputs. */
function Field({ label, k, value, onChange, ...rest }) {
  return (
    <>
      <Text style={s.lbl}>{label}</Text>
      <TextInput style={s.inp} value={value} onChangeText={onChange} maxLength={LIMITS[k]}
        placeholderTextColor="#7d99b5" {...rest} />
    </>
  );
}
function Ro({ label, value }) {
  return (
    <>
      <Text style={s.lbl}>{label}</Text>
      <TextInput style={[s.inp, s.ro]} value={value} editable={false} />
    </>
  );
}

export default function LoginScreen() {
  const { login, signup, lookupEmployee } = useStore();
  const [mode, setMode] = useState("login");          // login | signup
  const [ident, setIdent] = useState("");             // user name or e-mail
  const [password, setPassword] = useState("");
  const [f, setF] = useState(BLANK);
  const [emp, setEmp] = useState(null);               // verified Employee Master record
  const [busy, setBusy] = useState(false);

  const set = k => v => setF(p => ({ ...p, [k]: String(v).slice(0, LIMITS[k] || 60) }));

  function toMode(next) {
    setMode(next);
    if (next === "signup") { setF(BLANK); setEmp(null); }
  }

  async function verify() {
    if (!f.empId || !f.phone) return Alert.alert("Register", "Employee ID and Mobile Phone are both required");
    setBusy(true);
    try {
      const r = await lookupEmployee({ empId: f.empId, phone: f.phone });
      setEmp(r.employee);
      setF(p => ({
        ...p,
        name: r.employee.name, phone: r.employee.phone,
        customer: r.employee.customerName, dept: r.employee.deptName || r.employee.dept,
        location: r.employee.locationName || r.employee.location,
        telephone: r.employee.telephone, email: r.employee.email
      }));
    } catch (e) {
      setEmp(null);
      Alert.alert("Registration not possible", e.message);
    } finally { setBusy(false); }
  }

  async function submit() {
    setBusy(true);
    try {
      if (mode === "login") {
        if (!ident || !password) return Alert.alert("Sign in", "Enter your user name (or e-mail) and password");
        await login(ident, password);
      } else {
        if (!f.username) return Alert.alert("Register", "Choose a user name (up to 8 characters)");
        if (f.password.length < 6) return Alert.alert("Register", "Password must be at least 6 characters");
        if (f.password !== f.confirmPassword) return Alert.alert("Register", "Password and Confirm Password do not match");
        const r = await signup(f);
        if (r.emailConfirmationRequired) {
          Alert.alert("Confirm your e-mail", "We sent you a confirmation link. Confirm it, then sign in.");
          setMode("login");
        } else if (r.pendingActivation) {
          Alert.alert("Registered", r.message);
        }
      }
    } catch (e) {
      Alert.alert(mode === "login" ? "Sign in failed" : "Registration failed", e.message);
    } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
        <View style={s.brandcard}>
          <Image source={{ uri: LOGO }} style={s.logoimg} resizeMode="contain" />
        </View>
        <Text style={s.sub}>EGA End-to-End Distribution{"\n"}Employee Ordering App</Text>
        <View style={s.form}>
          <View style={s.tabs}>
            <TouchableOpacity style={[s.tabBtn, mode === "login" && s.tabOn]} onPress={() => toMode("login")}>
              <Text style={[s.tabTxt, mode === "login" && { color: "#fff" }]}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.tabBtn, mode === "signup" && s.tabOn]} onPress={() => toMode("signup")}>
              <Text style={[s.tabTxt, mode === "signup" && { color: "#fff" }]}>Register</Text>
            </TouchableOpacity>
          </View>

          {mode === "login" && (
            <>
              <Text style={s.lbl}>USER NAME OR E-MAIL</Text>
              <TextInput style={s.inp} value={ident} onChangeText={setIdent}
                autoCapitalize="none" placeholder="you@company.com" placeholderTextColor="#7d99b5" />
              <Text style={s.lbl}>PASSWORD</Text>
              <TextInput style={s.inp} value={password} onChangeText={setPassword}
                secureTextEntry placeholder="••••••" placeholderTextColor="#7d99b5" />
              <Btn title={busy ? "Please wait…" : "Sign In"} onPress={submit} disabled={busy} />
            </>
          )}

          {mode === "signup" && !emp && (
            <>
              <Text style={s.hint}>
                Step 1 of 2 — your Employee ID and Mobile Phone are checked against the
                PROSAFE Employee Master. Both must match before you can register.
              </Text>
              <Field label="EMPLOYEE ID" k="empId" value={f.empId} onChange={set("empId")} placeholder="ID001" autoCapitalize="characters" />
              <Field label="MOBILE PHONE" k="phone" value={f.phone} onChange={set("phone")} placeholder="+971 50 …" keyboardType="phone-pad" />
              <Btn title={busy ? "Checking…" : "Verify & continue"} onPress={verify} disabled={busy} />
            </>
          )}

          {mode === "signup" && emp && (
            <>
              <Text style={s.hint}>Step 2 of 2 — verified as {emp.name} ({emp.empId}).</Text>
              <Ro label="EMPLOYEE ID" value={f.empId} />
              <Ro label="MOBILE PHONE" value={f.phone} />
              <Ro label="EMPLOYEE NAME" value={f.name} />
              <Ro label="CUSTOMER NAME" value={f.customer} />
              <Ro label="DEPARTMENT" value={f.dept} />
              <Ro label="LOCATION" value={f.location} />
              <Field label="TELEPHONE" k="telephone" value={f.telephone} onChange={set("telephone")} keyboardType="phone-pad" />
              <Field label="E-MAIL" k="email" value={f.email} onChange={set("email")} autoCapitalize="none" keyboardType="email-address" />
              <Field label="USER NAME (MAX 8)" k="username" value={f.username} onChange={set("username")} autoCapitalize="none" placeholder="your choice" />
              <Field label="PASSWORD (MIN 6)" k="password" value={f.password} onChange={set("password")} secureTextEntry />
              <Field label="CONFIRM PASSWORD" k="confirmPassword" value={f.confirmPassword} onChange={set("confirmPassword")} secureTextEntry />
              <Btn title={busy ? "Please wait…" : "Register"} onPress={submit} disabled={busy} />
              <Btn title="← Back" color="#8195a8" onPress={() => setEmp(null)} />
            </>
          )}

          {mode === "signup" && (
            <Text style={s.hint}>
              After registering, your profile is Pending for Activation — the PROSAFE admin
              assigns your approved price list and stores before you can shop.
            </Text>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.navy, padding: 28 },
  /* The logo artwork is flat colour on white, so on the navy background it
     sits on a white card rather than being knocked out. */
  brandcard: { backgroundColor: "#fff", borderRadius: 12, padding: 12, alignSelf: "center", width: 230 },
  logoimg: { width: "100%", height: 152 },
  sub: { color: "#a9c3da", marginTop: 12, marginBottom: 26, lineHeight: 20, textAlign: "center" },
  form: { backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 16, padding: 18 },
  tabs: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 10, padding: 3, marginBottom: 6 },
  tabBtn: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: "center" },
  tabOn: { backgroundColor: C.orange },
  tabTxt: { color: "#a9c3da", fontWeight: "700", fontSize: 13 },
  lbl: { color: "#a9c3da", fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 5, marginTop: 12 },
  inp: { backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff", paddingHorizontal: 14, paddingVertical: 11, fontSize: 16 },
  ro: { opacity: 0.65 },
  hint: { color: "#7d99b5", fontSize: 11, marginTop: 12, lineHeight: 16, textAlign: "center" }
});
