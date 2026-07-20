import React from "react";
import { Text } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StoreProvider, useStore } from "./src/store";
import { C } from "./src/theme";

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

function EmployeeTabs() {
  const { orderCart, approvalCart } = useStore();
  const n = orderCart.length + approvalCart.length;
  return (
    <Tab.Navigator>
      <Tab.Screen name="Shop" component={ShopScreen} options={tabOpts("🛒")} />
      <Tab.Screen name="Carts" component={CartsScreen}
        options={{ ...tabOpts("🧺"), tabBarBadge: n || undefined }} />
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
  const { user } = useStore();
  if (!user) return <LoginScreen />;
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
