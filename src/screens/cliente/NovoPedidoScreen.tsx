import { showAppAlert } from "../../components/AppAlert";
import React, { Fragment, useMemo, useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import * as FileSystemLegacy from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import { useResponsiveContent } from "../../hooks/useResponsive";
import { criarPedido } from "../../services/pedidoService";
import { calcularImpressao } from "../../utils/calcularImpressao";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import PagamentoModal from "../../components/PagamentoModal";
import { TipoPagamento } from "../../services/pagamentoService";

type Servico = { id: number; nome: string; preco: number };
const servicos: Servico[] = [
  { id: 1, nome: "Fotocópia P/B", preco: 2 },
  { id: 2, nome: "Impressão P/B", preco: 3 },
  { id: 3, nome: "Colorida simples", preco: 5 },
  { id: 4, nome: "Colorida com imagens", preco: 10 },
  { id: 5, nome: "Digitalização", preco: 15 },
];

function Progresso({ etapa }: { etapa: number }) {
  return (
    <View style={styles.progressContainer}>
      {[1, 2, 3].map((n, i) => (
        <Fragment key={n}>
          <View style={styles.progressItem}>
            <View
              style={[
                styles.progressCircle,
                n <= etapa && styles.progressCircleActive,
              ]}
            >
              {n < etapa ? (
                <Ionicons name="checkmark" size={17} color="#FFF" />
              ) : (
                <Text
                  style={[
                    styles.progressNumber,
                    n <= etapa && styles.progressNumberActive,
                  ]}
                >
                  {n}
                </Text>
              )}
            </View>
            <Text style={styles.progressLabel}>
              {n === 1 ? "Serviço" : n === 2 ? "Impressão" : "Confirmar"}
            </Text>
          </View>
          {i < 2 && (
            <View
              style={[
                styles.progressLine,
                n < etapa && styles.progressLineActive,
              ]}
            />
          )}
        </Fragment>
      ))}
    </View>
  );
}

export default function NovoPedidoScreen({ navigation }: any) {
  const { isDesktop } = useResponsiveContent(20);
  const [etapa, setEtapa] = useState(1);
  const [tipoEncadernacao, setTipoEncadernacao] = useState("SEM_ENCADERNACAO");
  const [servicoSelecionado, setServicoSelecionado] = useState<Servico | null>(
    null,
  );
  const [numeroPaginas, setNumeroPaginas] = useState("");
  const [numeroCopias, setNumeroCopias] = useState("1");
  const [frenteVerso, setFrenteVerso] = useState(false);
  const [cliente, setCliente] = useState("");
  const [contacto, setContacto] = useState("");
  const [instrucoesDigitalizacao, setInstrucoesDigitalizacao] = useState("");
  const [documento, setDocumento] =
    useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [formatoDigitalizacao, setFormatoDigitalizacao] = useState<
    "PDF" | "Imagem"
  >("PDF");
  const [pagamentoAberto, setPagamentoAberto] = useState(false);
  const [pedidoParaPagamento, setPedidoParaPagamento] = useState<{
    id: number;
    numero: string;
    total: number;
  } | null>(null);
  const [valorPagamento, setValorPagamento] = useState(0);
  const [tipoPagamento, setTipoPagamento] = useState<TipoPagamento>("SINAL");
  const servico = servicoSelecionado?.nome ?? "";
  const ehDigitalizacao = servico === "Digitalização";
  const ehImpressao = [
    "Impressão P/B",
    "Colorida simples",
    "Colorida com imagens",
  ].includes(servico);
  const ehFotocopia = servico === "Fotocópia P/B";
  const calculo = useMemo(() => {
    const p = Number(numeroPaginas);
    const c = Number(numeroCopias);
    if (!Number.isInteger(p) || p <= 0 || !Number.isInteger(c) || c <= 0)
      return null;
    try {
      return calcularImpressao(p, c, frenteVerso);
    } catch {
      return null;
    }
  }, [numeroPaginas, numeroCopias, frenteVerso]);
  const precoEncadernacao =
    tipoEncadernacao === "ESPIRAL_MEDIA"
      ? 50
      : tipoEncadernacao === "ESPIRAL_PEQUENA"
        ? 35
        : 0;
  const total =
    servicoSelecionado && calculo
      ? Math.round(
          (servicoSelecionado.preco * calculo.totalPaginasImpressas +
            precoEncadernacao) *
            100,
        ) / 100
      : 0;
  async function selecionarDocumento() {
    try {
      const r = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ],
        copyToCacheDirectory: false,
        multiple: false,
        base64: false,
      });
      if (!r.canceled) {
        const arquivo = r.assets[0];
        const documentoUri = await guardarDocumentoDoPedido(arquivo);
        setDocumento({ ...arquivo, uri: documentoUri });
      }
    } catch (erro) {
      showAppAlert(
        "Erro",
        erro instanceof Error
          ? erro.message
          : "Não foi possível selecionar e guardar o documento.",
      );
    }
  }
  async function guardarDocumentoDoPedido(
    arquivo: DocumentPicker.DocumentPickerAsset,
  ) {
    const nomeOriginal = arquivo.name.split(/[\\/]/).pop() ?? "documento";
    const nomeSeguro = nomeOriginal.replace(/[^\p{L}\p{N}._-]/gu, "_");
    if (Platform.OS === "web") {
      if (!arquivo.file) {
        throw new Error("Não foi possível ler o documento selecionado no navegador.");
      }
      return new Promise<string>((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = () => {
          if (typeof leitor.result === "string") resolve(leitor.result);
          else reject(new Error("Não foi possível guardar o documento no navegador."));
        };
        leitor.onerror = () => reject(leitor.error ?? new Error("Não foi possível ler o documento selecionado."));
        leitor.readAsDataURL(arquivo.file!);
      });
    }

    const diretorio = new Directory(Paths.document, "documentos-pedidos");
    diretorio.create({ intermediates: true, idempotent: true });
    const nomeUnico = `pedido-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${nomeSeguro}`;
    const destino = new File(diretorio, nomeUnico);
    await FileSystemLegacy.copyAsync({ from: arquivo.uri, to: destino.uri });
    if (!destino.exists || destino.size === 0) {
      throw new Error(
        "Não foi possível guardar uma cópia permanente do documento.",
      );
    }
    return destino.uri;
  }
  function irParaConfirmacao() {
    if (!Number.isInteger(Number(numeroPaginas)) || Number(numeroPaginas) <= 0)
      return showAppAlert(
        "Verifique as páginas",
        "Informe quantas páginas tem o documento.",
      );
    if (!Number.isInteger(Number(numeroCopias)) || Number(numeroCopias) <= 0)
      return showAppAlert(
        "Verifique as cópias",
        "Informe pelo menos uma cópia.",
      );
    if (ehImpressao && !documento)
      return showAppAlert(
        "Documento necessário",
        "Selecione o documento que pretende imprimir.",
      );
    setEtapa(3);
  }
  async function salvarPedido() {
    if (!cliente.trim()) return showAppAlert("Atenção", "Informe o seu nome.");
    if (!contacto.trim())
      return showAppAlert("Atenção", "Informe o seu contacto.");
    if (!servicoSelecionado || !calculo || (ehImpressao && !documento))
      return showAppAlert("Atenção", "Complete os dados do pedido.");
    try {
      const documentoUri = documento?.uri;
      const p = await criarPedido({
        cliente: cliente.trim(),
        contacto: contacto.trim(),
        servico: servicoSelecionado.nome,
        instrucoes: ehDigitalizacao ? instrucoesDigitalizacao.trim() : undefined,
        precoUnitario: servicoSelecionado.preco,
        quantidade: Number(numeroCopias),
        total,
        numeroPaginas: Number(numeroPaginas),
        numeroCopias: Number(numeroCopias),
        frenteVerso: ehDigitalizacao ? false : frenteVerso,
        folhasNecessarias: ehDigitalizacao ? 0 : calculo.totalFolhas,
        documentoNome:
          documento?.name ?? `Digitalização ${formatoDigitalizacao}`,
        documentoUri,
        tipoEncadernacao,
        precoEncadernacao,
      });
      setPedidoParaPagamento({ id: p.id, numero: p.numero, total: p.total });
      setValorPagamento(p.total * 0.5);
      setTipoPagamento("SINAL");
      setEtapa(1);
      setCliente("");
      setContacto("");
      setInstrucoesDigitalizacao("");
      setServicoSelecionado(null);
      setNumeroPaginas("");
      setNumeroCopias("1");
      setFrenteVerso(false);
      setDocumento(null);
      showAppAlert("Pedido criado", "Escolha como deseja pagar.", [
        {
          text: "Pagar 50%",
          onPress: () => {
            setTipoPagamento("SINAL");
            setValorPagamento(p.total * 0.5);
            setPagamentoAberto(true);
          },
        },
        {
          text: "Pagar 100%",
          onPress: () => {
            setTipoPagamento("TOTAL");
            setValorPagamento(p.total);
            setPagamentoAberto(true);
          },
        },
        { text: "Agora não", style: "cancel" },
      ]);
    } catch (erro) {
      showAppAlert(
        "Erro",
        erro instanceof Error
          ? erro.message
          : "Não foi possível guardar o pedido.",
      );
    }
  }
  return (
    <>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, isDesktop && { maxWidth: 900, width: '100%', alignSelf: 'center' }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Novo pedido</Text>
        <Text style={styles.subtitle}>Faça o seu pedido em poucos passos.</Text>
        <Progresso etapa={etapa} />
        {etapa === 1 && (
          <>
            <Text style={styles.pageTitle}>O que deseja fazer?</Text>
            <Text style={styles.pageSubtitle}>
              Escolha um serviço para continuar
            </Text>
            {servicos.map((s) => {
              const ok = servicoSelecionado?.id === s.id;
              return (
                <Pressable
                  key={s.id}
                  style={[styles.serviceCard, ok && styles.selectedCard]}
                  onPress={() => setServicoSelecionado(s)}
                >
                  <View style={[styles.serviceIcon, ok && styles.selectedIcon]}>
                    <Ionicons
                      name={
                        s.nome.includes("Digitalização")
                          ? "scan-outline"
                          : "print-outline"
                      }
                      size={25}
                      color={ok ? "#FFF" : "#102A43"}
                    />
                  </View>
                  <View style={styles.serviceInfo}>
                    <Text style={styles.serviceTitle}>{s.nome}</Text>
                    <Text style={styles.servicePrice}>{s.preco} MT/página</Text>
                  </View>
                  <Ionicons
                    name={ok ? "checkmark-circle" : "ellipse-outline"}
                    size={25}
                    color={ok ? "#147D64" : "#BCCCDC"}
                  />
                </Pressable>
              );
            })}
            <Pressable
              disabled={!servicoSelecionado}
              style={[styles.primary, !servicoSelecionado && styles.disabled]}
              onPress={() => setEtapa(2)}
            >
              <Text style={styles.primaryText}>Continuar</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFF" />
            </Pressable>
          </>
        )}
        {etapa === 2 && (
          <>
            <Text style={styles.pageTitle}>Prepare a impressão</Text>
            <Text style={styles.pageSubtitle}>Documento, páginas e cópias</Text>
            {ehDigitalizacao && (
              <View style={styles.infoBox}>
                <Ionicons name="scan-outline" size={23} color="#102A43" />
                <Text style={styles.infoText}>
                  Informe quantas páginas pretende digitalizar.
                </Text>
              </View>
            )}
            {ehDigitalizacao && (
              <>
                <Text style={styles.label}>Tema e instruções (opcional)</Text>
                <Text style={styles.helperText}>
                  Se pretende que o documento seja preparado com base nas suas informações, escreva aqui o tema e as instruções.
                </Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={instrucoesDigitalizacao}
                  onChangeText={setInstrucoesDigitalizacao}
                  placeholder="Escreva o tema e as instruções"
                  multiline
                  maxLength={2000}
                  textAlignVertical="top"
                />
                <Text style={styles.characterCount}>
                  {instrucoesDigitalizacao.length}/2000
                </Text>
              </>
            )}
            {ehFotocopia && (
              <View style={styles.infoBox}>
                <Ionicons name="copy-outline" size={23} color="#102A43" />
                <Text style={styles.infoText}>
                  Informe as páginas originais e o número de cópias.
                </Text>
              </View>
            )}
            {ehImpressao && (
              <Pressable
                style={styles.documentCard}
                onPress={selecionarDocumento}
              >
                <Ionicons
                  name={documento ? "document-text" : "cloud-upload-outline"}
                  size={28}
                  color="#102A43"
                />
                <View style={styles.serviceInfo}>
                  <Text style={styles.serviceTitle}>
                    {documento?.name ?? "Adicionar documento"}
                  </Text>
                  <Text style={styles.servicePrice}>
                    {documento ? "Toque para trocar" : "PDF ou documento"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={21} color="#829AB1" />
              </Pressable>
            )}
            <Text style={styles.label}>Quantas páginas tem o documento?</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={numeroPaginas}
              onChangeText={setNumeroPaginas}
              placeholder="Ex.: 25"
            />
            <Text style={styles.label}>Quantas cópias?</Text>
            <View style={styles.counter}>
              <Pressable
                style={styles.counterButton}
                onPress={() =>
                  setNumeroCopias(String(Math.max(1, Number(numeroCopias) - 1)))
                }
              >
                <Ionicons name="remove" size={23} color="#102A43" />
              </Pressable>
              <Text style={styles.counterValue}>{numeroCopias}</Text>
              <Pressable
                style={styles.counterButton}
                onPress={() =>
                  setNumeroCopias(String(Number(numeroCopias) + 1))
                }
              >
                <Ionicons name="add" size={23} color="#102A43" />
              </Pressable>
            </View>
            {!ehDigitalizacao && (
              <Text style={styles.label}>Tipo de impressão</Text>
            )}
            {!ehDigitalizacao && (
              <View style={styles.typeRow}>
                <Pressable
                  style={[
                    styles.typeButton,
                    !frenteVerso && styles.typeSelected,
                  ]}
                  onPress={() => setFrenteVerso(false)}
                >
                  <Ionicons name="document-outline" size={22} color="#102A43" />
                  <Text>Frente única</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.typeButton,
                    frenteVerso && styles.typeSelected,
                  ]}
                  onPress={() => setFrenteVerso(true)}
                >
                  <Ionicons name="copy-outline" size={22} color="#102A43" />
                  <Text>Frente e verso</Text>
                </Pressable>
              </View>
            )}
            {ehDigitalizacao && (
              <View style={styles.typeRow}>
                <Pressable
                  style={[
                    styles.typeButton,
                    formatoDigitalizacao === "PDF" && styles.typeSelected,
                  ]}
                  onPress={() => setFormatoDigitalizacao("PDF")}
                >
                  <Text>PDF</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.typeButton,
                    formatoDigitalizacao === "Imagem" && styles.typeSelected,
                  ]}
                  onPress={() => setFormatoDigitalizacao("Imagem")}
                >
                  <Text>Imagem</Text>
                </Pressable>
              </View>
            )}
            <Text style={styles.label}>Encadernação (opcional)</Text>
            <View style={styles.typeRow}>
              <Pressable
                style={[
                  styles.typeButton,
                  tipoEncadernacao === "SEM_ENCADERNACAO" &&
                    styles.typeSelected,
                ]}
                onPress={() => setTipoEncadernacao("SEM_ENCADERNACAO")}
              >
                <Text>Sem encadernação</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.typeButton,
                  tipoEncadernacao === "ESPIRAL_MEDIA" && styles.typeSelected,
                ]}
                onPress={() => setTipoEncadernacao("ESPIRAL_MEDIA")}
              >
                <Text>Espiral média +50 MT</Text>
              </Pressable>
            </View>
            <View style={styles.navRow}>
              <Pressable style={styles.back} onPress={() => setEtapa(1)}>
                <Text>Voltar</Text>
              </Pressable>
              <Pressable style={styles.next} onPress={irParaConfirmacao}>
                <Text style={styles.primaryText}>Continuar</Text>
              </Pressable>
            </View>
          </>
        )}
        {etapa === 3 && (
          <>
            <Text style={styles.pageTitle}>Confirmar pedido</Text>
            <Text style={styles.pageSubtitle}>Verifique antes de enviar</Text>
            <View style={styles.summary}>
              <Text style={styles.serviceTitle}>
                {servicoSelecionado?.nome}
              </Text>
              <Text style={styles.summaryLine}>
                Documento: {numeroPaginas} páginas
              </Text>
              {ehDigitalizacao && instrucoesDigitalizacao.trim().length > 0 && (
                <>
                  <Text style={styles.summaryLine}>Tema e instruções:</Text>
                  <Text style={styles.instructionsSummary}>
                    {instrucoesDigitalizacao.trim()}
                  </Text>
                </>
              )}
              <Text style={styles.summaryLine}>Cópias: {numeroCopias}</Text>
              <Text style={styles.summaryLine}>
                Impressão: {frenteVerso ? "Frente e verso" : "Frente única"}
              </Text>
              <View style={styles.separator} />
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.total}>{total.toFixed(2)} MT</Text>
            </View>
            <Text style={styles.sectionTitle}>Seus dados</Text>
            <TextInput
              style={styles.input}
              placeholder="Nome"
              value={cliente}
              onChangeText={setCliente}
            />
            <TextInput
              style={styles.input}
              placeholder="WhatsApp / contacto"
              keyboardType="phone-pad"
              value={contacto}
              onChangeText={setContacto}
            />
            <Pressable style={styles.primary} onPress={salvarPedido}>
              <Ionicons
                name="checkmark-circle-outline"
                size={22}
                color="#FFF"
              />
              <Text style={styles.primaryText}>Confirmar pedido</Text>
            </Pressable>
            <Pressable style={styles.edit} onPress={() => setEtapa(2)}>
              <Text>Voltar e alterar</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
      {pedidoParaPagamento && (
        <PagamentoModal
          visible={pagamentoAberto}
          pedidoId={pedidoParaPagamento.id}
          numeroPedido={pedidoParaPagamento.numero}
          total={pedidoParaPagamento.total}
          valor={valorPagamento}
          tipo={tipoPagamento}
          onClose={() => setPagamentoAberto(false)}
          onEnviado={() => {
            setPagamentoAberto(false);
            showAppAlert(
              "Pedido recebido",
              "O comprovativo foi enviado para análise.",
            );
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FA" },
  content: { padding: 20, paddingBottom: 50 },
  title: { fontSize: 28, fontWeight: "bold", color: "#102A43" },
  subtitle: { color: "#627D98", marginTop: 5, marginBottom: 25 },
  progressContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 30,
  },
  progressItem: { alignItems: "center", width: 70 },
  progressCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#E6EAF0",
    alignItems: "center",
    justifyContent: "center",
  },
  progressCircleActive: { backgroundColor: "#102A43" },
  progressNumber: { color: "#829AB1", fontWeight: "bold" },
  progressNumberActive: { color: "#FFF" },
  progressLabel: { color: "#627D98", fontSize: 11, marginTop: 6 },
  progressLine: {
    flex: 1,
    height: 2,
    backgroundColor: "#E6EAF0",
    marginTop: 16,
  },
  progressLineActive: { backgroundColor: "#102A43" },
  pageTitle: { color: "#102A43", fontSize: 26, fontWeight: "bold" },
  pageSubtitle: {
    color: "#627D98",
    fontSize: 15,
    marginTop: 5,
    marginBottom: 22,
  },
  serviceCard: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E6EAF0",
    borderRadius: 15,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  selectedCard: { borderColor: "#102A43", borderWidth: 2 },
  serviceIcon: {
    width: 47,
    height: 47,
    borderRadius: 13,
    backgroundColor: "#F0F4F8",
    alignItems: "center",
    justifyContent: "center",
  },
  selectedIcon: { backgroundColor: "#102A43" },
  serviceInfo: { flex: 1, marginLeft: 12 },
  serviceTitle: { color: "#102A43", fontWeight: "bold" },
  servicePrice: { color: "#627D98", marginTop: 3 },
  primary: {
    backgroundColor: "#102A43",
    minHeight: 55,
    borderRadius: 13,
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  disabled: { opacity: 0.4 },
  primaryText: { color: "#FFF", fontWeight: "bold", fontSize: 16 },
  documentCard: {
    backgroundColor: "#FFF",
    borderRadius: 15,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 22,
  },
  label: {
    color: "#243B53",
    fontWeight: "600",
    marginTop: 15,
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#D9E2EC",
    borderRadius: 12,
    minHeight: 53,
    paddingHorizontal: 15,
    marginBottom: 10,
  },
  textArea: { minHeight: 110, paddingTop: 12 },
  helperText: { color: "#627D98", fontSize: 13, lineHeight: 19, marginBottom: 9 },
  characterCount: { color: "#829AB1", fontSize: 12, textAlign: "right", marginTop: -8, marginBottom: 12 },
  counter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    borderRadius: 13,
    padding: 8,
  },
  counterButton: {
    width: 45,
    height: 45,
    borderRadius: 11,
    backgroundColor: "#F0F4F8",
    alignItems: "center",
    justifyContent: "center",
  },
  counterValue: { color: "#102A43", fontSize: 22, fontWeight: "bold" },
  typeRow: { flexDirection: "row", gap: 10 },
  typeButton: {
    flex: 1,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#D9E2EC",
    borderRadius: 13,
    padding: 15,
    alignItems: "center",
    gap: 6,
  },
  typeSelected: {
    borderColor: "#102A43",
    borderWidth: 2,
    backgroundColor: "#F0F4F8",
  },
  navRow: { flexDirection: "row", gap: 10, marginTop: 25 },
  back: {
    flex: 1,
    minHeight: 53,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BCCCDC",
    alignItems: "center",
    justifyContent: "center",
  },
  next: {
    flex: 2,
    minHeight: 53,
    backgroundColor: "#102A43",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  summary: {
    backgroundColor: "#FFF",
    borderRadius: 18,
    padding: 18,
    marginBottom: 25,
  },
  summaryLine: { color: "#243B53", marginTop: 12 },
  instructionsSummary: { color: "#334E68", fontSize: 14, lineHeight: 20, marginTop: 5 },
  separator: { height: 1, backgroundColor: "#E6EAF0", marginVertical: 12 },
  totalLabel: { color: "#627D98" },
  total: { color: "#102A43", fontSize: 30, fontWeight: "bold", marginTop: 3 },
  sectionTitle: {
    color: "#102A43",
    fontSize: 19,
    fontWeight: "bold",
    marginBottom: 12,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F4F8",
    borderRadius: 13,
    padding: 14,
    gap: 10,
    marginBottom: 15,
  },
  infoText: { flex: 1, color: "#486581", lineHeight: 20 },
  edit: { padding: 15, alignItems: "center" },
});
