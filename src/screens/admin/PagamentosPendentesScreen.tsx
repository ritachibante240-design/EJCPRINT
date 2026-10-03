import { formatarDinheiro } from '../../utils/formatters';
import { showAppAlert } from '../../components/AppAlert';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useResponsiveContent } from '../../hooks/useResponsive';
import { confirmarPagamento, listarPagamentosPendentes, PagamentoPendente, rejeitarPagamento } from '../../services/pagamentoService';
import ActionButton from '../../components/ActionButton';

export default function PagamentosPendentesScreen() {
  const [items, setItems] = useState<PagamentoPendente[]>([]);
  const [processando, setProcessando] = useState<number | null>(null);
  const carregar = useCallback(async () => setItems(await listarPagamentosPendentes()), []);
  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));
  async function processar(item: PagamentoPendente, aprovar: boolean) {
    if (processando !== null) return;
    try { setProcessando(item.id); if (aprovar) await confirmarPagamento(item.id); else await rejeitarPagamento(item.id, 'Comprovativo incorreto'); await carregar(); showAppAlert(aprovar ? 'Pagamento aprovado' : 'Pagamento reprovado', aprovar ? 'O pagamento entrou no Caixa.' : 'O cliente poderá enviar um novo comprovativo.'); } catch (erro) { showAppAlert('Erro', erro instanceof Error ? erro.message : 'Não foi possível processar o pagamento.'); } finally { setProcessando(null); }
  }
  return <FlatList data={items} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.list} ListHeaderComponent={<><Text style={styles.title}>Pagamentos para confirmar</Text><Text style={styles.subtitle}>{items.length} aguardando aprovação</Text></>} ListEmptyComponent={<Text style={styles.empty}>Não existem pagamentos pendentes.</Text>} renderItem={({ item }) => <View style={styles.card}><Text style={styles.order}>{item.numero_pedido}</Text><Text style={styles.client}>{item.cliente}</Text><Text style={styles.amount}>{Number(item.valor ?? 0).toFixed(2)} MT • {item.metodo}</Text>{item.referencia && <Text style={styles.info}>Referência: {item.referencia}</Text>}{item.comprovativo_uri && <Image source={{ uri: item.comprovativo_uri }} style={styles.proof} resizeMode="cover" />}<View style={styles.actions}><Pressable style={styles.reject} disabled={processando !== null} onPress={() => processar(item, false)}><Text style={styles.rejectText}>{processando === item.id ? 'A processar...' : 'Reprovar'}</Text></Pressable><ActionButton title="Aprovar" loading={processando === item.id} disabled={processando !== null} style={styles.approve} onPress={() => processar(item, true)} /></View></View>} />;
}
const styles = StyleSheet.create({ list: { padding: 20, paddingBottom: 100, backgroundColor: '#F5F7FA', flexGrow: 1 }, title: { color: '#102A43', fontSize: 26, fontWeight: 'bold' }, subtitle: { color: '#627D98', marginTop: 5, marginBottom: 18 }, card: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 12 }, order: { color: '#102A43', fontWeight: 'bold', fontSize: 17 }, client: { color: '#627D98', marginTop: 3 }, amount: { color: '#B7791F', fontWeight: 'bold', marginTop: 12 }, info: { color: '#627D98', marginTop: 5 }, proof: { width: '100%', height: 180, borderRadius: 12, marginTop: 12 }, actions: { flexDirection: 'row', gap: 10, marginTop: 14 }, reject: { flex: 1, borderWidth: 1, borderColor: '#FDA29B', borderRadius: 10, padding: 13, alignItems: 'center' }, rejectText: { color: '#B42318', fontWeight: 'bold' }, approve: { flex: 1, backgroundColor: '#147D64', borderRadius: 10, padding: 13, alignItems: 'center' }, approveText: { color: '#FFF', fontWeight: 'bold' }, empty: { color: '#829AB1', textAlign: 'center', marginTop: 60 } });

