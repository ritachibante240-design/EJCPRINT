import { showAppAlert } from "../../components/AppAlert";
import TextInput from "../../components/AppTextInput";
import { colors, fontWeights, radii, spacing } from '../../theme';
import { abrirPoliticaPrivacidade } from '../../utils/privacyPolicy';
import { guardarDocumentoWeb } from "../../utils/webDocumentStore";
import AvisoOriginal from "../../components/AvisoOriginal";
import { precisaDoOriginal } from "../../utils/servicoPresencial";
import {
  ehServicoDigital,
  FORMAS_ENTREGA,
  formatosDoServico,
  SERVICO_DIGITACAO,
  type FormaEntrega,
  type FormatoEntrega,
} from "../../utils/servicos";
import React, { Fragment, useMemo, useRef, useState } from "react";
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
  View,
} from "react-native";
import PagamentoModal from "../../components/PagamentoModal";
import * as Sharing from "expo-sharing";
import {
  contarPaginasPdf,
  contarPaginasWord,
  ehPdf,
  ehWord,
  formatarListaPaginas,
  interpretarListaPaginas,
} from "../../utils/paginas";
import { TipoPagamento } from "../../services/pagamentoService";

type Servico = { id: number; nome: string; preco: number; descricao: string };
const servicos: Servico[] = [
  { id: 1, nome: "Fotocópia P/B", preco: 2 , descricao: "Traz o papel à papelaria e fazemos cópias a preto e branco." },
  { id: 2, nome: "Impressão P/B", preco: 3 , descricao: "Envia o documento (PDF ou Word) e imprimimos a preto e branco." },
  { id: 3, nome: "Colorida simples", preco: 5 , descricao: "Impressão a cores de texto, títulos, tabelas e gráficos simples." },
  { id: 4, nome: "Colorida com imagens", preco: 10 , descricao: "Impressão a cores de páginas com fotografias ou imagens grandes." },
  { id: 5, nome: "Digitalização", preco: 15 , descricao: "Passamos o seu papel (BI, certificado, documento assinado) para PDF ou imagem. Traga o original." },
  { id: 6, nome: "Digitação", preco: 15 , descricao: "Escrevemos o seu texto no computador (carta, requerimento, trabalho) e entregamos em PDF ou Word." },
];

