import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import InicioScreen from '../screens/cliente/InicioScreen';
import ServicosScreen from '../screens/cliente/ServicosScreen';
import NovoPedidoScreen from '../screens/cliente/NovoPedidoScreen';
import MeusPedidosScreen from '../screens/cliente/MeusPedidosScreen';
import PagamentoClienteScreen from '../screens/cliente/PagamentoClienteScreen';
import AdminTabs from './AdminTabs';
import PedidosScreen from '../screens/admin/PedidosScreen';
import VendasScreen from '../screens/admin/VendasScreen';
import DespesasScreen from '../screens/admin/DespesasScreen';
import StockScreen from '../screens/admin/StockScreen';
import PagamentosPendentesScreen from '../screens/admin/PagamentosPendentesScreen';
import LoginAdministradorScreen from '../screens/admin/LoginAdministradorScreen';
import RecuperarPasswordScreen from '../screens/admin/RecuperarPasswordScreen';
import AcessoScreen from '../screens/AcessoScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Acesso"
        screenOptions={{
          headerTintColor: '#102A43',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Stack.Screen name="Acesso" component={AcessoScreen} options={{ headerShown: false }} />
        <Stack.Screen
          name="Inicio"
          component={InicioScreen}
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="Servicos"
          component={ServicosScreen}
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="NovoPedido"
          component={NovoPedidoScreen}
          options={{ title: 'Novo Pedido' }}
        />

        <Stack.Screen
          name="MeusPedidos"
          component={MeusPedidosScreen}
          options={{ title: 'Meus Pedidos' }}
        />

        <Stack.Screen
          name="LoginAdministrador"
          component={LoginAdministradorScreen}
          options={{ title: 'EJC Print', headerShown: false }}
        />
        <Stack.Screen name="RecuperarPassword" component={RecuperarPasswordScreen} options={{ title: 'EJC Print' }} />
        <Stack.Screen name="Dashboard" component={AdminTabs} options={{ headerShown: false, gestureEnabled: false }} />

        <Stack.Screen
          name="PedidosAdmin"
          component={PedidosScreen}
          options={{ title: 'Gestão de Pedidos' }}
        />

        <Stack.Screen
          name="Vendas"
          component={VendasScreen}
          options={{ title: 'Vendas e Pagamentos' }}
        />

        <Stack.Screen
          name="Despesas"
          component={DespesasScreen}
          options={{ title: 'Despesas' }}
        />

        <Stack.Screen
          name="Stock"
          component={StockScreen}
          options={{ title: 'Gestão de Stock' }}
        />
        <Stack.Screen name="PagamentoCliente" component={PagamentoClienteScreen} options={{ title: 'Pagamento do pedido' }} />
        <Stack.Screen name="PagamentosPendentes" component={PagamentosPendentesScreen} options={{ headerShown: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
