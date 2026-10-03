import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PedidosScreen from '../screens/admin/PedidosScreen';
import CaixaScreen from '../screens/admin/CaixaScreen';
import StockScreen from '../screens/admin/StockScreen';
import RelatoriosScreen from '../screens/admin/RelatoriosScreen';
import { terminarSessaoAdministrador } from '../services/adminAuthService';

export type AdminTabParamList = {
  PedidosTab: undefined;
  CaixaTab: undefined;
  MateriaisTab: undefined;
  RelatoriosTab: undefined;
};

const Tab = createBottomTabNavigator<AdminTabParamList>();

export default function AdminTabs() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isDesktop = Platform.OS === 'web' && width >= 768;

  return (
    <Tab.Navigator
      screenOptions={({ route, navigation }) => ({
        headerShown: true,
        headerTitle: 'EJC Print',
        headerTitleStyle: { color: '#102A43', fontWeight: 'bold', fontSize: 18 },
        headerStyle: {
          backgroundColor: '#FFFFFF',
          borderBottomWidth: 1,
          borderBottomColor: '#E6EAF0',
          shadowColor: 'transparent',
          elevation: 0,
        },
        headerRight: () => (
          <Pressable
            accessibilityLabel="Terminar sessão"
            hitSlop={10}
            style={[styles.logoutBtn, isDesktop && styles.logoutBtnDesktop]}
            onPress={() => {
              void terminarSessaoAdministrador().finally(() =>
                navigation.getParent()?.reset({ index: 0, routes: [{ name: 'Acesso' }] })
              );
            }}
          >
            {isDesktop && <Text style={styles.logoutText}>Terminar sessão</Text>}
            <Ionicons name="log-out-outline" size={22} color="#102A43" />
          </Pressable>
        ),
        tabBarActiveTintColor: '#102A43',
        tabBarInactiveTintColor: '#829AB1',
        tabBarStyle: [
          styles.tabBar,
          { height: 68 + insets.bottom, paddingBottom: 8 + insets.bottom },
          isDesktop && styles.tabBarDesktop,
        ],
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, focused }) => {
          let iconName: keyof typeof Ionicons.glyphMap;
          switch (route.name) {
            case 'PedidosTab':
              iconName = focused ? 'file-tray-full' : 'file-tray-full-outline';
              break;
            case 'CaixaTab':
              iconName = focused ? 'wallet' : 'wallet-outline';
              break;
            case 'MateriaisTab':
              iconName = focused ? 'cube' : 'cube-outline';
              break;
            case 'RelatoriosTab':
              iconName = focused ? 'bar-chart' : 'bar-chart-outline';
              break;
            default:
              iconName = 'ellipse-outline';
          }
          return <Ionicons name={iconName} size={focused ? 24 : 22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="PedidosTab" component={PedidosScreen} options={{ tabBarLabel: 'Pedidos' }} />
      <Tab.Screen name="CaixaTab" component={CaixaScreen} options={{ tabBarLabel: 'Caixa' }} />
      <Tab.Screen name="MateriaisTab" component={StockScreen} options={{ tabBarLabel: 'Materiais' }} />
      <Tab.Screen name="RelatoriosTab" component={RelatoriosScreen} options={{ tabBarLabel: 'Relatórios' }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  logoutBtn: {
    marginRight: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logoutBtnDesktop: {
    marginRight: 32,
    backgroundColor: '#F0F4F8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  logoutText: {
    color: '#102A43',
    fontSize: 13,
    fontWeight: '600',
  },
  tabBar: {
    height: 68,
    paddingTop: 7,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
    borderTopColor: '#E6EAF0',
  },
  tabBarDesktop: {
    height: 62,
    paddingTop: 6,
    paddingBottom: 6,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
    marginHorizontal: 'auto',
    borderRadius: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E6EAF0',
    shadowColor: '#102A43',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
});
