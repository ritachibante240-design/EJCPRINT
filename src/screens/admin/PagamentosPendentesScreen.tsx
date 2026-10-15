import { showAppAlert } from '../../components/AppAlert';
import { colors, fontWeights, radii, spacing } from '../../theme';
import ActionButton from '../../components/ActionButton';
import { obterTokenAdministrador } from '../../services/adminAuthService';
import { abrirArquivoPedido } from '../../services/arquivoRemotoService';
import {
  confirmarPagamento,
  listarPagamentos,
  Pagamento,
  rejeitarPagamento,
} from '../../services/pagamentoService';
import React, { useCallback, useMemo, useState } from 'react';
import { sincronizarTudoPendentes } from '../../services/sincronizacaoSeguraService';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  ScrollView,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

type PagamentoAdmin = Pagamento & { numero_pedido: string; cliente: string };
type FiltroPagamento = 'TODOS' | 'PENDENTE' | 'CONFIRMADO' | 'REJEITADO';

export default function PagamentosPendentesScreen() {
  const [items, setItems] = useState<PagamentoAdmin[]>([]);
  const [processando, setProcessando] = useState<number | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroPagamento>('PENDENTE');

  const carregar = useCallback(async (mostrarErro = true) => {
    setAtualizando(true);
    let erroSincronizacao: unknown;
    const carregarDadosLocais = async () => {
      setItems(await listarPagamentos());
      setToken(await obterTokenAdministrador());
    };

    try {
      await carregarDadosLocais();
    } catch (erro) {
      console.error(erro);
      showAppAlert('Erro', 'Não foi possível carregar os pagamentos locais.');
      setAtualizando(false);
      return;
    }

    try {
      await sincronizarTudoPendentes(1, 1200);
    } catch (erro) {
      erroSincronizacao = erro;
      console.warn('Não foi possível atualizar pagamentos do servidor.', erro);
    }

    try {
      await carregarDadosLocais();
    } catch (erro) {
      console.error(erro);
      showAppAlert('Erro', 'Não foi possível carregar os pagamentos locais.');
    } finally {
      setAtualizando(false);
    }

    if (erroSincronizacao && mostrarErro) {
      showAppAlert(
        'Pagamentos não atualizados',
        'A lista local foi mantida, mas não foi possível atualizar os pagamentos do servidor. Verifique a ligação e tente novamente.'
      );
    }
  }, []);

  useFocusEffect(useCallback(() => { void carregar(false); }, [carregar]));

  const filtrados = useMemo(
    () => items.filter((item) => filtro === 'TODOS' || item.status === filtro),
    [filtro, items],
  );

  async function processar(item: PagamentoAdmin, aprovar: boolean) {
    if (processando !== null) return;
    try {
      setProcessando(item.id);
      if (aprovar) await confirmarPagamento(item.id);
      else await rejeitarPagamento(item.id, 'Comprovativo incorreto');
      void carregar(false);
      showAppAlert(
        aprovar ? 'Pagamento aprovado' : 'Pagamento reprovado',
        aprovar ? 'O pagamento foi enviado para confirmação no servidor e entrou no Caixa.' : 'O cliente poderá enviar um novo comprovativo.'
      );
    } catch (erro) {
      showAppAlert('Erro', erro instanceof Error ? erro.message : 'Não foi possível processar o pagamento.');
    } finally {
      setProcessando(null);
    }
  }

  async function abrirComprovativo(item: PagamentoAdmin) {
    if (!item.comprovativo_uri) return;
    const mimeType = item.comprovativo_nome?.toLowerCase().endsWith('.pdf')
      ? 'application/pdf'
      : 'image/jpeg';
    try {
      await abrirArquivoPedido(item.comprovativo_uri, item.comprovativo_nome ?? 'comprovativo', mimeType, token);
    } catch (erro) {
      showAppAlert('Não foi possível abrir o comprovativo', erro instanceof Error ? erro.message : 'Tente novamente.');
    }
  }

  return (
    <FlatList
      data={filtrados}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => void carregar()} />}
      ListHeaderComponent={
        <View style={styles.listHeader}>
          <Text style={styles.title}>Pagamentos</Text>
          <Text style={styles.subtitle}>Consulte pagamentos pendentes, confirmados e rejeitados</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {([
              ['PENDENTE', 'Pendentes'],
              ['CONFIRMADO', 'Confirmados'],
              ['REJEITADO', 'Rejeitados'],
              ['TODOS', 'Todos'],
            ] as [FiltroPagamento, string][]).map(([estado, titulo]) => {
              const quantidade = estado === 'TODOS'
                ? items.length
                : items.filter((item) => item.status === estado).length;
              return (
                <Pressable
                  key={estado}
                  style={[styles.filter, filtro === estado && styles.filterActive]}
                  onPress={() => setFiltro(estado)}
                >
                  <Text style={[styles.filterText, filtro === estado && styles.filterTextActive]}>
                    {titulo} ({quantidade})
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      }
      ListEmptyComponent={atualizando ? <ActivityIndicator style={styles.loading} /> : <Text style={styles.empty}>Não existem pagamentos neste filtro.</Text>}
      renderItem={({ item }) => {
        const comprovativoRemoto = item.comprovativo_uri?.startsWith('http') ?? false;
        const comprovativoPdf = item.comprovativo_nome?.toLowerCase().endsWith('.pdf') ?? false;
        const pendente = item.status === 'PENDENTE';
        return (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.order}>{item.numero_pedido}</Text>
                <Text style={styles.client}>{item.cliente}</Text>
              </View>
              <View style={[
                styles.statusBadge,
                item.status === 'CONFIRMADO' && styles.statusConfirmed,
                item.status === 'REJEITADO' && styles.statusRejected,
              ]}>
                <Text style={[
                  styles.statusText,
                  item.status === 'CONFIRMADO' && styles.statusTextConfirmed,
                  item.status === 'REJEITADO' && styles.statusTextRejected,
                ]}>
                  {item.status === 'PENDENTE' ? 'Em análise' : item.status === 'CONFIRMADO' ? 'Confirmado' : 'Rejeitado'}
                </Text>
              </View>
            </View>
            <Text style={styles.amount}>{Number(item.valor ?? 0).toFixed(2)} MT • {item.metodo}</Text>
            {item.referencia && <Text style={styles.info}>Referência: {item.referencia}</Text>}
            {item.motivo_rejeicao && <Text style={styles.rejectionReason}>Motivo da rejeição: {item.motivo_rejeicao}</Text>}
            {item.comprovativo_uri && (comprovativoPdf ? (
              <Pressable style={styles.openProof} onPress={() => void abrirComprovativo(item)}>
                <Text style={styles.openProofText}>Abrir comprovativo PDF</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => void abrirComprovativo(item)}>
                <Image
                  source={{
                    uri: item.comprovativo_uri,
                    ...(comprovativoRemoto && token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
                  }}
                  style={styles.proof}
                  resizeMode="cover"
                />
              </Pressable>
            ))}
            {pendente && (
              <View style={styles.actions}>
                <Pressable style={styles.reject} disabled={processando !== null} onPress={() => void processar(item, false)}>
                  <Text style={styles.rejectText}>{processando === item.id ? 'A processar...' : 'Reprovar'}</Text>
                </Pressable>
                <ActionButton title="Aprovar" loading={processando === item.id} disabled={processando !== null} style={styles.approve} onPress={() => void processar(item, true)} />
              </View>
            )}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.xl, paddingBottom: 100, backgroundColor: colors.background, flexGrow: 1 },
  listHeader: { marginBottom: spacing.sm },
  title: { color: colors.brand, fontSize: 26, fontWeight: fontWeights.bold },
  subtitle: { color: colors.muted, marginTop: 5, marginBottom: 18 },
  card: { backgroundColor: '#FFF', borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  order: { color: colors.brand, fontWeight: fontWeights.bold, fontSize: 17 },
  client: { color: colors.muted, marginTop: 3 },
  statusBadge: { borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.warningSoft },
  statusConfirmed: { backgroundColor: colors.successSoft },
  statusRejected: { backgroundColor: colors.dangerSoft },
  statusText: { color: colors.warning, fontSize: 11, fontWeight: fontWeights.bold },
  statusTextConfirmed: { color: colors.success },
  statusTextRejected: { color: colors.danger },
  amount: { color: colors.brand, fontWeight: fontWeights.bold, marginTop: spacing.md },
  info: { color: colors.muted, marginTop: 5 },
  rejectionReason: { color: colors.danger, marginTop: 5, fontSize: 12 },
  filters: { gap: spacing.sm, paddingBottom: spacing.md },
  filter: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, paddingHorizontal: 13, paddingVertical: 9 },
  filterActive: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  filterText: { color: colors.muted, fontWeight: fontWeights.semibold, fontSize: 12 },
  filterTextActive: { color: colors.brand, fontWeight: fontWeights.bold },
  proof: { width: '100%', height: 180, borderRadius: radii.md, marginTop: spacing.md },
  openProof: { marginTop: spacing.md, borderRadius: radii.sm, backgroundColor: colors.brandSoft, padding: 14, alignItems: 'center' },
  openProofText: { color: colors.brand, fontWeight: fontWeights.bold },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  reject: { flex: 1, borderWidth: 1, borderColor: '#FDA29B', borderRadius: radii.sm, padding: 13, alignItems: 'center' },
  rejectText: { color: colors.danger, fontWeight: fontWeights.bold },
  approve: { flex: 1, backgroundColor: colors.success, borderRadius: radii.sm, padding: 13, alignItems: 'center' },
  empty: { color: colors.subtle, textAlign: 'center', marginTop: 60 },
  loading: { marginTop: 40 },
});
