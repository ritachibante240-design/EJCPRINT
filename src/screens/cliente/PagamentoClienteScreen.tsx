import React from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import PagamentoModal from '../../components/PagamentoModal';

export default function PagamentoClienteScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const pedido = route.params?.pedido;
  return <PagamentoModal visible pedidoId={pedido.id} numeroPedido={pedido.numero} cliente={pedido.cliente} total={Number(pedido.total ?? 0)} tipoInicial={route.params?.tipo ?? 'SINAL'} valorInicial={route.params?.valor} onClose={() => navigation.goBack()} onEnviado={() => undefined} />;
}
