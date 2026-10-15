import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { showAppAlert } from '../../components/AppAlert';
import { colors, fontWeights, radii, spacing } from '../../theme';
import { useResponsiveContent } from '../../hooks/useResponsive';
import { AdminAuditLog, listarHistoricoAdministrador } from '../../services/adminAuditService';

const TAMANHO_PAGINA = 100;

function obterTituloAcao(acao: string) {
  const titulos: Record<string, string> = {
    ORDER_STATUS_CHANGED: 'Estado do pedido alterado',
    ORDER_PRINTING_STARTED: 'Impressão iniciada',
    PAYMENT_CONFIRMED: 'Pagamento confirmado',
    PAYMENT_REJECTED: 'Pagamento rejeitado',
    STOCK_ITEM_CREATED: 'Material criado',
    STOCK_PURCHASE_RECORDED: 'Compra de stock registada',
    STOCK_ADJUSTED: 'Stock ajustado',
    STOCK_INITIAL_COST_SET: 'Custo inicial definido',
    STOCK_UNIT_COST_UPDATED: 'Custo unitário atualizado',
    PRINT_COST_DEFAULTS_APPLIED: 'Custos de impressão atualizados',
    STOCK_WASTE_RECORDED: 'Desperdício registado',
    EXPENSE_RECORDED: 'Despesa registada',
  };
  return titulos[acao] ?? 'Alteração administrativa';
}

function formatarData(valor: string) {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return 'Data indisponível';
  return data.toLocaleString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HistoricoAdminScreen() {
  const { isDesktop } = useResponsiveContent(20);
  const [items, setItems] = useState<AdminAuditLog[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [temMais, setTemMais] = useState(true);
  const carregamentoEmCurso = useRef(false);

  const carregar = useCallback(async (reset = true) => {
    if (carregamentoEmCurso.current || (!reset && !temMais)) return;
    carregamentoEmCurso.current = true;
    if (reset) setAtualizando(items.length > 0);
    else setCarregandoMais(true);
    try {
      const skip = reset ? 0 : items.length;
      const pagina = await listarHistoricoAdministrador(skip, TAMANHO_PAGINA);
      setItems((anteriores) => reset
        ? pagina
        : [...anteriores, ...pagina.filter((item) => !anteriores.some((anterior) => anterior.id === item.id))]);
      setTemMais(pagina.length === TAMANHO_PAGINA);
    } catch (error) {
      showAppAlert(
        'Histórico indisponível',
        error instanceof Error ? error.message : 'Não foi possível carregar o histórico.',
      );
    } finally {
      setCarregando(false);
      setAtualizando(false);
      setCarregandoMais(false);
      carregamentoEmCurso.current = false;
    }
  }, [items.length, temMais]);

  useFocusEffect(useCallback(() => { void carregar(); }, [carregar]));

  if (carregando) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.brand} />
        <Text style={styles.muted}>A carregar histórico...</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        isDesktop && { maxWidth: 900, width: '100%', alignSelf: 'center' },
      ]}
      data={items}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl refreshing={atualizando} onRefresh={() => void carregar(true)} />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>Histórico de alterações</Text>
          <Text style={styles.subtitle}>
            Registo das alterações importantes feitas na administração.
          </Text>
          <Text style={styles.count}>{items.length} registo(s) carregados</Text>
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>Ainda não existem alterações registadas.</Text>}
      onEndReached={() => { void carregar(false); }}
      onEndReachedThreshold={0.45}
      ListFooterComponent={carregandoMais ? <ActivityIndicator style={styles.footerLoader} color={colors.brand} /> : null}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardHeading}>
            <View style={styles.icon}>
              <Ionicons name="time-outline" size={19} color={colors.brand} />
            </View>
            <View style={styles.headingCopy}>
              <Text style={styles.action}>{obterTituloAcao(item.action)}</Text>
              <Text style={styles.date}>{formatarData(item.createdAt)}</Text>
            </View>
          </View>
          <Text style={styles.summary}>{item.summary}</Text>
          <View style={styles.footer}>
            <Text style={styles.entity}>{item.entityType} · {item.entityId}</Text>
            <Text style={styles.actor}>{item.actor}</Text>
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: 60, flexGrow: 1 },
  header: { marginBottom: spacing.lg },
  title: { color: colors.brand, fontSize: 25, fontWeight: fontWeights.bold },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: spacing.xs },
  count: { color: colors.subtle, fontSize: 11, marginTop: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.md },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: { width: 36, height: 36, borderRadius: radii.sm, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  headingCopy: { flex: 1 },
  action: { color: colors.brand, fontSize: 14, fontWeight: fontWeights.bold },
  date: { color: colors.subtle, fontSize: 11, marginTop: 3 },
  summary: { color: colors.text, fontSize: 13, lineHeight: 19, marginTop: spacing.md },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.md, paddingTop: spacing.sm, flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  entity: { color: colors.subtle, fontSize: 10, flex: 1 },
  actor: { color: colors.muted, fontSize: 10, fontWeight: fontWeights.semibold },
  empty: { color: colors.subtle, textAlign: 'center', marginTop: 48 },
  center: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  muted: { color: colors.muted },
  footerLoader: { marginVertical: spacing.lg },
});
