import React from "react";
import { Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StoreProvider, useStore } from "./src/store";
import { C } from "./src/theme";
import { Btn } from "./src/components";

import LoginScreen from "./src/screens/LoginScreen";
import ShopScreen from "./src/screens/ShopScreen";
import CartsScreen from "./src/screens/CartsScreen";
import OrdersScreen from "./src/screens/OrdersScreen";
import OrderDetailScreen from "./src/screens/OrderDetailScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import ApprovalsScreen from "./src/screens/ApprovalsScreen";
import FulfilScreen from "./src/screens/FulfilScreen";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const navTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: C.bg, primary: C.orange } };

const tabOpts = icon => ({
  tabBarIcon: ({ focused }) => <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.45 }}>{icon}</Text>,
  tabBarActiveTintColor: C.orange,
  tabBarInactiveTintColor: C.mut,
  headerStyle: { backgroundColor: C.navy },
  headerTintColor: "#fff",
  headerTitleStyle: { fontWeight: "700" }
});

function PendingScreen() {
  const { user, refreshMe, logout } = useStore();
  return (
    <View style={{ flex: 1, backgroundColor: C.navy, justifyContent: "center", padding: 30 }}>
      <Text style={{ fontSize: 44, textAlign: "center", marginBottom: 14 }}>⏳</Text>
      <Text style={{ color: "#fff", fontSize: 19, fontWeight: "800", textAlign: "center" }}>
        Account awaiting activation
      </Text>
      <Text style={{ color: "#a9c3da", textAlign: "center", marginTop: 10, lineHeight: 20 }}>
        Hi {user?.name}. The PROSAFE admin still needs to assign your company, department and approved price list.
        You'll be able to shop as soon as that's done.
      </Text>
      <Btn title="Check again" onPress={refreshMe} />
      <Btn title="Sign out" color="#8195a8" onPress={logout} />
    </View>
  );
}

function EmployeeTabs() {
  const { orderCart, approvalCart } = useStore();
  const n = orderCart.length + approvalCart.length;
  return (
    <Tab.Navigator>
      <Tab.Screen name="Shop" component={ShopScreen} options={tabOpts("🛒")} />
      <Tab.Screen name="Carts" component={CartsScreen} options={{ ...tabOpts("🧺"), tabBarBadge: n || undefined }} />
      <Tab.Screen name="Orders" component={OrdersScreen} options={tabOpts("📦")} />
      <Tab.Screen name="My Limits" component={ProfileScreen} options={tabOpts("👤")} />
    </Tab.Navigator>
  );
}
function ApproverTabs() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Approvals" component={ApprovalsScreen} options={tabOpts("✅")} />
      <Tab.Screen name="All Orders" component={OrdersScreen} options={tabOpts("🗂️")} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={tabOpts("👤")} />
    </Tab.Navigator>
  );
}
function AdminTabs() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Fulfilment" component={FulfilScreen} options={tabOpts("🚚")} />
      <Tab.Screen name="All Orders" component={OrdersScreen} options={tabOpts("🗂️")} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={tabOpts("👤")} />
    </Tab.Navigator>
  );
}

function Root() {
  const { user, pending } = useStore();
  if (!user) return <LoginScreen />;
  if (user.role === "employee" && pending) return <PendingScreen />;
  const Tabs = user.role === "employee" ? EmployeeTabs : user.role === "approver" ? ApproverTabs : AdminTabs;
  return (
    <Stack.Navigator>
      <Stack.Screen name="Main" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen name="OrderDetail" component={OrderDetailScreen}
        options={{ title: "Order", headerStyle: { backgroundColor: C.navy }, headerTintColor: "#fff" }} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <NavigationContainer theme={navTheme}>
          <StatusBar style="light" />
          <Root />
        </NavigationContainer>
      </StoreProvider>
    </SafeAreaProvider>
  );
}