function calcularPrecoEncadernacao(folhasPorExemplar: number): number | null {
  if (folhasPorExemplar <= 50) return 30;
  if (folhasPorExemplar <= 100) return 40;
  if (folhasPorExemplar <= 200) return 50;
  return null;
}

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
  const [salvando, setSalvando] = useState(false);
  const salvandoRef = useRef(false);
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
  // Serviços digitais: formato do ficheiro e como o cliente o recebe.
  const [formatoEntrega, setFormatoEntrega] = useState<FormatoEntrega | null>(null);
  const [formaEntrega, setFormaEntrega] = useState<FormaEntrega | null>(null);
  // Páginas contadas automaticamente no PDF (null = o cliente escreve o número).
  const [paginasContadas, setPaginasContadas] = useState<number | null>(null);
  const [origemContagem, setOrigemContagem] = useState<"PDF" | "WORD">("PDF");
  const [contandoPaginas, setContandoPaginas] = useState(false);
  // Imprimir todas as páginas ou só um intervalo (ex.: 3 a 10).
  const [imprimirTudo, setImprimirTudo] = useState(true);
  const [intervaloInicio, setIntervaloInicio] = useState("");
  const [intervaloFim, setIntervaloFim] = useState("");
  // Páginas a cores: "TUDO" = todo o documento no tipo escolhido; "ALGUMAS" = só as indicadas.
  const [modoCor, setModoCor] = useState<"TUDO" | "ALGUMAS">("TUDO");
  const [paginasCoresTexto, setPaginasCoresTexto] = useState("");
  const [tipoCor, setTipoCor] = useState<"Colorida simples" | "Colorida com imagens">("Colorida simples");
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
  const ehDigitacao = servico === SERVICO_DIGITACAO;
  const servicoDigital = ehServicoDigital(servico);
  const ehImpressao = [
    "Impressão P/B",
    "Colorida simples",
    "Colorida com imagens",
  ].includes(servico);
  const ehFotocopia = servico === "Fotocópia P/B";
  const servicoImpressaoPB = servicos.find((item) => item.nome === "Impressão P/B");
  const precoImpressaoPB = servicoImpressaoPB?.preco ?? 3;

  function limparOpcoesDePaginas() {
    setImprimirTudo(true);
    setIntervaloInicio("");
    setIntervaloFim("");
    setModoCor("TUDO");
    setPaginasCoresTexto("");
    setTipoCor("Colorida simples");
  }

  function escolherServico(novo: Servico) {
    setServicoSelecionado(novo);
    setModoCor("TUDO");
    setPaginasCoresTexto("");
    setFormatoEntrega(null);
    setFormaEntrega(null);
    if (ehServicoDigital(novo.nome)) {
      // Um ficheiro digital não tem cópias, frente e verso nem encadernação.
      setNumeroCopias("1");
      setFrenteVerso(false);
      setTipoEncadernacao("SEM_ENCADERNACAO");
    }
  }

  function passarParaImpressao() {
    if (!servicoImpressaoPB) return;
    setServicoSelecionado(servicoImpressaoPB);
    showAppAlert(
      "Pedido alterado para Impressão P/B",
      `Anexe o documento em PDF (pode ser uma digitalização ou uma foto convertida em PDF). O preço passa a ${servicoImpressaoPB.preco} MT por página e não precisa de levar o original à papelaria.`,
    );
  }
  const ehServicoColorido = servico === "Colorida simples" || servico === "Colorida com imagens";
  const totalPaginasDocumento = Number(numeroPaginas);
  const documentoValido = Number.isInteger(totalPaginasDocumento) && totalPaginasDocumento > 0;
  const usaIntervalo = ehImpressao && !imprimirTudo;
  const primeiraPagina = usaIntervalo ? Number(intervaloInicio) : 1;
  const ultimaPagina = usaIntervalo ? Number(intervaloFim) : totalPaginasDocumento;
  const erroIntervalo = !usaIntervalo || !documentoValido
    ? null
    : !Number.isInteger(primeiraPagina) || !Number.isInteger(ultimaPagina) || primeiraPagina < 1 || ultimaPagina < 1
      ? "Indique a primeira e a última página a imprimir."
      : ultimaPagina < primeiraPagina
        ? "A última página tem de ser igual ou maior que a primeira."
        : ultimaPagina > totalPaginasDocumento
          ? `O documento só tem ${totalPaginasDocumento} páginas.`
          : null;
  const paginasAImprimir = !documentoValido
    ? 0
    : usaIntervalo
      ? erroIntervalo ? 0 : ultimaPagina - primeiraPagina + 1
      : totalPaginasDocumento;
  const algumasACores = ehImpressao && modoCor === "ALGUMAS";
  const resultadoCores = algumasACores && paginasAImprimir > 0
    ? interpretarListaPaginas(paginasCoresTexto, primeiraPagina, ultimaPagina)
    : null;
  const paginasCores = resultadoCores?.paginas ?? [];
  const numeroPaginasCores = paginasCores.length;
  const precoDoServico = (nome: string) => servicos.find((item) => item.nome === nome)?.preco ?? 0;
  // A regra de preço: páginas a cores ao preço colorido; as restantes ao preço de Impressão P/B.
  const precoBase = algumasACores && ehServicoColorido ? precoImpressaoPB : servicoSelecionado?.preco ?? 0;
  const precoCor = algumasACores ? (ehServicoColorido ? servicoSelecionado?.preco ?? 0 : precoDoServico(tipoCor)) : 0;
  const nomeTipoCor = ehServicoColorido ? servico : tipoCor;

  const calculo = useMemo(() => {
    const p = paginasAImprimir;
    const c = Number(numeroCopias);
    if (!Number.isInteger(p) || p <= 0 || !Number.isInteger(c) || c <= 0)
      return null;
    try {
      return calcularImpressao(p, c, frenteVerso && !servicoDigital);
    } catch {
      return null;
    }
  }, [paginasAImprimir, numeroCopias, frenteVerso, servicoDigital]);
  const precoEncadernacaoPorCopia =
    tipoEncadernacao !== "SEM_ENCADERNACAO" && calculo
      ? calcularPrecoEncadernacao(calculo.folhasPorCopia)
      : 0;
  const necessitaCotacaoEncadernacao =
    tipoEncadernacao !== "SEM_ENCADERNACAO" &&
    precoEncadernacaoPorCopia === null;
  const precoEncadernacao =
    typeof precoEncadernacaoPorCopia === "number" && calculo
      ? precoEncadernacaoPorCopia * calculo.numeroCopias
      : 0;
  const total =
    servicoSelecionado && calculo
      ? Math.round(
          ((precoBase * (calculo.paginasPorCopia - numeroPaginasCores) +
            precoCor * numeroPaginasCores) *
            calculo.numeroCopias +
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
        const tamanho = arquivo.size ?? arquivo.file?.size ?? 0;
        if (tamanho > 20 * 1024 * 1024) {
          showAppAlert(
            "Documento demasiado grande",
            "O documento deve ter no máximo 20 MB. Comprima o PDF ou divida-o em partes e tente novamente.",
          );
          return;
        }
        const documentoUri = await guardarDocumentoDoPedido(arquivo);
        setDocumento({ ...arquivo, uri: documentoUri });
        limparOpcoesDePaginas();
        setPaginasContadas(null);
        setNumeroPaginas("");
        const pdf = ehPdf(arquivo.name, arquivo.mimeType);
        if (pdf || ehWord(arquivo.name, arquivo.mimeType)) {
          // Conta as páginas para o preço ficar certo (o cliente não precisa de as contar).
          setContandoPaginas(true);
          try {
            const fonte = { uri: documentoUri, file: arquivo.file };
            const total = pdf ? await contarPaginasPdf(fonte) : await contarPaginasWord(fonte);
            setOrigemContagem(pdf ? "PDF" : "WORD");
            if (total) {
              setPaginasContadas(total);
              setNumeroPaginas(String(total));
            }
          } finally {
            setContandoPaginas(false);
          }
        }
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
  async function preVisualizarDocumento() {
    if (!documento) return;
    try {
      if (Platform.OS === "web") {
        if (!ehPdf(documento.name, documento.mimeType) || !documento.file) {
          showAppAlert(
            "Pré-visualização indisponível",
            `O navegador não abre ficheiros Word. Confirme que o ficheiro é "${documento.name}". Para ter a certeza de que a formatação não muda, envie o documento em PDF.`,
          );
          return;
        }
        const url = URL.createObjectURL(documento.file);
        window.open(url, "_blank", "noopener");
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return;
      }
      if (!(await Sharing.isAvailableAsync())) {
        showAppAlert("Pré-visualização indisponível", "Este dispositivo não consegue abrir o documento.");
        return;
      }
      await Sharing.shareAsync(documento.uri, {
        mimeType: documento.mimeType ?? undefined,
        dialogTitle: "Abrir o documento",
        UTI: ehPdf(documento.name, documento.mimeType) ? "com.adobe.pdf" : undefined,
      });
    } catch {
      showAppAlert("Erro", "Não foi possível abrir o documento.");
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
      // Guarda o ficheiro diretamente na IndexedDB (rápido, sem converter para base64).
      return await guardarDocumentoWeb(arquivo.file, nomeOriginal);
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
    if (contandoPaginas)
      return showAppAlert("Um momento", "Ainda estamos a contar as páginas do documento.");
    if (!documentoValido)
      return showAppAlert(
        "Verifique as páginas",
        "Informe quantas páginas tem o documento.",
      );
    if (erroIntervalo) return showAppAlert("Verifique as páginas a imprimir", erroIntervalo);
    if (algumasACores && resultadoCores?.erro)
      return showAppAlert("Verifique as páginas a cores", resultadoCores.erro);
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
    if (ehDigitacao && instrucoesDigitalizacao.trim().length < 10)
      return showAppAlert(
        "Descreva o documento",
        "Escreva o tema e as instruções do documento que pretende (pelo menos uma frase).",
      );
    if (servicoDigital && !formatoEntrega)
      return showAppAlert("Escolha o formato", "Indique em que formato quer receber o ficheiro.");
    if (servicoDigital && !formaEntrega)
      return showAppAlert("Escolha a entrega", "Indique como quer receber o ficheiro.");
    if (necessitaCotacaoEncadernacao)
      return showAppAlert(
        "Encadernação por cotar",
        "Para mais de 200 folhas por exemplar, peça ao administrador uma cotação antes de confirmar o pedido.",
      );
    setEtapa(3);
  }
  async function salvarPedido() {
    // Evita criar pedidos duplicados com cliques repetidos enquanto o pedido é guardado.
    if (salvandoRef.current) return;
    if (!cliente.trim()) return showAppAlert("Atenção", "Informe o seu nome.");
    if (!contacto.trim())
      return showAppAlert("Atenção", "Informe o seu contacto.");
    if (!servicoSelecionado || !calculo || (ehImpressao && !documento))
      return showAppAlert("Atenção", "Complete os dados do pedido.");
    if (necessitaCotacaoEncadernacao)
      return showAppAlert(
        "Encadernação por cotar",
        "Para mais de 200 folhas por exemplar, peça ao administrador uma cotação antes de confirmar o pedido.",
      );
    salvandoRef.current = true;
    setSalvando(true);
    try {
      const documentoUri = documento?.uri;
      const p = await criarPedido({
        cliente: cliente.trim(),
        contacto: contacto.trim(),
        servico: servicoSelecionado.nome,
        instrucoes: ehDigitacao ? instrucoesDigitalizacao.trim() : undefined,
        precoUnitario: precoBase,
        quantidade: Number(numeroCopias),
        total,
        numeroPaginas: calculo.paginasPorCopia,
        intervaloPaginas: usaIntervalo ? `${primeiraPagina}-${ultimaPagina}` : undefined,
        paginasCores: numeroPaginasCores > 0 ? formatarListaPaginas(paginasCores) : undefined,
        numeroPaginasCores,
        precoCor,
        numeroCopias: Number(numeroCopias),
        frenteVerso: servicoDigital ? false : frenteVerso,
        folhasNecessarias: servicoDigital ? 0 : calculo.totalFolhas,
        documentoNome:
          documento?.name ?? `${servico} ${formatoEntrega ?? ""}`.trim(),
        documentoUri,
        tipoEncadernacao,
        precoEncadernacao,
        formatoEntrega: servicoDigital ? formatoEntrega ?? undefined : undefined,
        formaEntrega: servicoDigital ? formaEntrega ?? undefined : undefined,
      });
      setPedidoParaPagamento({ id: p.id, numero: p.numero, total: p.total });
      setValorPagamento(p.total * 0.5);
      setTipoPagamento("SINAL");
      setEtapa(1);
      setCliente("");
      setContacto("");
      setInstrucoesDigitalizacao("");
      setFormatoEntrega(null);
      setFormaEntrega(null);
      setServicoSelecionado(null);
      setNumeroPaginas("");
      setNumeroCopias("1");
      setFrenteVerso(false);
      setDocumento(null);
      setPaginasContadas(null);
      limparOpcoesDePaginas();
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
    } finally {
      salvandoRef.current = false;
      setSalvando(false);
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
                  onPress={() => escolherServico(s)}
                >
                  <View style={[styles.serviceIcon, ok && styles.selectedIcon]}>
                    <Ionicons
                      name={
                        s.nome === "Digitalização"
                          ? "scan-outline"
                          : s.nome === SERVICO_DIGITACAO
                            ? "create-outline"
                            : "print-outline"
                      }
                      size={25}
                      color={ok ? "#FFF" : colors.brand}
                    />
                  </View>
                  <View style={styles.serviceInfo}>
                    <Text style={styles.serviceTitle}>{s.nome}</Text>
                    <Text style={styles.serviceDescription}>{s.descricao}</Text>
                    <Text style={styles.servicePrice}>{s.preco} MT/página</Text>
                  </View>
                  <Ionicons
                    name={ok ? "checkmark-circle" : "ellipse-outline"}
                    size={25}
                    color={ok ? colors.success : colors.border}
                  />
                </Pressable>
              );
            })}
            {ehFotocopia && <AvisoOriginal />}
            {ehDigitalizacao && <AvisoOriginal />}
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
            <Text style={styles.pageTitle}>
              {ehDigitalizacao ? "Prepare a digitalização" : ehDigitacao ? "Descreva o documento" : "Prepare a impressão"}
            </Text>
            <Text style={styles.pageSubtitle}>
              {servicoDigital ? "Páginas, formato e entrega" : "Documento, páginas e cópias"}
            </Text>
            {ehDigitalizacao && <AvisoOriginal />}
            {ehDigitalizacao && (
              <View style={styles.infoBox}>
                <Ionicons name="scan-outline" size={23} color={colors.brand} />
                <Text style={styles.infoText}>
                  Informe quantas páginas pretende digitalizar.
                </Text>
              </View>
            )}
            {ehDigitacao && (
              <>
                <Text style={styles.label}>Tema e instruções</Text>
                <Text style={styles.helperText}>
                  Descreva o documento que pretende: o tema, o tipo de documento e as instruções a seguir.
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
              <>
                <AvisoOriginal />
                <View style={styles.infoBox}>
                  <Ionicons name="copy-outline" size={23} color={colors.brand} />
                  <Text style={styles.infoText}>
                    Informe as páginas originais e o número de cópias.
                  </Text>
                </View>
                {/* Alternativa: em vez de levar o original, enviar o documento em PDF.
                    Nesse caso o pedido passa a ser uma Impressão P/B normal. */}
                <Pressable style={styles.alternativa} onPress={passarParaImpressao}>
                  <Ionicons name="cloud-upload-outline" size={20} color={colors.brand} />
                  <View style={styles.serviceInfo}>
                    <Text style={styles.alternativaTitulo}>Não pode ir à papelaria?</Text>
                    <Text style={styles.alternativaTexto}>
                      Envie o documento em PDF (pode ser uma digitalização ou uma foto convertida em PDF).
                      O pedido passa a Impressão P/B ({precoImpressaoPB} MT/página).
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.subtle} />
                </Pressable>
              </>
            )}
            {ehImpressao && (
              <Pressable
                style={styles.documentCard}
                onPress={selecionarDocumento}
              >
                <Ionicons
                  name={documento ? "document-text" : "cloud-upload-outline"}
                  size={28}
                  color={colors.brand}
                />
                <View style={styles.serviceInfo}>
                  <Text style={styles.serviceTitle}>
                    {documento?.name ?? "Adicionar documento"}
                  </Text>
                  <Text style={styles.servicePrice}>
                    {documento ? "Toque para trocar" : "PDF, DOC ou DOCX • até 20 MB"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={21} color={colors.subtle} />
              </Pressable>
            )}
            {ehImpressao && documento && (Platform.OS !== "web" || ehPdf(documento.name, documento.mimeType)) && (
              <Pressable
                accessibilityRole="button"
                style={styles.previewButton}
                onPress={() => void preVisualizarDocumento()}
              >
                <Ionicons name="eye-outline" size={19} color={colors.brand} />
                <Text style={styles.previewText}>Pré-visualizar o documento</Text>
              </Pressable>
            )}
            {ehImpressao && documento && ehWord(documento.name, documento.mimeType) && (
              <View style={styles.avisoWord}>
                <Ionicons name="alert-circle-outline" size={21} color={colors.warning} />
                <Text style={styles.avisoWordTexto}>
                  Ficheiro Word: a formatação pode mudar quando for aberto noutro computador, e a
                  papelaria vai confirmar o número de páginas.
                  {Platform.OS === "web" ? " O navegador não consegue pré-visualizar ficheiros Word." : ""}
                  {" "}Para ter a certeza, envie em PDF.
                </Text>
              </View>
            )}
            <Text style={styles.label}>
              {ehDigitalizacao
                ? "Quantas páginas vai digitalizar?"
                : ehDigitacao
                  ? "Quantas páginas estima que o documento terá?"
                  : "Quantas páginas tem o documento?"}
            </Text>
            <Text style={styles.helperText}>
              {servicoDigital
                ? `${servicoSelecionado?.preco} MT por página.`
                : `${servicoSelecionado?.preco} MT por página. O total do serviço considera páginas × cópias; frente e verso reduz as folhas, não as páginas cobradas.`}
            </Text>
            {contandoPaginas ? (
              <View style={styles.contagem}>
                <Text style={styles.contagemTexto}>A contar as páginas do documento...</Text>
              </View>
            ) : paginasContadas !== null ? (
              <View style={styles.contagem}>
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                <Text style={styles.contagemTexto}>
                  {paginasContadas} página{paginasContadas !== 1 ? "s" : ""}{" "}
                  {origemContagem === "PDF"
                    ? "(contadas automaticamente no PDF)"
                    : "(lidas do ficheiro Word; a papelaria confirma)"}
                </Text>
              </View>
            ) : (
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                value={numeroPaginas}
                onChangeText={(texto) => {
                  setNumeroPaginas(texto);
                  setImprimirTudo(true);
                }}
                placeholder="Número de páginas"
              />
            )}
            {ehImpressao && documentoValido && !contandoPaginas && (
              <>
                <Text style={styles.label}>Que páginas quer imprimir?</Text>
                <View style={styles.typeRow}>
                  <Pressable
                    style={[styles.typeButton, imprimirTudo && styles.typeSelected]}
                    onPress={() => setImprimirTudo(true)}
                  >
                    <Text>Todas</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.typeButton, !imprimirTudo && styles.typeSelected]}
                    onPress={() => setImprimirTudo(false)}
                  >
                    <Text>Só algumas</Text>
                  </Pressable>
                </View>
                {!imprimirTudo && (
                  <View style={styles.intervaloRow}>
                    <Text>Da página</Text>
                    <TextInput
                      style={[styles.input, styles.intervaloInput]}
                      keyboardType="number-pad"
                      value={intervaloInicio}
                      onChangeText={setIntervaloInicio}
                      placeholder="Primeira"
                    />
                    <Text>à</Text>
                    <TextInput
                      style={[styles.input, styles.intervaloInput]}
                      keyboardType="number-pad"
                      value={intervaloFim}
                      onChangeText={setIntervaloFim}
                      placeholder="Última"
                    />
                  </View>
                )}
                {erroIntervalo && (intervaloInicio !== "" && intervaloFim !== "") && (
                  <Text style={styles.erroTexto}>{erroIntervalo}</Text>
                )}
                <Text style={styles.label}>Páginas a cores</Text>
                <View style={styles.typeRow}>
                  <Pressable
                    style={[styles.typeButton, modoCor === "TUDO" && styles.typeSelected]}
                    onPress={() => setModoCor("TUDO")}
                  >
                    <Text>{ehServicoColorido ? "Todas a cores" : "Nenhuma (tudo P/B)"}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.typeButton, modoCor === "ALGUMAS" && styles.typeSelected]}
                    onPress={() => setModoCor("ALGUMAS")}
                  >
                    <Text>Só algumas</Text>
                  </Pressable>
                </View>
                {algumasACores && (
                  <>
                    <Text style={styles.helperText}>
                      Indique os números das páginas a cores, separados por vírgulas; para páginas seguidas use um hífen (1-3). As páginas indicadas pagam o preço a cores e as restantes {precoImpressaoPB} MT (P/B).
                    </Text>
                    <TextInput
                      style={styles.input}
                      value={paginasCoresTexto}
                      onChangeText={setPaginasCoresTexto}
                      placeholder="Páginas a cores"
                    />
                    {!ehServicoColorido && (
                      <View style={styles.typeRow}>
                        {(["Colorida simples", "Colorida com imagens"] as const).map((tipo) => (
                          <Pressable
                            key={tipo}
                            style={[styles.typeButton, tipoCor === tipo && styles.typeSelected]}
                            onPress={() => setTipoCor(tipo)}
                          >
                            <Text>{tipo} ({precoDoServico(tipo)} MT)</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                    {paginasCoresTexto.trim() !== "" && resultadoCores?.erro && (
                      <Text style={styles.erroTexto}>{resultadoCores.erro}</Text>
                    )}
                    {numeroPaginasCores > 0 && (
                      <Text style={styles.helperText}>
                        {numeroPaginasCores} página{numeroPaginasCores !== 1 ? "s" : ""} a cores × {precoCor} MT
                        {" + "}
                        {paginasAImprimir - numeroPaginasCores} P/B × {precoBase} MT, por cópia.
                      </Text>
                    )}
                  </>
                )}
              </>
            )}
            {!servicoDigital && (<>
            <Text style={styles.label}>Quantas cópias?</Text>
            <View style={styles.counter}>
              <Pressable
                style={styles.counterButton}
                onPress={() =>
                  setNumeroCopias(String(Math.max(1, Number(numeroCopias) - 1)))
                }
              >
                <Ionicons name="remove" size={23} color={colors.brand} />
              </Pressable>
              <Text style={styles.counterValue}>{numeroCopias}</Text>
              <Pressable
                style={styles.counterButton}
                onPress={() =>
                  setNumeroCopias(String(Number(numeroCopias) + 1))
                }
              >
                <Ionicons name="add" size={23} color={colors.brand} />
              </Pressable>
            </View>
            </>)}
            {!servicoDigital && (
              <Text style={styles.label}>Tipo de impressão</Text>
            )}
            {!servicoDigital && (
              <View style={styles.typeRow}>
                <Pressable
                  style={[
                    styles.typeButton,
                    !frenteVerso && styles.typeSelected,
                  ]}
                  onPress={() => setFrenteVerso(false)}
                >
                  <Ionicons name="document-outline" size={22} color={colors.brand} />
                  <Text>Frente única</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.typeButton,
                    frenteVerso && styles.typeSelected,
                  ]}
                  onPress={() => setFrenteVerso(true)}
                >
                  <Ionicons name="copy-outline" size={22} color={colors.brand} />
                  <Text>Frente e verso</Text>
                </Pressable>
              </View>
            )}
            {servicoDigital && (
              <>
                <Text style={styles.label}>Em que formato quer receber?</Text>
                {formatosDoServico(servico).map((opcao) => (
                  <Pressable
                    key={opcao.valor}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: formatoEntrega === opcao.valor }}
                    style={[styles.opcaoEntrega, formatoEntrega === opcao.valor && styles.opcaoEntregaSelecionada]}
                    onPress={() => setFormatoEntrega(opcao.valor)}
                  >
                    <Ionicons
                      name={formatoEntrega === opcao.valor ? "radio-button-on" : "radio-button-off"}
                      size={21}
                      color={formatoEntrega === opcao.valor ? colors.brand : colors.subtle}
                    />
                    <View style={styles.serviceInfo}>
                      <Text style={styles.opcaoTitulo}>{opcao.titulo}</Text>
                      <Text style={styles.opcaoDescricao}>{opcao.descricao}</Text>
                    </View>
                  </Pressable>
                ))}
                <Text style={styles.label}>Como quer receber?</Text>
                {FORMAS_ENTREGA.map((opcao) => (
                  <Pressable
                    key={opcao.valor}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: formaEntrega === opcao.valor }}
                    style={[styles.opcaoEntrega, formaEntrega === opcao.valor && styles.opcaoEntregaSelecionada]}
                    onPress={() => setFormaEntrega(opcao.valor)}
                  >
                    <Ionicons
                      name={formaEntrega === opcao.valor ? "radio-button-on" : "radio-button-off"}
                      size={21}
                      color={formaEntrega === opcao.valor ? colors.brand : colors.subtle}
                    />
                    <View style={styles.serviceInfo}>
                      <Text style={styles.opcaoTitulo}>{opcao.titulo}</Text>
                      <Text style={styles.opcaoDescricao}>{opcao.descricao}</Text>
                    </View>
                  </Pressable>
                ))}
              </>
            )}
            {!servicoDigital && (<>
            <Text style={styles.label}>Encadernação (opcional)</Text>
            <Text style={styles.helperText}>
              Por exemplar: 30 MT até 50 folhas, 40 MT de 51 a 100 folhas e 50
              MT de 101 a 200 folhas.
            </Text>
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
                <Text>Com encadernação</Text>
              </Pressable>
            </View>
            {necessitaCotacaoEncadernacao && (
              <View style={styles.infoBox}>
                <Ionicons
                  name="information-circle-outline"
                  size={23}
                  color="#9C4221"
                />
                <Text style={styles.bindingQuoteText}>
                  {calculo?.folhasPorCopia} folhas por exemplar. Acima de 200
                  folhas, solicite uma cotação ao administrador antes de
                  confirmar.
                </Text>
              </View>
            )}
            </>)}
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
            {precisaDoOriginal(servico, ehDigitacao ? instrucoesDigitalizacao : undefined) && <AvisoOriginal />}
            <View style={styles.summary}>
              <Text style={styles.serviceTitle}>
                {servicoSelecionado?.nome}
              </Text>
              <Text style={styles.summaryLine}>
                Documento: {numeroPaginas} páginas
              </Text>
              {usaIntervalo && (
                <Text style={styles.summaryLine}>
                  Imprimir: páginas {primeiraPagina} a {ultimaPagina} ({paginasAImprimir} páginas)
                </Text>
              )}
              {numeroPaginasCores > 0 && (
                <Text style={styles.summaryLine}>
                  A cores: {formatarListaPaginas(paginasCores)} ({nomeTipoCor})
                </Text>
              )}
              {ehDigitacao && instrucoesDigitalizacao.trim().length > 0 && (
                <>
                  <Text style={styles.summaryLine}>Tema e instruções:</Text>
                  <Text style={styles.instructionsSummary}>
                    {instrucoesDigitalizacao.trim()}
                  </Text>
                </>
              )}
              {!servicoDigital && <Text style={styles.summaryLine}>Cópias: {numeroCopias}</Text>}
              {servicoDigital && formatoEntrega && (
                <Text style={styles.summaryLine}>
                  Formato: {formatosDoServico(servico).find((opcao) => opcao.valor === formatoEntrega)?.titulo}
                </Text>
              )}
              {servicoDigital && formaEntrega && (
                <Text style={styles.summaryLine}>
                  Entrega: {formaEntrega === "WHATSAPP" ? "WhatsApp (para o contacto indicado)" : "Levantar na papelaria"}
                </Text>
              )}
              {!servicoDigital && (
                <Text style={styles.summaryLine}>
                  Impressão: {frenteVerso ? "Frente e verso" : "Frente única"}
                </Text>
              )}
              {calculo && servicoSelecionado && (
                <Text style={styles.summaryLine}>
                  {numeroPaginasCores > 0
                    ? `Serviço: (${calculo.paginasPorCopia - numeroPaginasCores} × ${precoBase} MT + ${numeroPaginasCores} × ${precoCor} MT) × ${calculo.numeroCopias} cópia${calculo.numeroCopias !== 1 ? "s" : ""}`
                    : `Serviço: ${precoBase} MT × ${calculo.totalPaginasImpressas} páginas`}
                </Text>
              )}
              {tipoEncadernacao !== "SEM_ENCADERNACAO" && calculo && (
                <Text style={styles.summaryLine}>
                  Encadernação: {calculo.folhasPorCopia} folhas por exemplar ×{" "}
                  {calculo.numeroCopias} cópias — {precoEncadernacao.toFixed(2)}{" "}
                  MT
                </Text>
              )}
              <View style={styles.separator} />
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.total}>{total.toFixed(2)} MT</Text>
            </View>
            <Text style={styles.sectionTitle}>Seus dados</Text>
            <TextInput
              style={styles.input}
              placeholder="Nome Completo"
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
            <View style={styles.privacyNotice}>
              <Text style={styles.privacyNoticeText}>
                Usaremos estes dados para gerir o pedido e o pagamento.
              </Text>
              <Pressable
                accessibilityRole="link"
                onPress={() => void abrirPoliticaPrivacidade()}
                hitSlop={8}
              >
                <Text style={styles.privacyNoticeLink}>Leia a Política de Privacidade.</Text>
              </Pressable>
            </View>
            <Pressable
              style={[styles.primary, salvando && styles.disabled]}
              onPress={salvarPedido}
              disabled={salvando}
            >
              <Ionicons
                name={salvando ? "hourglass-outline" : "checkmark-circle-outline"}
                size={22}
                color="#FFF"
              />
              <Text style={styles.primaryText}>
                {salvando ? "A guardar pedido..." : "Confirmar pedido"}
              </Text>
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
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: 50 },
  title: { fontSize: 28, fontWeight: fontWeights.bold, color: colors.brand },
  subtitle: { color: colors.muted, marginTop: 5, marginBottom: 25 },
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
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  progressCircleActive: { backgroundColor: colors.brand },
  progressNumber: { color: colors.subtle, fontWeight: fontWeights.bold },
  progressNumberActive: { color: "#FFF" },
  progressLabel: { color: colors.muted, fontSize: 11, marginTop: 6 },
  progressLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.border,
    marginTop: spacing.lg,
  },
  progressLineActive: { backgroundColor: colors.brand },
  pageTitle: { color: colors.brand, fontSize: 26, fontWeight: fontWeights.bold },
  pageSubtitle: {
    color: colors.muted,
    fontSize: 15,
    marginTop: 5,
    marginBottom: 22,
  },
  serviceCard: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 15,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  selectedCard: { borderColor: colors.brand, borderWidth: 2 },
  serviceIcon: {
    width: 47,
    height: 47,
    borderRadius: 13,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedIcon: { backgroundColor: colors.brand },
  serviceInfo: { flex: 1, marginLeft: spacing.md },
  serviceTitle: { color: colors.brand, fontWeight: fontWeights.bold },
  servicePrice: { color: colors.muted, marginTop: 3 },
  serviceDescription: { color: colors.text, fontSize: 13, lineHeight: 18, marginTop: 3 },
  primary: {
    backgroundColor: colors.brand,
    minHeight: 55,
    borderRadius: 13,
    marginTop: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  disabled: { opacity: 0.4 },
  primaryText: { color: "#FFF", fontWeight: fontWeights.bold, fontSize: 16 },
  documentCard: {
    backgroundColor: "#FFF",
    borderRadius: 15,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 22,
  },
  label: {
    color: colors.text,
    fontWeight: fontWeights.semibold,
    marginTop: 15,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    minHeight: 53,
    paddingHorizontal: 15,
    marginBottom: 10,
  },
  privacyNotice: { marginTop: spacing.sm, marginBottom: spacing.lg },
  privacyNoticeText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  privacyNoticeLink: { color: colors.accent, fontSize: 14, fontWeight: fontWeights.semibold, textDecorationLine: "underline", marginTop: spacing.xs },
  textArea: { minHeight: 110, paddingTop: spacing.md },
  helperText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 9 },
  characterCount: { color: colors.subtle, fontSize: 12, textAlign: "right", marginTop: -8, marginBottom: spacing.md },
  counter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    borderRadius: 13,
    padding: spacing.sm,
  },
  counterButton: {
    width: 45,
    height: 45,
    borderRadius: 11,
    backgroundColor: colors.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  counterValue: { color: colors.brand, fontSize: 22, fontWeight: fontWeights.bold },
  typeRow: { flexDirection: "row", gap: 10 },
  typeButton: {
    flex: 1,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    padding: 15,
    alignItems: "center",
    gap: 6,
  },
  typeSelected: {
    borderColor: colors.brand,
    borderWidth: 2,
    backgroundColor: colors.brandSoft,
  },
  navRow: { flexDirection: "row", gap: 10, marginTop: 25 },
  back: {
    flex: 1,
    minHeight: 53,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  next: {
    flex: 2,
    minHeight: 53,
    backgroundColor: colors.brand,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  summary: {
    backgroundColor: "#FFF",
    borderRadius: radii.xl,
    padding: 18,
    marginBottom: 25,
  },
  summaryLine: { color: colors.text, marginTop: spacing.md },
  instructionsSummary: { color: "#334E68", fontSize: 14, lineHeight: 20, marginTop: 5 },
  bindingQuoteText: { flex: 1, color: "#9C4221", lineHeight: 20 },
  separator: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  totalLabel: { color: colors.muted },
  total: { color: colors.brand, fontSize: 30, fontWeight: fontWeights.bold, marginTop: 3 },
  sectionTitle: {
    color: colors.brand,
    fontSize: 19,
    fontWeight: fontWeights.bold,
    marginBottom: spacing.md,
  },
  previewButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: -4,
    marginBottom: 12,
    paddingVertical: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  previewText: { color: colors.brand, fontWeight: fontWeights.bold },
  avisoWord: {
    flexDirection: "row",
    gap: 10,
    padding: spacing.md,
    marginBottom: 12,
    borderRadius: radii.md,
    backgroundColor: colors.warningSoft,
  },
  avisoWordTexto: { flex: 1, color: colors.warning, lineHeight: 20 },
  contagem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: spacing.md,
    marginBottom: 12,
    borderRadius: radii.md,
    backgroundColor: colors.brandSoft,
  },
  contagemTexto: { flex: 1, color: colors.text, fontWeight: fontWeights.bold },
  intervaloRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  intervaloInput: { flex: 1, marginBottom: 0 },
  erroTexto: { color: colors.danger, marginTop: 6, marginBottom: 6 },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.brandSoft,
    borderRadius: 13,
    padding: 14,
    gap: 10,
    marginBottom: 15,
  },
  infoText: { flex: 1, color: "#486581", lineHeight: 20 },
  opcaoEntrega: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    padding: 14,
    marginBottom: 10,
    backgroundColor: colors.surface,
  },
  opcaoEntregaSelecionada: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  opcaoTitulo: { color: colors.brand, fontWeight: fontWeights.bold },
  opcaoDescricao: { color: colors.muted, marginTop: 2, lineHeight: 19 },
  alternativa: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    padding: 14,
    marginBottom: 15,
    backgroundColor: colors.surface,
  },
  alternativaTitulo: { color: colors.brand, fontWeight: fontWeights.bold },
  alternativaTexto: { color: colors.muted, marginTop: 3, lineHeight: 19 },
  edit: { padding: 15, alignItems: "center" },
});
