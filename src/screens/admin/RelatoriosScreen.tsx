import React, { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import ActionButton from '../../components/ActionButton';
import { showAppAlert } from '../../components/AppAlert';
import { colors, fontWeights, radii, spacing } from '../../theme';
import { useResponsiveContent } from '../../hooks/useResponsive';
import { criarBackup } from '../../services/backupService';
import { selecionarERestaurarBackup } from '../../services/restaurarBackupService';
import { obterResumoRelatorio, PeriodoRelatorio, ResumoRelatorio } from '../../services/relatorioService';
import { formatarDinheiro } from '../../utils/formatters';

const CAPITAL_INICIAL = 27900;
const resumoInicial: ResumoRelatorio = {
  valorPedidos: 0,
  recebido: 0,
  porReceber: 0,
  saidas: 0,
  saldoMovimentos: 0,
  custosDiretos: 0,
  despesasOperacionais: 0,
  lucroOperacionalEstimado: 0,
  totalPedidos: 0,
  entregues: 0,
  cancelados: 0,
};

function dinheiro(valor: number) {
  return formatarDinheiro(valor);
}

function Linha({
  icone,
  titulo,
  valor,
}: {
  icone: React.ComponentProps<typeof Ionicons>['name'];
  titulo: string;
  valor: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Ionicons name={icone} size={21} color={colors.brand} />
      </View>
      <Text style={styles.rowTitle}>{titulo}</Text>
      <Text style={styles.rowValue}>{valor}</Text>
    </View>
  );
}

function PeriodoButton({
  titulo,
  ativo,
  onPress,
}: {
  titulo: string;
  ativo: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.periodButton, ativo && styles.periodButtonActive]}
      onPress={onPress}
    >
      <Text style={[styles.periodText, ativo && styles.periodTextActive]}>
        {titulo}
      </Text>
    </Pressable>
  );
}

