import React, { useCallback, useState } from 'react';

import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';

import { useFocusEffect } from '@react-navigation/native';
import { useResponsiveContent } from '../../hooks/useResponsive';
import { showAppAlert } from '../../components/AppAlert';


import {
  obterEstatisticasPedidos,
  obterResumoFinanceiro,
  EstatisticasPedidos,
  ResumoFinanceiro,
} from '../../services/pedidoService';
import {
  obterResumoSaidas,
  ResumoSaidas,
} from '../../services/despesaService';

const estatisticasIniciais: EstatisticasPedidos = {
  totalPedidos: 0,
  pedidosPendentes: 0,
  pedidosEntregues: 0,
  emProducao: 0,
  valorTotal: 0,
  cancelados: 0,
};

export default function DashboardScreen({
  navigation,
}: any) {
  const { contentStyle, isDesktop } = useResponsiveContent(20);
  const [estatisticas, setEstatisticas] =
    useState<EstatisticasPedidos>(estatisticasIniciais);

  const [financeiro, setFinanceiro] =
    useState<ResumoFinanceiro>({
      valorPedidos: 0,
      valorRecebido: 0,
      valorPendente: 0,
    });

  const [resumoSaidas, setResumoSaidas] =
    useState<ResumoSaidas>({
      comprasStock: 0,
      despesasOperacionais: 0,
      outros: 0,
      totalSaidas: 0,
    });

  const [carregando, setCarregando] =
    useState(true);

  async function carregarDashboard() {
    try {
      const dadosEstatisticas =
        await obterEstatisticasPedidos();
      const dadosFinanceiros =
        await obterResumoFinanceiro();
      const saidas = await obterResumoSaidas();

      setEstatisticas(dadosEstatisticas);
      setFinanceiro(dadosFinanceiros);
      setResumoSaidas(saidas);
    } catch (erro) {
      console.error(
        'Erro ao carregar Dashboard:',
        erro
      );
      showAppAlert('Dashboard indisponível', erro instanceof Error ? erro.message : 'Não foi possível carregar os dados online.');
    } finally {
      setCarregando(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      carregarDashboard();
    }, [])
  );

  const resultadoAtualCentavos =
    Math.round(financeiro.valorRecebido * 100) -
    Math.round(resumoSaidas.totalSaidas * 100);
  const resultadoAtual = resultadoAtualCentavos / 100;

  if (carregando) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />

        <Text style={styles.loadingText}>
          A carregar Dashboard...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, isDesktop && { maxWidth: 1000, width: '100%', alignSelf: 'center' }]}
    >
      <Text style={styles.title}>
        Área de atendimento
      </Text>

      <Text style={styles.subtitle}>
        Comece pela tarefa que precisa resolver agora.
      </Text>

      <Text style={styles.sectionTitle}>
        Ações rápidas
      </Text>

      <Pressable
        style={styles.menuButton}
        onPress={() => navigation.navigate('PedidosAdmin')}
      >
        <View>
          <Text style={styles.menuTitle}>Gerir pedidos</Text>
          <Text style={styles.menuDescription}>
            {estatisticas.pedidosPendentes} pedido(s) a acompanhar
          </Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </Pressable>

      <Pressable
        style={styles.menuButton}
        onPress={() => navigation.navigate('Vendas')}
      >
        <View>
          <Text style={styles.menuTitle}>Registar pagamento</Text>
          <Text style={styles.menuDescription}>
            {financeiro.valorPendente.toFixed(2)} MT ainda por receber
          </Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </Pressable>

      <Pressable
        style={styles.menuButton}
        onPress={() => navigation.navigate('Stock')}
      >
        <View>
          <Text style={styles.menuTitle}>Atualizar stock</Text>
          <Text style={styles.menuDescription}>
            Registar compras, saídas e desperdícios
          </Text>
        </View>
        <Text style={styles.arrow}>›</Text>
      </Pressable>

      <View style={styles.mainCard}>
        <Text style={styles.mainLabel}>
          Dinheiro recebido
        </Text>

        <Text style={styles.money}>
          {financeiro.valorRecebido.toFixed(2)} MT
        </Text>

        <Text style={styles.mainDescription}>
          Pagamentos realmente registados
        </Text>
      </View>

      <View style={styles.row}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>
            Pedidos
          </Text>

          <Text style={styles.cardValue}>
            {estatisticas.totalPedidos}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>
            Pendentes
          </Text>

          <Text style={styles.cardValue}>
            {estatisticas.pedidosPendentes}
          </Text>
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>
            Entregues
          </Text>

          <Text style={styles.cardValue}>
            {estatisticas.pedidosEntregues}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>
            Em produção
          </Text>

          <Text style={styles.cardValue}>
            {estatisticas.emProducao}
          </Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>
        Financeiro
      </Text>

      <View style={styles.financialCard}>
        <View style={styles.financialRow}>
          <Text style={styles.financialLabel}>
            Valor dos pedidos
          </Text>

          <Text style={styles.financialValue}>
            {financeiro.valorPedidos.toFixed(2)} MT
          </Text>
        </View>

        <View style={styles.financialRow}>
          <Text style={styles.financialLabel}>
            Recebido
          </Text>

          <Text style={styles.received}>
            {financeiro.valorRecebido.toFixed(2)} MT
          </Text>
        </View>

        <View style={styles.financialRow}>
          <Text style={styles.financialLabel}>
            Por receber
          </Text>

          <Text style={styles.pending}>
            {financeiro.valorPendente.toFixed(2)} MT
          </Text>
        </View>

        <View style={styles.financialRow}>
          <Text style={styles.financialLabel}>
            Compra de stock
          </Text>

          <Text style={styles.stockPurchase}>
            - {resumoSaidas.comprasStock.toFixed(2)} MT
          </Text>
        </View>

        <View style={styles.financialRow}>
          <Text style={styles.financialLabel}>
            Despesas operacionais
          </Text>

          <Text style={styles.expense}>
            - {resumoSaidas.despesasOperacionais.toFixed(2)} MT
          </Text>
        </View>

        <View style={styles.financialRow}>
          <Text style={styles.financialLabel}>
            Outros
          </Text>

          <Text style={styles.financialValue}>
            - {resumoSaidas.outros.toFixed(2)} MT
          </Text>
        </View>

        <View style={styles.financialRow}>
          <Text style={styles.resultLabel}>
            Total de saídas
          </Text>

          <Text style={styles.expense}>
            - {resumoSaidas.totalSaidas.toFixed(2)} MT
          </Text>
        </View>

        <View style={styles.separator} />

        <View style={styles.financialRow}>
          <Text style={styles.resultLabel}>
            Resultado atual
          </Text>

          <Text
            style={[
              styles.result,
              resultadoAtual < 0 &&
                styles.negativeResult,
            ]}
          >
            {resultadoAtual.toFixed(2)} MT
          </Text>
        </View>
      </View>

      <View style={styles.investmentCard}>
        <Text style={styles.cardLabel}>
          Investimento inicial
        </Text>

        <Text style={styles.investmentValue}>
          27.900,00 MT
        </Text>

        <Text style={styles.note}>
          Mantido separadamente do resultado operacional.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>
        Todas as áreas
      </Text>

      <Pressable
        style={styles.menuButton}
        onPress={() =>
          navigation.navigate('PedidosAdmin')
        }
      >
        <View>
          <Text style={styles.menuTitle}>
            📦 Gerir Pedidos
          </Text>

          <Text style={styles.menuDescription}>
            Consultar e atualizar pedidos dos clientes
          </Text>
        </View>

        <Text style={styles.arrow}>
          ›
        </Text>
      </Pressable>

      <Pressable
        style={styles.menuButton}
        onPress={() =>
          navigation.navigate('Vendas')
        }
      >
        <View>
          <Text style={styles.menuTitle}>
            💰 Vendas e Pagamentos
          </Text>

          <Text style={styles.menuDescription}>
            Registar e consultar pagamentos
          </Text>
        </View>

        <Text style={styles.arrow}>›</Text>
      </Pressable>

      <Pressable
        style={styles.menuButton}
        onPress={() =>
          navigation.navigate('Despesas')
        }
      >
        <View>
          <Text style={styles.menuTitle}>
            💸 Despesas
          </Text>

          <Text style={styles.menuDescription}>
            Registar papel, tinta e outros gastos
          </Text>
        </View>

        <Text style={styles.arrow}>›</Text>
      </Pressable>

      <Pressable
        style={styles.menuButton}
        onPress={() =>
          navigation.navigate('Stock')
        }
      >
        <View>
          <Text style={styles.menuTitle}>
            📦 Stock
          </Text>

          <Text style={styles.menuDescription}>
            Controlar papel, tinta e materiais
          </Text>
        </View>

        <Text style={styles.arrow}>›</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },

  content: {
    padding: 20,
    paddingBottom: 40,
  },

  title: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#102A43',
  },

  subtitle: {
    color: '#627D98',
    marginTop: 3,
    marginBottom: 25,
  },

  mainCard: {
    backgroundColor: '#102A43',
    padding: 22,
    borderRadius: 18,
  },

  mainLabel: {
    color: '#BCCCDC',
  },

  money: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: 'bold',
    marginTop: 5,
  },

  mainDescription: {
    color: '#9FB3C8',
    marginTop: 6,
    fontSize: 12,
  },

  row: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },

  card: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 15,
  },

  cardLabel: {
    color: '#829AB1',
    fontSize: 13,
  },

  cardValue: {
    color: '#102A43',
    fontSize: 26,
    fontWeight: 'bold',
    marginTop: 5,
  },

  sectionTitle: {
    color: '#102A43',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 28,
    marginBottom: 10,
  },

  financialCard: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 15,
    marginBottom: 12,
  },

  financialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },

  financialLabel: {
    color: '#627D98',
  },

  financialValue: {
    color: '#102A43',
    fontWeight: 'bold',
  },

  received: {
    color: '#147D64',
    fontWeight: 'bold',
  },

  pending: {
    color: '#B7791F',
    fontWeight: 'bold',
  },

  expense: {
    color: '#C53030',
    fontWeight: 'bold',
  },

  stockPurchase: {
    color: '#B7791F',
    fontWeight: 'bold',
  },

  separator: {
    height: 1,
    backgroundColor: '#E6EAF0',
    marginBottom: 14,
  },

  resultLabel: {
    color: '#102A43',
    fontSize: 16,
    fontWeight: 'bold',
  },

  result: {
    color: '#147D64',
    fontSize: 20,
    fontWeight: 'bold',
  },

  negativeResult: {
    color: '#C53030',
  },

  investmentCard: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 15,
  },

  investmentValue: {
    color: '#102A43',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 5,
  },

  note: {
    color: '#829AB1',
    fontSize: 12,
    marginTop: 5,
  },

  menuButton: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },

  menuTitle: {
    color: '#102A43',
    fontSize: 17,
    fontWeight: 'bold',
  },

  menuDescription: {
    color: '#829AB1',
    marginTop: 5,
    fontSize: 12,
  },

  arrow: {
    fontSize: 30,
    color: '#829AB1',
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
  },

  loadingText: {
    marginTop: 10,
    color: '#627D98',
  },
});
