import React from "react";
import DashboardScreen from "../screens/admin/DashboardScreen";
import { colors, fontWeights, radii, spacing } from '../theme';
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PedidosScreen from "../screens/admin/PedidosScreen";
import CaixaScreen from "../screens/admin/CaixaScreen";
import StockScreen from "../screens/admin/StockScreen";
import RelatoriosScreen from "../screens/admin/RelatoriosScreen";
import { terminarSessaoAdministrador } from "../services/adminAuthService";

export type AdminTabParamList = {
  Resumo: undefined;
  PedidosTab: undefined;
  CaixaTab: undefined;
  MateriaisTab: undefined;
  RelatoriosTab: undefined;
};

const Tab = createBottomTabNavigator<AdminTabParamList>();

export default function AdminTabs() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isDesktop = Platform.OS === "web" && width >= 768;

  return (
    <Tab.Navigator
      screenOptions={({ route, navigation }) => ({
        headerShown: true,
        headerTitle: () => (
          <View style={styles.headerBrand}>
            <Image
              source={require("../../assets/ejc-print-logo.png")}
              style={styles.headerLogo}
              resizeMode="contain"
            />
            <Text style={styles.headerTitle}>EJC Print</Text>
          </View>
        ),
        headerStyle: {
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          shadowColor: "transparent",
          elevation: 0,
        },
        headerRight: () => (
          <Pressable
            accessibilityLabel="Terminar sessão"
            hitSlop={10}
            style={[styles.logoutBtn, isDesktop && styles.logoutBtnDesktop]}
            onPress={() => {
              void terminarSessaoAdministrador().finally(() =>
                navigation
                  .getParent()
                  ?.reset({ index: 0, routes: [{ name: "Acesso" }] }),
              );
            }}
          >
            {isDesktop && (
              <Text style={styles.logoutText}>Terminar sessão</Text>
            )}
            <Ionicons name="log-out-outline" size={22} color={colors.brand} />
          </Pressable>
        ),
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.subtle,
        tabBarStyle: [
          styles.tabBar,
          { height: 68 + insets.bottom, paddingBottom: 8 + insets.bottom },
          isDesktop && styles.tabBarDesktop,
        ],
        tabBarLabelStyle: { fontSize: 11, fontWeight: fontWeights.semibold },
        tabBarIcon: ({ color, focused }) => {
          let iconName: keyof typeof Ionicons.glyphMap;
          switch (route.name) {
            case "Resumo":
              iconName = focused ? "grid" : "grid-outline";
              break;
            case "PedidosTab":
              iconName = focused ? "file-tray-full" : "file-tray-full-outline";
              break;
            case "CaixaTab":
              iconName = focused ? "wallet" : "wallet-outline";
              break;
            case "MateriaisTab":
              iconName = focused ? "cube" : "cube-outline";
              break;
            case "RelatoriosTab":
              iconName = focused ? "bar-chart" : "bar-chart-outline";
              break;
            default:
              iconName = "ellipse-outline";
          }
          return (
            <Ionicons name={iconName} size={focused ? 24 : 22} color={color} />
          );
        },
      })}
      initialRouteName="Resumo"
    >
      <Tab.Screen
        name="Resumo"
        component={DashboardScreen}
        options={{ tabBarLabel: "Resumo" }}
      />
      <Tab.Screen
        name="PedidosTab"
        component={PedidosScreen}
        options={{ tabBarLabel: "Pedidos" }}
      />
      <Tab.Screen
        name="CaixaTab"
        component={CaixaScreen}
        options={{ tabBarLabel: "Caixa" }}
      />
      <Tab.Screen
        name="MateriaisTab"
        component={StockScreen}
        options={{ tabBarLabel: "Materiais" }}
      />
      <Tab.Screen
        name="RelatoriosTab"
        component={RelatoriosScreen}
        options={{ tabBarLabel: "Relatórios" }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  headerBrand: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  headerLogo: { width: 48, height: 30 },
  headerTitle: { color: colors.brand, fontWeight: fontWeights.bold, fontSize: 17 },
  logoutBtn: {
    marginRight: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  logoutBtnDesktop: {
    marginRight: spacing.xxxxl,
    backgroundColor: colors.brandSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 8,
  },
  logoutText: {
    color: colors.brand,
    fontSize: 13,
    fontWeight: fontWeights.semibold,
  },
  tabBar: {
    height: 68,
    paddingTop: 7,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
  },
  tabBarDesktop: {
    height: 62,
    paddingTop: 6,
    paddingBottom: 6,
    maxWidth: 680,
    width: "100%",
    alignSelf: "center",
    marginHorizontal: "auto",
    borderRadius: radii.lg,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
});
