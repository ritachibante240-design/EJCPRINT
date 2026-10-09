import { formatarDinheiro } from '../../utils/formatters';
import { showAppAlert } from '../../components/AppAlert';
import React, { useCallback, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View, Modal, TextInput, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useResponsiveContent } from '../../hooks/useResponsive';
import { useFocusEffect } from '@react-navigation/native';
import { listarPedidos, Pedido } from '../../services/pedidoService';
import { sincronizarPedidosCliente } from '../../services/sincronizacaoPedidoService';
import { enviarPagamento, registrarPagamentoDinheiro, determinarTipoPagamento, listarPagamentosPedido, MetodoPagamento, TipoPagamento, Pagamento } from '../../services/pagamentoService';
import { obterEtapasPedido, obterNomeEstado } from '../../utils/estadoPedido';
import PagamentoModal from '../../components/PagamentoModal';


function ProgressoPedido({ estado, servico }: { estado: string; servico: string }) {
  if (estado === 'Cancelado') return <View style={styles.cancelledBox}><Ionicons name="close-circle-outline" size={22} color="#B42318" /><View style={{ flex: 1 }}><Text style={styles.cancelledTitle}>Pedido cancelado</Text><Text style={styles.cancelledDescription}>Este pedido não continuará para produção.</Text></View></View>;
  const etapas = obterEtapasPedido(servico); const atual = etapas.findIndex((item) => item.estadoInterno === estado);
  return <View style={styles.timeline}>{etapas.map((etapa, index) => { const concluida = index < atual; const corrente = index === atual; return <View key={etapa.estadoInterno} style={styles.timelineItem}><View style={styles.timelineLeft}><View style={[styles.timelineCircle, concluida && styles.timelineCircleDone, corrente && styles.timelineCircleCurrent]}>{concluida ? <Ionicons name="checkmark" size={15} color="#FFF" /> : corrente ? <View style={styles.currentDot} /> : null}</View>{index < etapas.length - 1 && <View style={[styles.timelineLine, concluida && styles.timelineLineDone]} />}</View><View style={styles.timelineContent}><Text style={[styles.timelineTitle, (concluida || corrente) && styles.timelineTitleActive]}>{etapa.titulo}</Text>{corrente && <Text style={styles.timelineCurrentText}>Estado atual</Text>}</View></View>; })}</View>;
}

function HistoricoPagamentos({ itens }: { itens: Pagamento[] }) {
  if (itens.length === 0) return null;
  return <View style={styles.paymentHistory}><Text style={styles.historyTitle}>Histórico de pagamentos</Text>{itens.map((pagamento) => { const confirmado = pagamento.status === 'CONFIRMADO'; const rejeitado = pagamento.status === 'REJEITADO'; return <View key={pagamento.id} style={styles.historyItem}><View style={[styles.historyIcon, confirmado && styles.historyIconSuccess, rejeitado && styles.historyIconRejected]}><Ionicons name={confirmado ? 'checkmark' : rejeitado ? 'close' : 'time-outline'} size={17} color={confirmado ? '#157347' : rejeitado ? '#B42318' : '#9A6700'} /></View><View style={{ flex: 1 }}><View style={styles.historyTop}><Text style={styles.historyValue}>{Number(pagamento.valor ?? 0).toFixed(2)} MT</Text><Text style={[styles.historyStatus, confirmado && styles.statusSuccess, rejeitado && styles.statusRejected]}>{confirmado ? 'Confirmado' : rejeitado ? 'Rejeitado' : 'Em análise'}</Text></View><Text style={styles.historyDetails}>{pagamento.tipo} • {pagamento.metodo}</Text>{pagamento.referencia && <Text style={styles.historyReference}>Referência: {pagamento.referencia}</Text>}{rejeitado && pagamento.motivo_rejeicao && <Text style={styles.historyReason}>Motivo: {pagamento.motivo_rejeicao}</Text>}</View></View>; })}</View>;
}

