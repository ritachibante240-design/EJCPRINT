import { formatarDinheiro } from '../../utils/formatters';
import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { showAppAlert } from '../../components/AppAlert';
import { useResponsiveContent } from '../../hooks/useResponsive';
import {
  MovimentoCaixa,
  listarMovimentosCaixa,
  obterResumoCaixa,
} from '../../services/caixaService';
import { contarPagamentosPendentes } from '../../services/pagamentoService';

export default function CaixaScreen({ navigation }: any) {
  const { isDesktop } = useResponsiveContent(20);
  const [entradas, setEntradas] = useState(0);
  const [saidas, setSaidas] = useState(0);
  const [saldo, setSaldo] = useState(0);
  const [porReceber, setPorReceber] = useState(0);
  const [movimentos, setMovimentos] = useState<MovimentoCaixa[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [pagamentosPendentes, setPagamentosPendentes] = useState(0);

  const carregar = useCallback(async () => {
    try {
      setCarregando(true);
      const [resumo, lista] = await Promise.all([
        obterResumoCaixa(),
        listarMovimentosCaixa(),
      ]);
      setPagamentosPendentes(await contarPagamentosPendentes());
      setEntradas(resumo.entradas);
      setSaidas(resumo.saidas);
      setSaldo(resumo.saldo);
      setPorReceber(resumo.porReceber);
      setMovimentos(lista);
    } catch (error) {
      showAppAlert('Caixa indisponível', error instanceof Error ? error.message : 'Não foi possível carregar os dados online.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    carregar();
  }, [carregar]));

  const dinheiro = (valor: number | null | undefined) => formatarDinheiro(valor);

  return (
    <View style={styles.container}>
      <FlatList
        data={movimentos}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={carregando} onRefresh={carregar} />
        }
        contentContainerStyle={[styles.content, isDesktop && { maxWidth: 1000, width: '100%', alignSelf: 'center' }]}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <View style={styles.titleRow}>
                <Ionicons name="wallet-outline" size={28} color="#102A43" />
                <Text style={styles.title}>Caixa</Text>
              </View>
              <Text style={styles.subtitle}>Todo o dinheiro da EJC Print</Text>
              {pagamentosPendentes > 0 && <Pressable style={styles.pendingPayments} onPress={() => navigation.getParent()?.getParent()?.navigate('PagamentosPendentes')}><Ionicons name="receipt-outline" size={23} color="#B7791F" /><View style={styles.pendingLeft}><Text style={styles.pendingTitle}>{pagamentosPendentes === 1 ? '1 pagamento para analisar' : `${pagamentosPendentes} pagamentos para analisar`}</Text><Text style={styles.pendingSubtitle}>Verifique os comprovativos</Text></View><Ionicons name="chevron-forward" size={22} color="#8D5A00" /></Pressable>}
            </View>

            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>Saldo dos movimentos</Text>
              <Text style={styles.balance}>{dinheiro(saldo)}</Text>
              <View style={styles.balanceDivider} />
              <View style={styles.moneyRow}>
                <View>
                  <Text style={styles.smallLabel}>Entrou</Text>
                  <Text style={styles.entryValue}>+ {dinheiro(entradas)}</Text>
                </View>
                <View>
                  <Text style={styles.smallLabel}>Saiu</Text>
                  <Text style={styles.exitValue}>- {dinheiro(saidas)}</Text>
                </View>
              </View>
            </View>

            <View style={styles.pendingCard}>
              <View>
                <Text style={styles.pendingLabel}>A receber</Text>
                <Text style={styles.pendingValue}>{dinheiro(porReceber)}</Text>
              </View>
              <Ionicons name="time-outline" size={27} color="#B7791F" />
            </View>

            <View style={styles.actions}>
              <Pressable style={styles.primaryButton} onPress={() => navigation.navigate('Vendas')}>
                <Ionicons name="add-circle-outline" size={21} color="#FFFFFF" />
                <Text style={styles.primaryText}>Receber pagamento</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('Despesas')}>
                <Ionicons name="remove-circle-outline" size={21} color="#102A43" />
                <Text style={styles.secondaryText}>Registar saída</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionTitle}>Movimentos recentes</Text>
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={40} color="#BCCCDC" />
            <Text style={styles.emptyText}>Ainda não existem movimentos.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const entrada = item.tipo === 'ENTRADA';
          return (
            <View style={styles.movement}>
              <View style={[styles.movementIcon, entrada ? styles.entryIcon : styles.exitIcon]}>
                <Ionicons
                  name={entrada ? 'arrow-down' : 'arrow-up'}
                  size={20}
                  color={entrada ? '#147D64' : '#C53030'}
                />
              </View>
              <View style={styles.movementInfo}>
                <Text style={styles.movementTitle}>{item.descricao}</Text>
                <Text style={styles.movementDetail}>{item.detalhe}</Text>
              </View>
              <Text style={[styles.movementValue, entrada ? styles.green : styles.red]}>
                {entrada ? '+' : '-'}{dinheiro(item.valor)}
              </Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 20, paddingTop: 55, paddingBottom: 110 },
  header: { marginBottom: 22 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  title: { color: '#102A43', fontSize: 30, fontWeight: 'bold' },
  subtitle: { color: '#627D98', fontSize: 16, marginTop: 6 },
  balanceCard: { backgroundColor: '#102A43', borderRadius: 20, padding: 22 },
  balanceLabel: { color: '#BCCCDC', fontSize: 15 },
  balance: { color: '#FFFFFF', fontSize: 38, fontWeight: 'bold', marginTop: 7 },
  balanceDivider: { height: 1, backgroundColor: '#334E68', marginVertical: 18 },
  moneyRow: { flexDirection: 'row', justifyContent: 'space-between' },
  smallLabel: { color: '#9FB3C8', fontSize: 13, marginBottom: 4 },
  entryValue: { color: '#57D9A3', fontWeight: 'bold' },
  exitValue: { color: '#FF9B9B', fontWeight: 'bold' },
  pendingCard: { backgroundColor: '#FFFFFF', padding: 17, borderRadius: 15, marginTop: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pendingLabel: { color: '#627D98' },
  pendingValue: { color: '#102A43', fontSize: 21, fontWeight: 'bold', marginTop: 3 },
  actions: { marginTop: 18, gap: 10 },
  primaryButton: { backgroundColor: '#102A43', minHeight: 54, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  secondaryButton: { backgroundColor: '#FFFFFF', minHeight: 54, borderRadius: 13, borderWidth: 1, borderColor: '#BCCCDC', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondaryText: { color: '#102A43', fontWeight: 'bold', fontSize: 15 },
  sectionTitle: { color: '#102A43', fontSize: 20, fontWeight: 'bold', marginTop: 28, marginBottom: 12 },
  movement: { backgroundColor: '#FFFFFF', padding: 15, borderRadius: 14, marginBottom: 9, flexDirection: 'row', alignItems: 'center' },
  movementIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  entryIcon: { backgroundColor: '#E3FCEC' },
  exitIcon: { backgroundColor: '#FFF0F0' },
  movementInfo: { flex: 1, marginLeft: 11 },
  movementTitle: { color: '#102A43', fontWeight: 'bold' },
  movementDetail: { color: '#829AB1', fontSize: 12, marginTop: 3 },
  movementValue: { fontWeight: 'bold', fontSize: 14 },
  green: { color: '#147D64' },
  red: { color: '#C53030' },
  empty: { alignItems: 'center', padding: 30 },
  emptyText: { color: '#829AB1', marginTop: 8 },
  pendingPayments: { backgroundColor: '#FFF8E6', borderWidth: 1, borderColor: '#F6D88A', borderRadius: 16, padding: 14, marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 10 },
  pendingLeft: { flex: 1 },
  pendingTitle: { color: '#8D5A00', fontWeight: 'bold', fontSize: 14 },
  pendingSubtitle: { color: '#A36B00', fontSize: 12, marginTop: 3 },
});

