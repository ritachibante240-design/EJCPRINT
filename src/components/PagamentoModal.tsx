import { formatarDinheiro } from '../utils/formatters';
import { showAppAlert } from './AppAlert';
import React, { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { enviarPagamento, MetodoPagamento, TipoPagamento } from '../services/pagamentoService';
import ActionButton from './ActionButton';

export type PagamentoModalProps = {
  visible: boolean;
  pedidoId: number;
  numeroPedido: string;
  cliente?: string;
  total?: number;
  valor?: number;
  valorInicial?: number;
  tipoInicial?: TipoPagamento;
  tipo?: TipoPagamento;
  onClose: () => void;
  onEnviado: () => void;
};

export default function PagamentoModal({ visible, pedidoId, numeroPedido, cliente, total, valor: valorProp, valorInicial, tipoInicial = 'SINAL', tipo: tipoProp, onClose, onEnviado }: PagamentoModalProps) {
  const totalSeguro = Number(total ?? valorProp ?? 0);
  const [tipo, setTipo] = useState<TipoPagamento>(tipoProp ?? tipoInicial);
  const [metodo, setMetodo] = useState<MetodoPagamento>('M-Pesa');
  const [uri, setUri] = useState<string | null>(null);
  const [nome, setNome] = useState<string | null>(null);
  const [ehPdf, setEhPdf] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const valor = tipo === 'SINAL'
    ? Math.round((totalSeguro + Number.EPSILON) * 50) / 100
    : tipo === 'TOTAL'
      ? totalSeguro
      : Number(valorInicial ?? valorProp ?? 0);
  async function escolher(camera: boolean) {
    const permissao = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) return showAppAlert('Permissão necessária', 'Permita o acesso às imagens.');
    const resultado = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!resultado.canceled) { const imagem = resultado.assets[0]; setUri(imagem.uri); setNome(imagem.fileName ?? `comprovativo-${Date.now()}.jpg`); setEhPdf(false); }
  }
  async function escolherPdf() {
    try {
      const resultado = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        multiple: false,
        base64: false,
      });
      if (resultado.canceled) return;

      const documento = resultado.assets[0];
      if (!documento.name.toLowerCase().endsWith('.pdf') && documento.mimeType !== 'application/pdf') {
        return showAppAlert('Ficheiro inválido', 'Selecione um comprovativo em formato PDF.');
      }
      if ((documento.size ?? 0) > 5 * 1024 * 1024) {
        return showAppAlert('Ficheiro demasiado grande', 'O PDF deve ter no máximo 5 MB.');
      }

      setUri(documento.uri);
      setNome(documento.name);
      setEhPdf(true);
    } catch (erro) {
      showAppAlert('Não foi possível anexar o PDF', erro instanceof Error ? erro.message : 'Tente selecionar o ficheiro novamente.');
    }
  }
  async function confirmarEnvio() {
    if (!uri) return showAppAlert('Comprovativo necessário', 'Anexe o comprovativo antes de enviar.');
    try { setEnviando(true); await enviarPagamento(pedidoId, valor, metodo, tipo, undefined, nome ?? undefined, uri ?? undefined); showAppAlert('Pagamento enviado', 'A EJC Print irá analisar o comprovativo.'); setUri(null); setNome(null); setEhPdf(false); onEnviado(); onClose(); } catch (erro) { const mensagem = erro instanceof Error ? erro.message : 'Erro ao enviar pagamento.'; if (/comprovativo já foi enviado/i.test(mensagem)) { showAppAlert('Comprovativo repetido', 'Este comprovativo já foi utilizado noutro pagamento. Anexe um ficheiro diferente.', [{ text: 'Entendi' }]); } else { showAppAlert('Não foi possível enviar', mensagem); } } finally { setEnviando(false); }
  }
  return visible ? <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><View style={styles.overlay}><ScrollView contentContainerStyle={styles.content}><Text style={styles.title}>Pagamento do pedido</Text><Text style={styles.subtitle}>{numeroPedido}{cliente ? ` • ${cliente}` : ''}</Text><Text style={styles.label}>O que deseja pagar?</Text><View style={styles.row}><Pressable style={[styles.option, tipo === 'SINAL' && styles.selected]} onPress={() => setTipo('SINAL')}><Text>Sinal{`\n`}{formatarDinheiro(totalSeguro / 2)}</Text></Pressable><Pressable style={[styles.option, tipo === 'TOTAL' && styles.selected]} onPress={() => setTipo('TOTAL')}><Text>Total{`\n`}{formatarDinheiro(totalSeguro)}</Text></Pressable></View><Text style={styles.amount}>Valor: {formatarDinheiro(valor)}</Text><Text style={styles.label}>Método</Text><View style={styles.row}>{(['M-Pesa', 'e-Mola', 'Transferência'] as MetodoPagamento[]).map(m => <Pressable key={m} style={[styles.method, metodo === m && styles.selected]} onPress={() => setMetodo(m)}><Text>{m}</Text></Pressable>)}</View><Text style={styles.label}>Comprovativo</Text><View style={styles.row}><Pressable style={styles.button} onPress={() => escolher(true)}><Text>Tirar foto</Text></Pressable><Pressable style={styles.button} onPress={() => escolher(false)}><Text>Galeria</Text></Pressable></View><View style={styles.row}><Pressable style={[styles.button, styles.pdfButton]} onPress={escolherPdf}><Text>Anexar PDF (máx. 5 MB)</Text></Pressable></View>{uri && (ehPdf ? <View style={styles.pdfPreview}><Text style={styles.pdfName}>{nome}</Text></View> : <Image source={{ uri }} style={styles.preview} />)}<ActionButton title={`Enviar comprovativo • ${formatarDinheiro(valor)}`} loading={enviando} onPress={confirmarEnvio} /><Pressable onPress={onClose}><Text style={styles.cancel}>Cancelar</Text></Pressable></ScrollView></View></Modal> : null;
}
const styles = StyleSheet.create({ overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }, content: { backgroundColor: '#F5F7FA', padding: 20, paddingBottom: 45, borderTopLeftRadius: 22, borderTopRightRadius: 22 }, title: { color: '#102A43', fontSize: 23, fontWeight: 'bold' }, subtitle: { color: '#627D98', marginTop: 4, marginBottom: 18 }, label: { color: '#243B53', fontWeight: 'bold', marginTop: 14, marginBottom: 8 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, option: { flex: 1, backgroundColor: '#FFF', padding: 15, borderRadius: 12, borderWidth: 1, borderColor: '#D9E2EC' }, method: { backgroundColor: '#FFF', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#D9E2EC' }, selected: { borderColor: '#102A43', backgroundColor: '#EAF0F6' }, amount: { color: '#102A43', fontSize: 21, fontWeight: 'bold', marginTop: 18 }, button: { flex: 1, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#BCCCDC', padding: 14, borderRadius: 11, alignItems: 'center' }, pdfButton: { borderColor: '#9FB3C8' }, pdfPreview: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#D9E2EC', marginTop: 10, padding: 14 }, pdfName: { color: '#243B53', fontWeight: '600' }, preview: { width: '100%', height: 150, borderRadius: 12, marginTop: 10 }, send: { backgroundColor: '#102A43', minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 20 }, sendText: { color: '#FFF', fontWeight: 'bold' }, cancel: { textAlign: 'center', color: '#627D98', marginTop: 14 } });


