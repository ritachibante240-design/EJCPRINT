import React, { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';

import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';

import { useFocusEffect } from '@react-navigation/native';
import { useResponsiveContent } from '../../hooks/useResponsive';
import { showAppAlert } from '../../components/AppAlert';
import { contarPagamentosPendentes } from '../../services/pagamentoService';
import { listarStock } from '../../services/stockService';
import { colors, fontWeights, radii, spacing } from '../../theme';


import {
  obterEstatisticasPedidos,
  obterPedidosHoje,
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
  const { contentStyle } = useResponsiveContent(20);
  const [pedidosHoje, setPedidosHoje] = useState(0);
  const [pagamentosPendentes, setPagamentosPendentes] = useState(0);
  const [stockBaixo, setStockBaixo] = useState(0);
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
      const [dadosEstatisticas, dadosFinanceiros, saidas, totalHoje, pendentes, stock] = await Promise.all([
        obterEstatisticasPedidos(),
        obterResumoFinanceiro(),
        obterResumoSaidas(),
        obterPedidosHoje(),
        contarPagamentosPendentes(),
        listarStock(),
      ]);

      setEstatisticas(dadosEstatisticas);
      setFinanceiro(dadosFinanceiros);
      setResumoSaidas(saidas);
      setPedidosHoje(totalHoje);
      setPagamentosPendentes(pendentes);
      setStockBaixo(stock.filter((item) => item.quantidade <= item.stock_minimo).length);
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
      contentContainerStyle={[styles.content, contentStyle]}
    >
      <View style={styles.brandHeader}>
        <Image
          source={require("../../../assets/ejc-print-logo.png")}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Logótipo EJC Print"
        />
        <View style={styles.brandCopy}>
          <Text style={styles.title}>Painel de gestão</Text>
          <Text style={styles.subtitle}>Visão geral da EJC Print</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Resumo do negócio</Text>

      <View style={styles.row}>
        <Pressable
          style={styles.metricCard}
          onPress={() => navigation.getParent()?.navigate("PedidosAdmin")}
        >
          <View style={[styles.metricIcon, styles.metricIconInfo]}>
            <Ionicons
              name="file-tray-full-outline"
              size={20}
              color={colors.info}
            />
          </View>
          <Text style={styles.metricLabel}>Pedidos de hoje</Text>
          <Text style={styles.metricValue}>{pedidosHoje}</Text>
          <Text style={styles.metricHint}>Pedidos recebidos hoje</Text>
        </Pressable>
        <Pressable
          style={styles.metricCard}
          onPress={() => navigation.getParent()?.navigate("PagamentosPendentes")}
        >
          <View style={[styles.metricIcon, styles.metricIconWarning]}>
            <Ionicons name="time-outline" size={20} color={colors.warning} />
          </View>
          <Text style={styles.metricLabel}>Pagamentos pendentes</Text>
          <Text style={[styles.metricValue, styles.metricWarningValue]}>
            {pagamentosPendentes}
          </Text>
          <Text style={styles.metricHint}>Aguardam análise</Text>
        </Pressable>
      </View>

      <View style={styles.row}>
        <Pressable
          style={styles.metricCard}
          onPress={() => navigation.getParent()?.navigate("Vendas")}
        >
          <View style={[styles.metricIcon, styles.metricIconSuccess]}>
            <Ionicons name="wallet-outline" size={20} color={colors.success} />
          </View>
          <Text style={styles.metricLabel}>Vendas recebidas</Text>
          <Text style={[styles.metricValue, styles.metricMoney]}>
            {financeiro.valorRecebido.toFixed(2)} MT
          </Text>
          <Text style={styles.metricHint}>Total acumulado</Text>
        </Pressable>
        <Pressable
          style={styles.metricCard}
          onPress={() => navigation.getParent()?.navigate("Stock")}
        >
          <View style={[styles.metricIcon, styles.metricIconDanger]}>
            <Ionicons name="cube-outline" size={20} color={colors.danger} />
          </View>
          <Text style={styles.metricLabel}>Stock baixo</Text>
          <Text
            style={[
              styles.metricValue,
              stockBaixo > 0 && styles.metricDangerValue,
            ]}
          >
            {stockBaixo}
          </Text>
          <Text style={styles.metricHint}>Itens no mínimo ou abaixo</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Estado dos pedidos</Text>
      <View style={styles.row}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Em produção</Text>
          <Text style={styles.cardValue}>{estatisticas.emProducao}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Por acompanhar</Text>
          <Text style={styles.cardValue}>{estatisticas.pedidosPendentes}</Text>
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
    backgroundColor: colors.background,
  },

  content: {
    padding: spacing.xl,
    paddingBottom: 40,
    width: '100%',
  },

  brandHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logo: { width: 86, height: 54, marginRight: spacing.md },
  brandCopy: { flex: 1 },
  metricCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricIcon: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  metricIconInfo: { backgroundColor: colors.infoSoft },
  metricIconWarning: { backgroundColor: colors.warningSoft },
  metricIconSuccess: { backgroundColor: colors.successSoft },
  metricIconDanger: { backgroundColor: colors.dangerSoft },
  metricLabel: { color: colors.muted, fontSize: 13, minHeight: 34 },
  metricValue: {
    color: colors.brand,
    fontSize: 25,
    fontWeight: fontWeights.bold,
    marginTop: spacing.xs,
  },
  metricMoney: { fontSize: 18 },
  metricWarningValue: { color: colors.warning },
  metricDangerValue: { color: colors.danger },
  metricHint: { color: colors.subtle, fontSize: 11, marginTop: spacing.xs },

  title: {
    fontSize: 22,
    fontWeight: fontWeights.bold,
    color: colors.brand,
  },

  subtitle: {
    color: colors.muted,
    marginTop: 3,
    marginBottom: 0,
  },

  mainCard: {
    backgroundColor: colors.brand,
    padding: 22,
    borderRadius: radii.xl,
  },

  mainLabel: {
    color: colors.border,
  },

  money: {
    color: colors.surface,
    fontSize: 32,
    fontWeight: fontWeights.bold,
    marginTop: 5,
  },

  mainDescription: {
    color: colors.subtle,
    marginTop: 6,
    fontSize: 12,
  },

  row: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },

  card: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: 18,
    borderRadius: 15,
  },

  cardLabel: {
    color: colors.subtle,
    fontSize: 13,
  },

  cardValue: {
    color: colors.brand,
    fontSize: 26,
    fontWeight: fontWeights.bold,
    marginTop: 5,
  },

  sectionTitle: {
    color: colors.brand,
    fontSize: 18,
    fontWeight: fontWeights.bold,
    marginTop: spacing.xxxl,
    marginBottom: 10,
  },

  financialCard: {
    backgroundColor: colors.surface,
    padding: 18,
    borderRadius: 15,
    marginBottom: spacing.md,
  },

  financialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },

  financialLabel: {
    color: colors.muted,
  },

  financialValue: {
    color: colors.brand,
    fontWeight: fontWeights.bold,
  },

  received: {
    color: colors.success,
    fontWeight: fontWeights.bold,
  },

  pending: {
    color: colors.warning,
    fontWeight: fontWeights.bold,
  },

  expense: {
    color: colors.danger,
    fontWeight: fontWeights.bold,
  },

  stockPurchase: {
    color: colors.warning,
    fontWeight: fontWeights.bold,
  },

  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 14,
  },

  resultLabel: {
    color: colors.brand,
    fontSize: 16,
    fontWeight: fontWeights.bold,
  },

  result: {
    color: colors.success,
    fontSize: 20,
    fontWeight: fontWeights.bold,
  },

  negativeResult: {
    color: colors.danger,
  },

  investmentCard: {
    backgroundColor: colors.surface,
    padding: 18,
    borderRadius: 15,
  },

  investmentValue: {
    color: colors.brand,
    fontSize: 24,
    fontWeight: fontWeights.bold,
    marginTop: 5,
  },

  note: {
    color: colors.subtle,
    fontSize: 12,
    marginTop: 5,
  },

  menuButton: {
    backgroundColor: colors.surface,
    padding: 18,
    borderRadius: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },

  menuTitle: {
    color: colors.brand,
    fontSize: 17,
    fontWeight: fontWeights.bold,
  },

  menuDescription: {
    color: colors.subtle,
    marginTop: 5,
    fontSize: 12,
  },

  arrow: {
    fontSize: 30,
    color: colors.subtle,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },

  loadingText: {
    marginTop: 10,
    color: colors.muted,
  },
});
