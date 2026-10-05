import { showAppAlert } from '../../components/AppAlert';
import ActionButton from '../../components/ActionButton';
import { obterTokenAdministrador } from '../../services/adminAuthService';
import { abrirArquivoPedido } from '../../services/arquivoRemotoService';
import {
  confirmarPagamento,
  listarPagamentosPendentes,
  PagamentoPendente,
  rejeitarPagamento,
} from '../../services/pagamentoService';
import {
  sincronizarPagamentosPendentes,
  sincronizarPagamentosRecebidos,
} from '../../services/sincronizacaoPagamentoService';
import {
  sincronizarPedidosPendentes,
  sincronizarPedidosRecebidos,
} from '../../services/sincronizacaoPedidoService';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

export default function PagamentosPendentesScreen() {
  const [items, setItems] = useState<PagamentoPendente[]>([]);
  const [processando, setProcessando] = useState<number | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const carregar = useCallback(async (mostrarErro = true) => {
    setAtualizando(true);
    let erroSincronizacao: unknown;
    try {
      await sincronizarPedidosPendentes();
      await sincronizarPedidosRecebidos();
      await sincronizarPagamentosPendentes();
      await sincronizarPagamentosRecebidos();
    } catch (erro) {
      erroSincronizacao = erro;
      console.warn('Não foi possível atualizar pagamentos do servidor.', erro);
    }

    try {
      setItems(await listarPagamentosPendentes());
      setToken(await obterTokenAdministrador());
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

  async function processar(item: PagamentoPendente, aprovar: boolean) {
    if (processando !== null) return;
    try {
      setProcessando(item.id);
      if (aprovar) await confirmarPagamento(item.id);
      else await rejeitarPagamento(item.id, 'Comprovativo incorreto');
      await carregar(false);
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

  async function abrirComprovativo(item: PagamentoPendente) {
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
      data={items}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => void carregar()} />}
      ListHeaderComponent={<><Text style={styles.title}>Pagamentos para confirmar</Text><Text style={styles.subtitle}>{items.length} aguardando aprovação</Text></>}
      ListEmptyComponent={atualizando ? <ActivityIndicator style={styles.loading} /> : <Text style={styles.empty}>Não existem pagamentos pendentes.</Text>}
      renderItem={({ item }) => {
        const comprovativoRemoto = item.comprovativo_uri?.startsWith('http') ?? false;
        const comprovativoPdf = item.comprovativo_nome?.toLowerCase().endsWith('.pdf') ?? false;
        return (
          <View style={styles.card}>
            <Text style={styles.order}>{item.numero_pedido}</Text>
            <Text style={styles.client}>{item.cliente}</Text>
            <Text style={styles.amount}>{Number(item.valor ?? 0).toFixed(2)} MT • {item.metodo}</Text>
            {item.referencia && <Text style={styles.info}>Referência: {item.referencia}</Text>}
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
            <View style={styles.actions}>
              <Pressable style={styles.reject} disabled={processando !== null} onPress={() => void processar(item, false)}>
                <Text style={styles.rejectText}>{processando === item.id ? 'A processar...' : 'Reprovar'}</Text>
              </Pressable>
              <ActionButton title="Aprovar" loading={processando === item.id} disabled={processando !== null} style={styles.approve} onPress={() => void processar(item, true)} />
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 20, paddingBottom: 100, backgroundColor: '#F5F7FA', flexGrow: 1 },
  title: { color: '#102A43', fontSize: 26, fontWeight: 'bold' },
  subtitle: { color: '#627D98', marginTop: 5, marginBottom: 18 },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 12 },
  order: { color: '#102A43', fontWeight: 'bold', fontSize: 17 },
  client: { color: '#627D98', marginTop: 3 },
  amount: { color: '#B7791F', fontWeight: 'bold', marginTop: 12 },
  info: { color: '#627D98', marginTop: 5 },
  proof: { width: '100%', height: 180, borderRadius: 12, marginTop: 12 },
  openProof: { marginTop: 12, borderRadius: 10, backgroundColor: '#F0F4F8', padding: 14, alignItems: 'center' },
  openProofText: { color: '#102A43', fontWeight: 'bold' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  reject: { flex: 1, borderWidth: 1, borderColor: '#FDA29B', borderRadius: 10, padding: 13, alignItems: 'center' },
  rejectText: { color: '#B42318', fontWeight: 'bold' },
  approve: { flex: 1, backgroundColor: '#147D64', borderRadius: 10, padding: 13, alignItems: 'center' },
  empty: { color: '#829AB1', textAlign: 'center', marginTop: 60 },
  loading: { marginTop: 40 },
});