export default function MeusPedidosScreen() {
  const { isDesktop } = useResponsiveContent(20);
  const [pedidos, setPedidos] = useState<Pedido[]>([]); const [carregando, setCarregando] = useState(true); const [atualizando, setAtualizando] = useState(false); const [pedidoAberto, setPedidoAberto] = useState<number | null>(null); const [pagamentos, setPagamentos] = useState<Record<number, Pagamento[]>>({}); const [pagamentoAberto, setPagamentoAberto] = useState(false); const [pedidoParaPagamento, setPedidoParaPagamento] = useState<Pedido | null>(null); const [valorPagamento, setValorPagamento] = useState(0); const [tipoPagamento, setTipoPagamento] = useState<TipoPagamento>('SALDO'); const [pagamentoPedido, setPagamentoPedido] = useState<Pedido | null>(null); const [metodo, setMetodo] = useState<MetodoPagamento>('Dinheiro'); const [tipo, setTipo] = useState<TipoPagamento>('TOTAL'); const [valor, setValor] = useState(''); const [provaUri, setProvaUri] = useState<string | null>(null); const [provaNome, setProvaNome] = useState<string | null>(null);
  const carregar = useCallback(async () => {
    try {
      setPedidos(await listarPedidos());
      setCarregando(false);
      try {
        await sincronizarPedidosCliente();
      } catch (erro) {
        console.warn('Não foi possível atualizar os pedidos do servidor.', erro);
        showAppAlert(
          'Pedidos não atualizados',
          'Os pedidos guardados neste dispositivo continuam disponíveis, mas não foi possível verificar o estado mais recente dos pagamentos. Verifique a ligação e tente novamente.'
        );
      }
      setPedidos(await listarPedidos());
      if (pedidoAberto !== null) await carregarPagamentos(pedidoAberto);
    } catch (erro) {
      showAppAlert(
        'Pedidos indisponíveis',
        erro instanceof Error ? erro.message : 'Não foi possível carregar os pedidos.'
      );
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, [pedidoAberto]);
  useFocusEffect(useCallback(() => {
    carregar();
    let sincronizando = false;
    const intervalo = setInterval(() => {
      if (pedidoAberto === null || sincronizando) return;
      sincronizando = true;
      void (async () => {
        try {
          await sincronizarPedidosCliente(pedidoAberto);
          setPedidos(await listarPedidos());
          await carregarPagamentos(pedidoAberto);
        } catch (erro) {
          console.warn('Não foi possível atualizar o acompanhamento do pedido.', erro);
        } finally {
          sincronizando = false;
        }
      })();
    }, 15_000);
    return () => clearInterval(intervalo);
  }, [carregar, pedidoAberto]));
  async function carregarPagamentos(pedidoId: number) { try { const dados = await listarPagamentosPedido(pedidoId); setPagamentos(anterior => ({ ...anterior, [pedidoId]: dados })); } catch (error) { console.log('Erro ao carregar pagamentos:', error); } }
  function abrirPagamento(pedido: Pedido, valor: number, tipoPagamentoSelecionado: TipoPagamento) { if (valor <= 0) return showAppAlert('Pagamento', 'Este pedido já está totalmente pago.'); setPagamentoPedido(null); setPedidoParaPagamento(pedido); setValorPagamento(valor); setTipoPagamento(tipoPagamentoSelecionado); setPagamentoAberto(true); }
  async function escolherProva(camera = false) { const permissao = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync(); if (!permissao.granted) return; const r = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 }); if (!r.canceled) { setProvaUri(r.assets[0].uri); setProvaNome(r.assets[0].fileName ?? `comprovativo-${Date.now()}.jpg`); } }
  async function enviarPagamentoCliente() { if (!pagamentoPedido) return; const numero = Number(valor.replace(',', '.')); const falta = Math.max(pagamentoPedido.total - (pagamentoPedido.valor_pago ?? 0), 0); if (!Number.isFinite(numero) || numero <= 0 || numero > falta) return showAppAlert('Valor inválido', `O valor deve ser até ${falta.toFixed(2)} MT.`); const tipoCalculado = tipo === 'TOTAL' && (pagamentoPedido.valor_pago ?? 0) > 0 ? 'SALDO' : determinarTipoPagamento(pagamentoPedido.total, pagamentoPedido.valor_pago ?? 0, numero); try { if (metodo === 'Dinheiro') await registrarPagamentoDinheiro(pagamentoPedido.id, numero, tipoCalculado); else await enviarPagamento(pagamentoPedido.id, numero, metodo, tipoCalculado, undefined, provaNome ?? undefined, provaUri ?? undefined); setPagamentoPedido(null); setValor(''); setProvaUri(null); setProvaNome(null); await carregar(); showAppAlert(metodo === 'Dinheiro' ? 'Pagamento registado' : 'Pagamento enviado', metodo === 'Dinheiro' ? 'O pagamento foi confirmado.' : 'O comprovativo está aguardando confirmação da EJC Print.'); } catch (erro) { showAppAlert('Não foi possível enviar', erro instanceof Error ? erro.message : 'Ocorreu um erro.'); } }
  if (carregando) return <View style={styles.center}><ActivityIndicator size="large" /><Text style={styles.loadingText}>A carregar pedidos...</Text></View>;
  return <><FlatList style={styles.container} contentContainerStyle={[styles.content, isDesktop && { maxWidth: 900, width: '100%', alignSelf: 'center' }]} data={pedidos} keyExtractor={item => item.id.toString()} refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(); }} />} ListHeaderComponent={<View style={styles.header}><Text style={styles.title}>Meus pedidos</Text><Text style={styles.subtitle}>{pedidos.length} pedido(s) registado(s)</Text></View>} ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>Nenhum pedido</Text><Text style={styles.emptyText}>Os seus pedidos aparecerão aqui.</Text></View>} renderItem={({ item }) => { const aberto = pedidoAberto === item.id; const paginas = item.servico === 'Digitalização' ? item.numero_paginas : item.numero_paginas * item.numero_copias; return <View style={styles.orderCard}><View style={styles.orderHeader}><View><Text style={styles.orderNumber}>{item.numero}</Text><Text style={styles.orderDate}>{new Date(item.data_criacao).toLocaleDateString('pt-PT')}</Text></View><View style={[styles.statusBadge, item.estado === 'Entregue' && styles.statusDelivered, item.estado === 'Pronto para levantamento' && styles.statusReady, item.estado === 'Cancelado' && styles.statusCancelled]}><Text style={styles.statusText}>{obterNomeEstado(item.estado, item.servico)}</Text></View></View><View style={styles.serviceArea}><View style={styles.serviceIcon}><Ionicons name={item.servico === 'Digitalização' ? 'scan-outline' : 'print-outline'} size={23} color="#102A43" /></View><View style={{ flex: 1 }}><Text style={styles.serviceName}>{item.servico}</Text><Text style={styles.serviceInfo}>{paginas} páginas • {item.numero_copias} {item.numero_copias === 1 ? 'cópia' : 'cópias'}</Text></View></View><View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.totalValue}>{Number(item.total ?? 0).toFixed(2)} MT</Text></View><Pressable style={styles.trackButton} onPress={() => { setPedidoAberto(aberto ? null : item.id); if (!aberto) carregarPagamentos(item.id); }}><Ionicons name="location-outline" size={19} color="#102A43" /><Text style={styles.trackButtonText}>{aberto ? 'Fechar acompanhamento' : 'Acompanhar pedido'}</Text><Ionicons name={aberto ? 'chevron-up' : 'chevron-down'} size={18} color="#102A43" /></Pressable>{aberto && <View style={styles.trackingArea}><Text style={styles.trackingTitle}>Progresso do pedido</Text><ProgressoPedido estado={item.estado} servico={item.servico} />{item.estado === 'Pronto para levantamento' && <View style={styles.readyMessage}><Ionicons name="checkmark-circle" size={23} color="#147D64" /><Text style={styles.readyMessageText}>O seu pedido está pronto para levantamento.</Text></View>}</View>}{aberto && <HistoricoPagamentos itens={pagamentos[item.id] ?? []} />}{(item.total - (item.valor_pago ?? 0)) > 0 && item.estado !== 'Cancelado' && <Pressable style={styles.payButton} onPress={() => abrirPagamento(item, Math.max(item.total - (item.valor_pago ?? 0), 0), (item.valor_pago ?? 0) >= item.total * 0.5 ? 'SALDO' : 'SINAL')}><Ionicons name="card-outline" size={18} color="#FFFFFF" /><Text style={styles.payButtonText}>Pagar pedido</Text></Pressable>}</View>; }} />{pedidoParaPagamento && <PagamentoModal key={`${pedidoParaPagamento.id}-${tipoPagamento}`} visible={pagamentoAberto} pedidoId={pedidoParaPagamento.id} numeroPedido={pedidoParaPagamento.numero} cliente={pedidoParaPagamento.cliente} total={pedidoParaPagamento.total} valorInicial={valorPagamento} tipoInicial={tipoPagamento} onClose={() => setPagamentoAberto(false)} onEnviado={async () => { setPagamentoAberto(false); await carregarPagamentos(pedidoParaPagamento.id); await carregar(); }} />}</>;
}