export default function RelatoriosScreen() {
  const { isDesktop } = useResponsiveContent(20);
  const [periodo, setPeriodo] = useState<PeriodoRelatorio>('MES');
  const [resumo, setResumo] = useState(resumoInicial);
  const [criandoBackup, setCriandoBackup] = useState(false);
  const [restaurando, setRestaurando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setResumo(await obterResumoRelatorio(periodo));
    } catch (error) {
      showAppAlert(
        'Relatórios indisponíveis',
        error instanceof Error ? error.message : 'Não foi possível carregar os dados online.',
      );
    }
  }, [periodo]);

  useFocusEffect(useCallback(() => { void carregar(); }, [carregar]));

  async function fazerBackup() {
    if (criandoBackup) return;
    try {
      setCriandoBackup(true);
      const resultado = await criarBackup();
      showAppAlert(
        'Backup criado',
        Platform.OS === 'web'
          ? `O ficheiro "${resultado.nome}" foi transferido para o seu computador.`
          : `O backup ${resultado.nome} foi criado. Escolha onde deseja guardá-lo.`,
      );
    } catch (error) {
      showAppAlert('Erro no backup', error instanceof Error ? error.message : 'Não foi possível criar o backup.');
    } finally {
      setCriandoBackup(false);
    }
  }

  async function restaurarBackup() {
    if (restaurando) return;
    try {
      setRestaurando(true);
      const resultado = await selecionarERestaurarBackup();
      if (resultado.cancelado) return;
      showAppAlert(
        'Backup restaurado',
        Platform.OS === 'web'
          ? `O backup "${resultado.nome}" foi restaurado. Recarregue a página para atualizar os dados.`
          : `O backup "${resultado.nome}" foi restaurado. Feche completamente a aplicação e abra novamente.`,
      );
    } catch (error) {
      showAppAlert('Erro na restauração', error instanceof Error ? error.message : 'Não foi possível restaurar o backup.');
    } finally {
      setRestaurando(false);
    }
  }

  function pedirRestauracao() {
    if (restaurando || criandoBackup) return;
    showAppAlert(
      'Restaurar backup?',
      'Os dados atuais serão substituídos pelos dados do backup selecionado.\n\nAntes disso, será criada uma cópia de segurança do banco atual.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Continuar', onPress: restaurarBackup },
      ],
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        isDesktop && { maxWidth: 1000, width: '100%', alignSelf: 'center' },
      ]}
    >
      <Text style={styles.title}>Relatórios</Text>
      <Text style={styles.subtitle}>Acompanhe o desempenho da EJC Print</Text>
      <View style={styles.periodContainer}>
        <PeriodoButton titulo="Hoje" ativo={periodo === 'HOJE'} onPress={() => setPeriodo('HOJE')} />
        <PeriodoButton titulo="Este mês" ativo={periodo === 'MES'} onPress={() => setPeriodo('MES')} />
        <PeriodoButton titulo="Geral" ativo={periodo === 'GERAL'} onPress={() => setPeriodo('GERAL')} />
      </View>

      <Text style={styles.sectionTitle}>Vendas</Text>
      <View style={styles.card}>
        <Linha icone="receipt-outline" titulo="Valor dos pedidos" valor={dinheiro(resumo.valorPedidos)} />
        <View style={styles.separator} />
        <Linha icone="checkmark-circle-outline" titulo="Recebido" valor={dinheiro(resumo.recebido)} />
        <View style={styles.separator} />
        <Linha icone="time-outline" titulo="Por receber" valor={dinheiro(resumo.porReceber)} />
      </View>

      <Text style={styles.sectionTitle}>Lucro operacional estimado</Text>
      <View style={styles.card}>
        <Linha icone="construct-outline" titulo="Custos diretos de produção" valor={`-${dinheiro(resumo.custosDiretos)}`} />
        <View style={styles.separator} />
        <Linha icone="business-outline" titulo="Despesas operacionais e outras" valor={`-${dinheiro(resumo.despesasOperacionais)}`} />
        <View style={styles.profitArea}>
          <Text style={styles.balanceLabel}>Estimativa: valor dos pedidos não cancelados menos custos</Text>
          <Text style={[styles.profitValue, resumo.lucroOperacionalEstimado < 0 && styles.negativeProfit]}>
            {dinheiro(resumo.lucroOperacionalEstimado)}
          </Text>
        </View>
        <Text style={styles.profitNote}>
          Compras de stock não são abatidas aqui; o custo é considerado quando o material é consumido na produção.
          Pedidos ainda não iniciados na impressão podem não ter custo direto lançado. Os custos de tinta são estimativas
          e podem não refletir o consumo real.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Movimento financeiro</Text>
      <View style={styles.card}>
        <Linha icone="arrow-down-circle-outline" titulo="Entradas confirmadas" valor={`+${dinheiro(resumo.recebido)}`} />
        <View style={styles.separator} />
        <Linha icone="arrow-up-circle-outline" titulo="Todas as saídas" valor={`-${dinheiro(resumo.saidas)}`} />
        <View style={styles.balanceArea}>
          <Text style={styles.balanceLabel}>Saldo de caixa no período</Text>
          <Text style={styles.balanceValue}>{dinheiro(resumo.saldoMovimentos)}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Pedidos</Text>
      <View style={styles.orderStats}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{resumo.totalPedidos}</Text>
          <Text style={styles.statTitle}>Realizados</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{resumo.entregues}</Text>
          <Text style={styles.statTitle}>Entregues</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{resumo.cancelados}</Text>
          <Text style={styles.statTitle}>Cancelados</Text>
        </View>
      </View>

      {periodo === 'GERAL' && (
        <>
          <Text style={styles.sectionTitle}>Capital inicial</Text>
          <View style={styles.capitalCard}>
            <Ionicons name="business-outline" size={25} color={colors.brand} />
            <View>
              <Text style={styles.capitalLabel}>Investimento inicial</Text>
              <Text style={styles.capitalValue}>{dinheiro(CAPITAL_INICIAL)}</Text>
              <Text style={styles.capitalInfo}>Registado como capital inicial</Text>
            </View>
          </View>
        </>
      )}

      <View style={styles.backupCard}>
        <View style={styles.backupHeader}>
          <Ionicons name="shield-checkmark-outline" size={26} color={colors.brand} />
          <View style={styles.backupHeaderText}>
            <Text style={styles.backupTitle}>Segurança dos dados</Text>
            <Text style={styles.backupDescription}>Crie uma cópia dos dados da EJC Print para evitar perdas.</Text>
          </View>
        </View>
        <ActionButton title="Criar backup agora" loading={criandoBackup} onPress={fazerBackup} />
        <View style={{ height: 12 }} />
        <ActionButton
          title="Restaurar backup"
          loading={restaurando}
          disabled={criandoBackup || restaurando}
          onPress={pedirRestauracao}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingBottom: 100 },
  title: { color: colors.brand, fontSize: 27, fontWeight: fontWeights.bold },
  subtitle: { color: colors.muted, marginTop: spacing.xs, marginBottom: 22 },
  periodContainer: { flexDirection: 'row', backgroundColor: colors.border, padding: spacing.xs, borderRadius: 13, marginBottom: 25 },
  periodButton: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: radii.sm },
  periodButtonActive: { backgroundColor: '#FFF' },
  periodText: { color: colors.muted, fontWeight: fontWeights.semibold },
  periodTextActive: { color: colors.brand, fontWeight: fontWeights.bold },
  sectionTitle: { color: colors.brand, fontSize: 17, fontWeight: fontWeights.bold, marginBottom: 10, marginTop: 5 },
  card: { backgroundColor: '#FFF', borderRadius: 17, padding: spacing.lg, marginBottom: 22 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  rowIcon: { width: 39, height: 39, borderRadius: 11, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { flex: 1, color: colors.muted, marginLeft: 11, fontSize: 12 },
  rowValue: { color: colors.brand, fontWeight: fontWeights.bold, fontSize: 12 },
  separator: { height: 1, backgroundColor: colors.border, marginVertical: 5 },
  balanceArea: { backgroundColor: colors.brandSoft, borderRadius: 13, padding: 15, marginTop: 13 },
  balanceLabel: { color: colors.muted, fontSize: 12 },
  balanceValue: { color: colors.brand, fontSize: 27, fontWeight: fontWeights.bold, marginTop: 3 },
  profitArea: { backgroundColor: colors.successSoft, borderRadius: 13, padding: 15, marginTop: 13 },
  profitValue: { color: colors.success, fontSize: 27, fontWeight: fontWeights.bold, marginTop: 4 },
  negativeProfit: { color: colors.danger },
  profitNote: { color: colors.subtle, fontSize: 11, lineHeight: 17, marginTop: spacing.md },
  orderStats: { flexDirection: 'row', gap: 9, marginBottom: 22 },
  statCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 15, padding: 13, minHeight: 95, justifyContent: 'space-between' },
  statValue: { color: colors.brand, fontSize: 25, fontWeight: fontWeights.bold },
  statTitle: { color: colors.muted, fontSize: 11 },
  capitalCard: { backgroundColor: '#FFF', borderRadius: 17, padding: 17, flexDirection: 'row', gap: 13 },
  capitalLabel: { color: colors.muted, fontSize: 12 },
  capitalValue: { color: colors.brand, fontSize: 22, fontWeight: fontWeights.bold, marginTop: 2 },
  capitalInfo: { color: colors.subtle, fontSize: 11, marginTop: spacing.xs },
  backupCard: { backgroundColor: '#FFF', borderRadius: radii.lg, padding: 18, marginTop: spacing.xl, marginBottom: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 5, elevation: 2 },
  backupHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 18 },
  backupHeaderText: { flex: 1, marginLeft: spacing.md },
  backupTitle: { fontSize: 17, fontWeight: fontWeights.bold, color: colors.brand },
  backupDescription: { fontSize: 13, color: colors.muted, marginTop: spacing.xs, lineHeight: 19 },
});
