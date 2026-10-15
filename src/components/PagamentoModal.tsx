import { formatarDinheiro } from '../utils/formatters';
import { colors, fontWeights, radii, spacing } from '../theme';
import { showAppAlert } from './AppAlert';
import React, { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { enviarPagamento, MetodoPagamento, TipoPagamento } from '../services/pagamentoService';
import ActionButton from './ActionButton';

const numerosPagamento: Partial<Record<MetodoPagamento, string>> = {
  'M-Pesa': '849087533',
  'e-Mola': '879778409',
  'Transferência': '332454503',
};

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
  const [numeroCopiado, setNumeroCopiado] = useState(false);
  const numeroPagamento = numerosPagamento[metodo];
  const valor = tipo === 'SINAL'
    ? Math.round((totalSeguro + Number.EPSILON) * 50) / 100
    : tipo === 'TOTAL'
      ? totalSeguro
      : Number(valorInicial ?? valorProp ?? 0);
  function fechar() {
    setNumeroCopiado(false);
    onClose();
  }
  async function copiarNumeroPagamento() {
    if (!numeroPagamento) return;
    try {
      await Clipboard.setStringAsync(numeroPagamento);
      setNumeroCopiado(true);
    } catch (erro) {
      showAppAlert(
        'Não foi possível copiar',
        erro instanceof Error ? erro.message : 'Copie o número manualmente.',
      );
    }
  }
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
    try {
      setEnviando(true);
      await enviarPagamento(pedidoId, valor, metodo, tipo, undefined, nome ?? undefined, uri ?? undefined);
      showAppAlert('Pagamento enviado', 'A EJC Print irá analisar o comprovativo.');
      setUri(null);
      setNome(null);
      setEhPdf(false);
      onEnviado();
      fechar();
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Erro ao enviar pagamento.';
      if (/comprovativo já foi enviado/i.test(mensagem)) {
        showAppAlert(
          'Comprovativo repetido',
          'Este comprovativo já foi utilizado noutro pagamento. Anexe um ficheiro diferente.',
          [{ text: 'Entendi' }],
        );
      } else {
        showAppAlert('Não foi possível enviar', mensagem);
      }
    } finally {
      setEnviando(false);
    }
  }
  return visible ? (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={fechar}
    >
      <View style={styles.overlay}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Pagamento do pedido</Text>
          <Text style={styles.subtitle}>
            {numeroPedido}
            {cliente ? ` • ${cliente}` : ""}
          </Text>
          <Text style={styles.label}>O que deseja pagar?</Text>
          <View style={styles.row}>
            <Pressable
              style={[styles.option, tipo === "SINAL" && styles.selected]}
              onPress={() => setTipo("SINAL")}
            >
              <Text>
                Sinal{"\n"}
                {formatarDinheiro(totalSeguro / 2)}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.option, tipo === "TOTAL" && styles.selected]}
              onPress={() => setTipo("TOTAL")}
            >
              <Text>
                Total{"\n"}
                {formatarDinheiro(totalSeguro)}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.amount}>Valor: {formatarDinheiro(valor)}</Text>
          <Text style={styles.label}>Método</Text>
          <View style={styles.row}>
            {(
              ["M-Pesa", "e-Mola", "Transferência"] as MetodoPagamento[]
            ).map((m) => (
              <Pressable
                key={m}
                style={[styles.method, metodo === m && styles.selected]}
                onPress={() => {
                  setMetodo(m);
                  setNumeroCopiado(false);
                }}
              >
                <Text>{m}</Text>
              </Pressable>
            ))}
          </View>
          {numeroPagamento && (
            <View style={styles.paymentNumber}>
              <Text style={styles.paymentNumberLabel}>
                Número para {metodo}
              </Text>
              <Text style={styles.paymentNumberValue}>{numeroPagamento}</Text>
              <Pressable
                style={styles.copyNumberButton}
                onPress={() => void copiarNumeroPagamento()}
                accessibilityRole="button"
                accessibilityLabel={`Copiar número ${numeroPagamento} para ${metodo}`}
              >
                <Ionicons
                  name={numeroCopiado ? 'checkmark-circle-outline' : 'copy-outline'}
                  size={18}
                  color={colors.brand}
                />
                <Text style={styles.copyNumberText}>
                  {numeroCopiado ? 'Número copiado' : 'Copiar número'}
                </Text>
              </Pressable>
              <Text style={styles.paymentInstructions}>
                Faça o pagamento para este número e anexe o comprovativo.
              </Text>
            </View>
          )}
          <Text style={styles.label}>Comprovativo</Text>
          <View style={styles.row}>
            <Pressable style={styles.button} onPress={() => escolher(true)}>
              <Text>Tirar foto</Text>
            </Pressable>
            <Pressable style={styles.button} onPress={() => escolher(false)}>
              <Text>Galeria</Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            <Pressable
              style={[styles.button, styles.pdfButton]}
              onPress={escolherPdf}
            >
              <Text>Anexar PDF (máx. 5 MB)</Text>
            </Pressable>
          </View>
          {uri &&
            (ehPdf ? (
              <View style={styles.pdfPreview}>
                <Text style={styles.pdfName}>{nome}</Text>
              </View>
            ) : (
              <Image source={{ uri }} style={styles.preview} />
            ))}
          {uri && (
            <View style={styles.attachmentRow}>
              <Ionicons name="attach-outline" size={18} color={colors.brand} />
              <Text style={styles.attachmentName} numberOfLines={2}>
                {nome ?? 'Comprovativo selecionado'}
              </Text>
              <Pressable
                onPress={() => {
                  setUri(null);
                  setNome(null);
                  setEhPdf(false);
                }}
                accessibilityRole="button"
                accessibilityLabel="Remover comprovativo selecionado"
              >
                <Text style={styles.removeAttachment}>Remover</Text>
              </Pressable>
            </View>
          )}
          <ActionButton
            title={`Enviar comprovativo • ${formatarDinheiro(valor)}`}
            loading={enviando}
            onPress={confirmarEnvio}
          />
          <Pressable onPress={fechar}>
            <Text style={styles.cancel}>Cancelar</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  ) : null;
}
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  content: {
    backgroundColor: colors.background,
    padding: spacing.xl,
    paddingBottom: 45,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  title: { color: colors.brand, fontSize: 23, fontWeight: fontWeights.bold },
  subtitle: { color: colors.muted, marginTop: spacing.xs, marginBottom: 18 },
  label: {
    color: colors.text,
    fontWeight: fontWeights.bold,
    marginTop: 14,
    marginBottom: spacing.sm,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  option: {
    flex: 1,
    backgroundColor: "#FFF",
    padding: 15,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  method: {
    backgroundColor: "#FFF",
    padding: spacing.md,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selected: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  paymentNumber: {
    backgroundColor: colors.brandSoft,
    borderRadius: radii.sm,
    padding: 14,
    marginTop: 10,
  },
  paymentNumberLabel: { color: "#486581", fontSize: 13 },
  paymentNumberValue: {
    color: colors.brand,
    fontSize: 22,
    fontWeight: fontWeights.bold,
    marginTop: 3,
  },
  copyNumberButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 10,
    minHeight: 40,
    paddingHorizontal: 10,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
  },
  copyNumberText: { color: colors.brand, fontWeight: fontWeights.semibold, fontSize: 13 },
  paymentInstructions: { color: colors.muted, fontSize: 12, marginTop: 9 },
  amount: {
    color: colors.brand,
    fontSize: 21,
    fontWeight: fontWeights.bold,
    marginTop: 18,
  },
  button: {
    flex: 1,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    borderRadius: 11,
    alignItems: "center",
  },
  pdfButton: { borderColor: colors.subtle },
  pdfPreview: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 10,
    padding: 14,
  },
  pdfName: { color: colors.text, fontWeight: fontWeights.semibold },
  preview: { width: "100%", height: 150, borderRadius: radii.md, marginTop: 10 },
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    padding: 10,
    backgroundColor: colors.brandSoft,
    borderRadius: radii.sm,
  },
  attachmentName: { color: colors.text, flex: 1, fontSize: 12 },
  removeAttachment: { color: colors.danger, fontWeight: fontWeights.semibold, fontSize: 12 },
  send: {
    backgroundColor: colors.brand,
    minHeight: 52,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xl,
  },
  sendText: { color: "#FFF", fontWeight: fontWeights.bold },
  cancel: { textAlign: "center", color: colors.muted, marginTop: 14 },
});