const styles = StyleSheet.create({ paymentHistory: { marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#E4E7EB' }, historyTitle: { fontSize: 14, fontWeight: '700', color: '#102A43', marginBottom: 12 }, historyItem: { flexDirection: 'row', marginBottom: 15 }, historyIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#FFF8E6', alignItems: 'center', justifyContent: 'center', marginRight: 10 }, historyIconSuccess: { backgroundColor: '#ECFDF3' }, historyIconRejected: { backgroundColor: '#FFF1F0' }, historyTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, historyValue: { color: '#102A43', fontWeight: '700', fontSize: 14 }, historyStatus: { color: '#9A6700', fontSize: 12, fontWeight: '700' }, statusSuccess: { color: '#157347' }, statusRejected: { color: '#B42318' }, historyDetails: { color: '#627D98', fontSize: 12, marginTop: 3 }, historyReference: { color: '#829AB1', fontSize: 11, marginTop: 3 }, historyReason: { color: '#B42318', fontSize: 12, marginTop: 4 },  container: { flex: 1, backgroundColor: '#F5F7FA' }, content: { padding: 20, paddingBottom: 45 }, header: { marginBottom: 20 }, title: { fontSize: 28, fontWeight: 'bold', color: '#102A43' }, subtitle: { color: '#627D98', marginTop: 5 }, orderCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 17, marginBottom: 14 }, orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, orderNumber: { color: '#102A43', fontSize: 18, fontWeight: 'bold' }, orderDate: { color: '#829AB1', fontSize: 12, marginTop: 3 }, statusBadge: { backgroundColor: '#E8F1FF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, maxWidth: '52%' }, statusDelivered: { backgroundColor: '#E3FCEC' }, statusReady: { backgroundColor: '#FFF3C4' }, statusCancelled: { backgroundColor: '#FFF0F0' }, statusText: { color: '#334E68', fontSize: 11, fontWeight: 'bold', textAlign: 'center' }, serviceArea: { flexDirection: 'row', alignItems: 'center', marginTop: 18 }, serviceIcon: { width: 45, height: 45, borderRadius: 13, backgroundColor: '#F0F4F8', alignItems: 'center', justifyContent: 'center', marginRight: 11 }, serviceName: { color: '#102A43', fontWeight: 'bold', fontSize: 15 }, serviceInfo: { color: '#829AB1', fontSize: 13, marginTop: 3 }, totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, paddingTop: 15, borderTopWidth: 1, borderTopColor: '#E6EAF0' }, totalLabel: { color: '#627D98' }, totalValue: { color: '#102A43', fontSize: 20, fontWeight: 'bold' }, trackButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 48, borderRadius: 12, backgroundColor: '#F0F4F8', marginTop: 16, gap: 7 }, trackButtonText: { color: '#102A43', fontWeight: 'bold', flex: 1, textAlign: 'center' }, trackingArea: { marginTop: 18 }, trackingTitle: { color: '#102A43', fontSize: 16, fontWeight: 'bold', marginBottom: 18 }, timeline: { paddingHorizontal: 5 }, timelineItem: { flexDirection: 'row', minHeight: 58 }, timelineLeft: { width: 35, alignItems: 'center' }, timelineCircle: { width: 25, height: 25, borderRadius: 13, borderWidth: 2, borderColor: '#BCCCDC', backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' }, timelineCircleDone: { backgroundColor: '#147D64', borderColor: '#147D64' }, timelineCircleCurrent: { borderColor: '#102A43' }, currentDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#102A43' }, timelineLine: { width: 2, flex: 1, backgroundColor: '#D9E2EC' }, timelineLineDone: { backgroundColor: '#147D64' }, timelineContent: { flex: 1, paddingLeft: 8 }, timelineTitle: { color: '#829AB1', fontSize: 14 }, timelineTitleActive: { color: '#243B53', fontWeight: '600' }, timelineCurrentText: { color: '#627D98', fontSize: 11, marginTop: 3 }, readyMessage: { backgroundColor: '#E3FCEC', borderRadius: 12, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 5 }, readyMessageText: { color: '#147D64', flex: 1, fontWeight: '600' }, cancelledBox: { backgroundColor: '#FFF0F0', padding: 14, borderRadius: 12, flexDirection: 'row', gap: 10 }, cancelledTitle: { color: '#B42318', fontWeight: 'bold' }, cancelledDescription: { color: '#7A271A', fontSize: 12, marginTop: 3 }, center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F7FA' }, loadingText: { marginTop: 10, color: '#627D98' }, empty: { alignItems: 'center', padding: 30 }, emptyTitle: { fontSize: 22, fontWeight: 'bold', color: '#102A43' }, emptyText: { color: '#829AB1', marginTop: 5 }, payButton: { backgroundColor: '#102A43', minHeight: 46, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 12 }, payButtonText: { color: '#FFF', fontWeight: 'bold' }, modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }, paymentModal: { backgroundColor: '#FFF', padding: 22, borderTopLeftRadius: 22, borderTopRightRadius: 22 }, modalTitle: { color: '#102A43', fontSize: 23, fontWeight: 'bold' }, modalSubtitle: { color: '#627D98', marginTop: 4, marginBottom: 18 }, modalLabel: { color: '#243B53', fontWeight: '600', marginTop: 10, marginBottom: 7 }, modalInput: { borderWidth: 1, borderColor: '#D9E2EC', borderRadius: 11, padding: 14 }, methods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, method: { borderWidth: 1, borderColor: '#BCCCDC', borderRadius: 9, padding: 10 }, methodSelected: { backgroundColor: '#E8F1FF', borderColor: '#102A43' }, proofActions: { flexDirection: 'row', gap: 8, marginTop: 12 }, proofPreview: { width: 80, height: 80, borderRadius: 9, marginTop: 10 }, confirmButton: { backgroundColor: '#102A43', minHeight: 52, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 18 }, confirmText: { color: '#FFF', fontWeight: 'bold' }, cancel: { textAlign: 'center', color: '#627D98', marginTop: 15 } });











