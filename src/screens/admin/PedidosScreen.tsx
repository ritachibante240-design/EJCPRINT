import { showAppAlert } from "../../components/AppAlert";
import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Platform,
  RefreshControl,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import { db } from "../../database/database";

import { useFocusEffect } from "@react-navigation/native";
import { useResponsiveContent } from "../../hooks/useResponsive";

import {
  listarPedidos,
  atualizarEstadoPedido,
  iniciarImpressao,
  calcularResumoPedido,
  Pedido,
} from "../../services/pedidoService";
import { sincronizarTudoPendentes } from "../../services/sincronizacaoSeguraService";
import { obterNomeEstado, obterProximaAcao } from "../../utils/estadoPedido";
import { Ionicons } from "@expo/vector-icons";
import { abrirArquivoPedido } from "../../services/arquivoRemotoService";
import { obterTokenAdministrador } from "../../services/adminAuthService";
import { colors, fontWeights, radii, spacing } from '../../theme';

const estados = [
  "Pedido recebido",
  "Em preparação",
  "Em impressão",
  "Pronto para levantamento",
  "Entregue",
];

export default function PedidosScreen() {
  const { isDesktop } = useResponsiveContent(20);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [pedidoAberto, setPedidoAberto] = useState<number | null>(null);
  const [pedidoProcessando, setPedidoProcessando] = useState<number | null>(
    null,
  );
  const [documentoProcessando, setDocumentoProcessando] = useState<number | null>(null);

  async function carregarPedidos(mostrarErro = true) {
    setAtualizando(true);
    const carregarPedidosLocais = async () => {
      setPedidos(await listarPedidos());
    };

    try {
      await carregarPedidosLocais();
    } catch (erro) {
      console.error(erro);
      showAppAlert("Erro", "Não foi possível carregar os pedidos locais.");
      setCarregando(false);
      setAtualizando(false);
      return;
    }

    let erroSincronizacao: unknown;
    try {
      await sincronizarTudoPendentes(1, 1200);
    } catch (erro) {
      erroSincronizacao = erro;
      console.warn('Não foi possível atualizar os pedidos do servidor.', erro);
    }

    try {
      await carregarPedidosLocais();
    } catch (erro) {
      console.error(erro);
      showAppAlert("Erro", "Não foi possível carregar os pedidos locais.");
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }

    if (erroSincronizacao && mostrarErro) {
      showAppAlert(
        "Pedidos não atualizados",
        `A lista local foi mantida, mas não foi possível atualizar os pedidos do servidor. ${erroSincronizacao instanceof Error ? erroSincronizacao.message : 'Verifique a ligação e tente atualizar novamente.'}`
      );
    }
  }

  useFocusEffect(
    useCallback(() => {
      void carregarPedidos(false);
    }, []),
  );

  async function alterarEstado(pedido: Pedido, novoEstado: string) {
    if (pedidoProcessando !== null) return;
    try {
      setPedidoProcessando(pedido.id);
      if (novoEstado === "Em impressão") {
        await iniciarImpressao(pedido.id);
      } else {
        await atualizarEstadoPedido(pedido.id, novoEstado);
      }

      await carregarPedidos(false);

      showAppAlert(
        "Sucesso",
        novoEstado === "Em impressão"
          ? `${pedido.folhas_necessarias} folhas foram retiradas do stock.`
          : `Pedido atualizado para "${novoEstado}".`,
      );
    } catch (erro) {
      if (novoEstado === "Em impressão") {
        try {
          setPedidos(await listarPedidos());
        } catch (erroAtualizacao) {
          console.error("Não foi possível atualizar a lista local de pedidos.", erroAtualizacao);
        }
      }
      showAppAlert(
        "Não foi possível continuar",
        erro instanceof Error ? erro.message : "Ocorreu um erro.",
      );
    } finally {
      setPedidoProcessando(null);
    }
  }

  function proximoEstado(pedido: Pedido) {
    const posicaoAtual = estados.indexOf(pedido.estado);

    if (posicaoAtual === -1) {
      return;
    }

    if (posicaoAtual >= estados.length - 1) {
      showAppAlert("Pedido concluído", "Este pedido já foi entregue.");

      return;
    }

    const novoEstado = estados[posicaoAtual + 1];

    showAppAlert(
      "Alterar estado",
      `${pedido.numero}\n\n` + `${pedido.estado}\n↓\n${novoEstado}`,
      [
        {
          text: "Cancelar",
          style: "cancel",
        },
        {
          text: "Confirmar",
          onPress: () => alterarEstado(pedido, novoEstado),
        },
      ],
    );
  }

  async function baixarDocumento(pedido: Pedido) {
    if (!pedido.documento_uri) {
      showAppAlert(
        "Documento indisponível",
        "Este pedido não possui um documento anexado.",
      );
      return;
    }

    try {
      const token = pedido.documento_uri.startsWith("http")
        ? await obterTokenAdministrador()
        : null;
      const extensao = pedido.documento_nome?.split(".").pop()?.toLowerCase();
      const mimeType =
        extensao === "pdf"
          ? "application/pdf"
          : extensao === "doc"
            ? "application/msword"
            : extensao === "docx"
              ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              : "application/octet-stream";

      await abrirArquivoPedido(
        pedido.documento_uri,
        pedido.documento_nome ?? "documento",
        mimeType,
        token,
      );
    } catch (erro) {
      showAppAlert(
        "Não foi possível baixar o documento",
        erro instanceof Error ? erro.message : "Tente novamente mais tarde.",
      );
    }
  }

  async function anexarDocumento(pedido: Pedido) {
    if (documentoProcessando !== null) return;
    if (!pedido.remoto_id) {
      showAppAlert("Pedido ainda não sincronizado", "Sincronize o pedido com o servidor antes de anexar o documento.");
      return;
    }

    try {
      setDocumentoProcessando(pedido.id);
      const resultado = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (resultado.canceled) return;

      const arquivoSelecionado = resultado.assets[0];
      const extensao = arquivoSelecionado.name.split(".").pop()?.toLowerCase();
      const mimeType = arquivoSelecionado.mimeType ?? (
        extensao === "pdf" ? "application/pdf" :
          extensao === "doc" ? "application/msword" :
            extensao === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : ""
      );
      if (![
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ].includes(mimeType)) {
        throw new Error("Selecione um ficheiro PDF, DOC ou DOCX.");
      }
      if (arquivoSelecionado.size && arquivoSelecionado.size > 20 * 1024 * 1024) {
        throw new Error("O documento não pode exceder 20 MB.");
      }

      const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, "");
      if (!apiUrl) throw new Error("A URL do backend não está configurada.");
      const token = await obterTokenAdministrador();
      if (!token) throw new Error("Inicie sessão como administrador para anexar o documento.");

      const arquivo = Platform.OS === "web"
        ? arquivoSelecionado.file
        : new File(arquivoSelecionado.uri);
      if (!arquivo || (Platform.OS !== "web" && !(arquivo as File).exists)) {
        throw new Error("O ficheiro selecionado não está disponível no dispositivo.");
      }
      const body = new FormData();
      body.append("document", arquivo, arquivoSelecionado.name);
      const resposta = await expoFetch(`${apiUrl}/orders/${pedido.remoto_id}/document`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      if (!resposta.ok) {
        const erro = await resposta.json().catch(() => null) as { message?: unknown } | null;
        throw new Error(typeof erro?.message === "string" ? erro.message : `Não foi possível enviar o documento (API ${resposta.status}).`);
      }

      const documento = await resposta.json() as { id?: string; originalName?: string };
      if (!documento.id) throw new Error("O servidor não confirmou o documento enviado.");
      await db.runAsync(
        `UPDATE pedidos SET documento_nome = ?, documento_uri = ?, documento_remoto_id = ? WHERE id = ?`,
        documento.originalName ?? arquivoSelecionado.name,
        `${apiUrl}/orders/${pedido.remoto_id}/document`,
        documento.id,
        pedido.id,
      );
      await carregarPedidos(false);
      showAppAlert("Documento anexado", "O ficheiro foi enviado e já pode ser baixado neste pedido.");
    } catch (erro) {
      showAppAlert("Não foi possível anexar o documento", erro instanceof Error ? erro.message : "Verifique a ligação e tente novamente.");
    } finally {
      setDocumentoProcessando(null);
    }
  }

  // Mantido para referência durante a migração do cartão antigo.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function renderPedido({ item }: { item: Pedido }) {
    const resumo = calcularResumoPedido(item);
    const entregue = item.estado === "Entregue";

    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.numero}>{item.numero}</Text>

          <View style={[styles.status, entregue && styles.statusEntregue]}>
            <Text
              style={[styles.statusText, entregue && styles.statusEntregueText]}
            >
              {obterNomeEstado(item.estado, item.servico)}
            </Text>
          </View>
        </View>

        <Text style={styles.cliente}>{item.cliente}</Text>

        <Text style={styles.contacto}>{item.contacto}</Text>

        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={styles.label}>Serviço</Text>

          <Text style={styles.value}>{item.servico}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Páginas</Text>

          <Text style={styles.value}>{item.numero_paginas}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Cópias</Text>

          <Text style={styles.value}>{item.numero_copias}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Impressão</Text>

          <Text style={styles.value}>
            {item.frente_verso === 1 ? "Frente e verso" : "Frente única"}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Folhas necessárias</Text>

          <Text style={styles.value}>{item.folhas_necessarias} folhas</Text>
        </View>

        <View style={styles.summaryBox}>
          <Text style={styles.summaryTitle}>Resumo do trabalho</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Documento</Text>
            <Text style={styles.summaryValue}>
              {item.numero_paginas} páginas
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Cópias</Text>
            <Text style={styles.summaryValue}>{item.numero_copias}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Impressão</Text>
            <Text style={styles.summaryValue}>
              {item.frente_verso === 1 ? "Frente e verso" : "Frente única"}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Páginas impressas</Text>
            <Text style={styles.summaryValue}>
              {resumo.totalPaginasImpressas}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Folhas necessárias</Text>
            <Text style={styles.summaryValue}>{resumo.folhasUtilizadas}</Text>
          </View>
        </View>

        <View style={styles.financeBox}>
          <Text style={styles.summaryTitle}>Financeiro</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Valor do pedido</Text>
            <Text style={styles.summaryValue}>
              {resumo.valorPedido.toFixed(2)} MT
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Recebido</Text>
            <Text style={styles.receivedValue}>
              {resumo.valorRecebido.toFixed(2)} MT
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Por receber</Text>
            <Text style={styles.pendingValue}>
              {resumo.valorPendente.toFixed(2)} MT
            </Text>
          </View>
        </View>

        {item.stock_descontado === 1 && (
          <View style={styles.costBox}>
            <Text style={styles.summaryTitle}>Custos diretos</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Papel</Text>
              <Text style={styles.costValue}>
                {resumo.custoPapel.toFixed(2)} MT
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Tinta estimada</Text>
              <Text style={styles.costValue}>
                {resumo.custoTinta.toFixed(2)} MT
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.totalLabel}>Custos conhecidos</Text>
              <Text style={styles.totalCost}>
                {resumo.custosDiretos.toFixed(2)} MT
              </Text>
            </View>
            <View style={styles.marginBox}>
              <Text style={styles.marginLabel}>
                Margem antes de outros custos
              </Text>
              <Text style={styles.marginValue}>
                {resumo.margemAntesOutrosCustos.toFixed(2)} MT
              </Text>
            </View>
          </View>
        )}

        <View style={styles.row}>
          <Text style={styles.label}>Documento</Text>

          <Text style={styles.value} numberOfLines={1}>
            {item.documento_nome || "Sem documento"}
          </Text>
        </View>

        <View style={styles.totalArea}>
          <Text style={styles.totalLabel}>Total do pedido</Text>

          <Text style={styles.total}>{item.total.toFixed(2)} MT</Text>
        </View>

        {!entregue && (
          <Pressable style={styles.button} onPress={() => proximoEstado(item)}>
            <Text style={styles.buttonText}>Avançar estado</Text>
          </Pressable>
        )}

        {entregue && (
          <View style={styles.finished}>
            <Text style={styles.finishedText}>✓ Pedido concluído</Text>
          </View>
        )}
      </View>
    );
  }

  function renderPedidoSimples({ item }: { item: Pedido }) {
    const aberto = pedidoAberto === item.id;
    const totalPaginas = item.numero_paginas * item.numero_copias;
    const pago = item.valor_pago ?? 0;
    const falta = Math.max(item.total - pago, 0);
    const sinalBloqueado =
      item.estado === "Pedido recebido" && pago < item.total * 0.5;
    const saldoBloqueado =
      item.estado === "Pronto para levantamento" && falta > 0.001;
    return (
      <View style={styles.orderCard}>
        <View style={styles.orderHeader}>
          <View>
            <Text style={styles.orderNumber}>{item.numero}</Text>
            <Text style={styles.clientName}>{item.cliente}</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              item.estado === "Pedido recebido" && styles.statusReceived,
              item.estado === "Em preparação" && styles.statusPreparing,
              item.estado === "Entregue" && styles.statusDelivered,
              item.estado === "Em impressão" && styles.statusPrinting,
              item.estado === "Pronto para levantamento" && styles.statusReady,
              item.estado === "Cancelado" && styles.statusCancelled,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                item.estado === "Pedido recebido" && styles.statusTextReceived,
                item.estado === "Em preparação" && styles.statusTextPreparing,
                item.estado === "Em impressão" && styles.statusTextPrinting,
                item.estado === "Pronto para levantamento" && styles.statusTextReady,
                item.estado === "Entregue" && styles.statusTextDelivered,
                item.estado === "Cancelado" && styles.statusTextCancelled,
              ]}
            >
              {obterNomeEstado(item.estado, item.servico)}
            </Text>
          </View>
        </View>
        <View style={styles.serviceRow}>
          <View style={styles.serviceIcon}>
            <Ionicons name="print-outline" size={22} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.serviceName}>{item.servico}</Text>
            <Text style={styles.serviceDetails}>
              {totalPaginas} página{totalPaginas !== 1 ? "s" : ""} •{" "}
              {item.numero_copias} cópia{item.numero_copias !== 1 ? "s" : ""}
            </Text>
          </View>
        </View>
        <View style={styles.priceRow}>
          <View>
            <Text style={styles.priceLabel}>Total</Text>
            <Text style={styles.price}>{item.total.toFixed(2)} MT</Text>
          </View>
          {falta > 0 ? (
            <View>
              <Text style={styles.pendingSmall}>Falta receber</Text>
              <Text style={styles.pendingMoney}>{falta.toFixed(2)} MT</Text>
            </View>
          ) : (
            <View style={styles.paidBadge}>
              <Ionicons name="checkmark-circle" size={17} color={colors.success} />
              <Text style={styles.paidText}>Pago</Text>
            </View>
          )}
        </View>
        <Pressable
          style={styles.detailsButton}
          onPress={() => setPedidoAberto(aberto ? null : item.id)}
        >
          <Text style={styles.detailsButtonText}>
            {aberto ? "Ocultar detalhes" : "Ver detalhes"}
          </Text>
          <Ionicons
            name={aberto ? "chevron-up" : "chevron-down"}
            size={19}
            color={colors.brand}
          />
        </Pressable>
        {aberto && (
          <View style={styles.expandedArea}>
            <View style={styles.detailLine}>
              <Text style={styles.detailLabel}>Contacto</Text>
              <Text style={styles.detailValue}>{item.contacto}</Text>
            </View>
            {item.instrucoes && (
              <View style={styles.instructionsBlock}>
                <Text style={styles.detailLabel}>Tema e instruções do cliente</Text>
                <Text style={styles.instructionsText}>{item.instrucoes}</Text>
              </View>
            )}
            <View style={styles.detailLine}>
              <Text style={styles.detailLabel}>Documento</Text>
              <Text style={styles.detailValue}>
                {item.documento_nome ?? "Sem documento"}
              </Text>
            </View>
            {item.documento_uri && (
              <Pressable
                style={styles.downloadButton}
                onPress={() => baixarDocumento(item)}
              >
                <Ionicons name="download-outline" size={19} color={colors.brand} />
                <Text style={styles.downloadButtonText}>Baixar documento</Text>
              </Pressable>
            )}
            {!item.documento_uri && (
              <Pressable
                style={styles.downloadButton}
                disabled={documentoProcessando !== null}
                onPress={() => anexarDocumento(item)}
              >
                {documentoProcessando === item.id
                  ? <ActivityIndicator size="small" color={colors.brand} />
                  : <Ionicons name="cloud-upload-outline" size={19} color={colors.brand} />}
                <Text style={styles.downloadButtonText}>
                  {documentoProcessando === item.id ? "A enviar documento..." : "Anexar documento"}
                </Text>
              </Pressable>
            )}
            <View style={styles.detailLine}>
              <Text style={styles.detailLabel}>Impressão</Text>
              <Text style={styles.detailValue}>
                {item.frente_verso === 1 ? "Frente e verso" : "Frente única"}
              </Text>
            </View>
            <View style={styles.detailLine}>
              <Text style={styles.detailLabel}>Folhas</Text>
              <Text style={styles.detailValue}>{item.folhas_necessarias}</Text>
            </View>
            <View style={styles.separator} />
            <View style={styles.detailLine}>
              <Text style={styles.detailLabel}>Recebido confirmado</Text>
              <Text style={styles.receivedText}>{pago.toFixed(2)} MT</Text>
            </View>
            <View style={styles.detailLine}>
              <Text style={styles.detailLabel}>Por receber</Text>
              <Text style={styles.pendingText}>{falta.toFixed(2)} MT</Text>
            </View>
            {sinalBloqueado && (
              <View style={styles.paymentWarning}>
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color={colors.warning}
                />
                <Text style={styles.paymentWarningText}>
                  Aguardando confirmação de 50% do pagamento (
                  {(item.total * 0.5 - pago).toFixed(2)} MT em falta).
                </Text>
              </View>
            )}
            {saldoBloqueado && (
              <View style={styles.paymentWarning}>
                <Ionicons name="wallet-outline" size={18} color={colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.paymentWarningText}>
                    Falta pagar {falta.toFixed(2)} MT
                  </Text>
                  <Text style={styles.paymentWarningSubtext}>
                    Receba o saldo antes da entrega.
                  </Text>
                </View>
              </View>
            )}
            {item.stock_descontado === 1 && (
              <>
                <View style={styles.separator} />
                <Text style={styles.internalTitle}>Custos internos</Text>
                <View style={styles.detailLine}>
                  <Text style={styles.detailLabel}>Papel</Text>
                  <Text style={styles.detailValue}>
                    {(item.custo_papel ?? 0).toFixed(2)} MT
                  </Text>
                </View>
                <View style={styles.detailLine}>
                  <Text style={styles.detailLabel}>Tinta estimada</Text>
                  <Text style={styles.detailValue}>
                    {(item.custo_tinta ?? 0).toFixed(2)} MT
                  </Text>
                </View>
              </>
            )}
            {item.estado !== "Entregue" && item.estado !== "Cancelado" && (
              <Pressable
                disabled={
                  sinalBloqueado || saldoBloqueado || pedidoProcessando !== null
                }
                style={[
                  styles.advanceButton,
                  (sinalBloqueado || saldoBloqueado) &&
                    styles.actionButtonDisabled,
                ]}
                onPress={() => proximoEstado(item)}
              >
                {pedidoProcessando === item.id ? <ActivityIndicator color={colors.surface} /> : <><Ionicons name={sinalBloqueado || saldoBloqueado ? "lock-closed-outline" : "arrow-forward-circle-outline"} size={20} color={colors.surface} /><Text style={styles.advanceText}>{sinalBloqueado ? "Aguardando sinal de 50%" : saldoBloqueado ? "Aguardando pagamento" : obterProximaAcao(item.estado, item.servico)}</Text></>}
              </Pressable>
            )}
          </View>
        )}
      </View>
    );
  }

  if (carregando) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />

        <Text style={styles.loading}>A carregar pedidos...</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={[styles.content, isDesktop && { maxWidth: 1000, width: '100%', alignSelf: 'center' }]}
      refreshControl={
        <RefreshControl refreshing={atualizando} onRefresh={() => void carregarPedidos()} />
      }
      data={pedidos}
      keyExtractor={(item) => item.id.toString()}
      renderItem={renderPedidoSimples}
      ListHeaderComponent={
        <View style={styles.pageHeader}>
          <Text style={styles.title}>Pedidos</Text>

          <Text style={styles.subtitle}>{pedidos.length} pedido(s)</Text>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📦</Text>

          <Text style={styles.emptyTitle}>Nenhum pedido</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  content: {
    padding: spacing.xl,
    paddingBottom: 40,
  },

  pageHeader: {
    marginBottom: spacing.xl,
  },

  title: {
    fontSize: 28,
    fontWeight: fontWeights.bold,
    color: colors.brand,
  },

  subtitle: {
    color: colors.subtle,
    marginTop: spacing.xs,
  },

  card: {
    backgroundColor: colors.surface,
    padding: 18,
    borderRadius: radii.lg,
    marginBottom: 15,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  numero: {
    fontSize: 18,
    fontWeight: fontWeights.bold,
    color: colors.brand,
  },

  status: {
    backgroundColor: colors.infoSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.xxl,
    maxWidth: "55%",
  },

  statusText: {
    color: colors.info,
    fontSize: 11,
    fontWeight: fontWeights.bold,
  },

  statusEntregue: {
    backgroundColor: colors.successSoft,
  },

  statusEntregueText: {
    color: colors.success,
  },

  cliente: {
    fontSize: 17,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    marginTop: spacing.lg,
  },

  contacto: {
    color: colors.subtle,
    marginTop: 3,
  },

  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 15,
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  label: {
    color: colors.subtle,
  },

  value: {
    color: colors.text,
    fontWeight: fontWeights.medium,
    maxWidth: "60%",
  },

  costBox: {
    backgroundColor: colors.warningSoft,
    padding: 14,
    borderRadius: radii.md,
    marginTop: 10,
  },

  costTitle: {
    color: colors.brand,
    fontWeight: fontWeights.bold,
    marginBottom: 5,
  },

  summaryBox: {
    backgroundColor: colors.brandSoft,
    padding: 14,
    borderRadius: radii.md,
    marginTop: 14,
  },

  financeBox: {
    backgroundColor: "#F7FAFC",
    padding: 14,
    borderRadius: radii.md,
    marginTop: 10,
  },

  summaryTitle: {
    color: colors.brand,
    fontSize: 16,
    fontWeight: fontWeights.bold,
    marginBottom: spacing.md,
  },

  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },

  summaryLabel: { color: colors.muted },
  summaryValue: { color: colors.brand, fontWeight: fontWeights.semibold },
  receivedValue: { color: colors.success, fontWeight: fontWeights.bold },
  pendingValue: { color: colors.warning, fontWeight: fontWeights.bold },
  costValue: { color: colors.danger, fontWeight: fontWeights.semibold },
  totalCost: { color: colors.danger, fontWeight: fontWeights.bold },

  marginBox: {
    backgroundColor: colors.successSoft,
    padding: spacing.md,
    borderRadius: radii.sm,
    marginTop: 10,
  },

  orderCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 17,
    marginBottom: 14,
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  orderNumber: { color: colors.brand, fontSize: 18, fontWeight: fontWeights.bold },
  clientName: { color: colors.muted, marginTop: 3 },
  statusBadge: {
    backgroundColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.xxl,
    maxWidth: "48%",
  },
  statusReceived: { backgroundColor: colors.infoSoft },
  statusPreparing: { backgroundColor: colors.accentSoft },
  statusDelivered: { backgroundColor: colors.successSoft },
  statusPrinting: { backgroundColor: colors.accentSoft },
  statusReady: { backgroundColor: colors.warningSoft },
  statusCancelled: { backgroundColor: colors.dangerSoft },
  statusTextReceived: { color: colors.info },
  statusTextPreparing: { color: colors.accent },
  statusTextPrinting: { color: colors.accent },
  statusTextReady: { color: colors.warning },
  statusTextDelivered: { color: colors.success },
  statusTextCancelled: { color: colors.danger },
  serviceRow: { flexDirection: "row", alignItems: "center", marginTop: 18 },
  serviceIcon: {
    width: 43,
    height: 43,
    borderRadius: radii.md,
    backgroundColor: colors.brandSoft,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 11,
  },
  serviceName: { color: colors.brand, fontWeight: fontWeights.bold, fontSize: 15 },
  serviceDetails: { color: colors.subtle, marginTop: 3, fontSize: 13 },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 18,
  },
  priceLabel: { color: colors.subtle, fontSize: 12 },
  price: { color: colors.brand, fontSize: 22, fontWeight: fontWeights.bold, marginTop: 2 },
  paidBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.successSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.xxl,
  },
  paidText: { color: colors.success, fontWeight: fontWeights.bold, fontSize: 12 },
  pendingSmall: { color: colors.subtle, fontSize: 11, textAlign: "right" },
  pendingMoney: { color: colors.warning, fontWeight: fontWeights.bold, marginTop: 2 },
  detailsButton: {
    minHeight: 45,
    marginTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingTop: 10,
  },
  detailsButtonText: { color: colors.brand, fontWeight: fontWeights.semibold },
  expandedArea: {
    backgroundColor: "#F8FAFC",
    borderRadius: 13,
    padding: 14,
    marginTop: 5,
  },
  detailLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  instructionsBlock: {
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radii.sm,
    backgroundColor: colors.brandSoft,
  },
  instructionsText: { color: "#334E68", lineHeight: 20, marginTop: 5 },
  detailLabel: { color: colors.subtle, flex: 1 },
  detailValue: {
    color: colors.text,
    fontWeight: fontWeights.semibold,
    flex: 1,
    textAlign: "right",
  },
  downloadButton: {
    minHeight: 44,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 2,
    marginBottom: 14,
  },
  downloadButtonText: { color: colors.brand, fontWeight: fontWeights.bold },
  separator: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
  receivedText: { color: colors.success, fontWeight: fontWeights.bold },
  pendingText: { color: colors.warning, fontWeight: fontWeights.bold },
  internalTitle: { color: colors.brand, fontWeight: fontWeights.bold, marginBottom: spacing.md },
  advanceButton: {
    minHeight: 48,
    borderRadius: 11,
    backgroundColor: colors.brand,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 10,
  },
  actionButtonDisabled: { opacity: 0.45 },
  paymentWarning: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.warningSoft,
    padding: spacing.md,
    borderRadius: radii.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  paymentWarningText: {
    flex: 1,
    color: colors.warning,
    fontSize: 13,
    fontWeight: fontWeights.semibold,
  },
  paymentWarningSubtext: { marginTop: 2, color: colors.warning, fontSize: 12 },
  advanceText: { color: colors.surface, fontWeight: fontWeights.bold },

  marginLabel: { color: colors.success, fontSize: 12 },
  marginValue: {
    color: colors.success,
    fontSize: 22,
    fontWeight: fontWeights.bold,
    marginTop: 3,
  },

  costText: {
    color: colors.muted,
    marginTop: 2,
  },

  costTotal: {
    color: colors.brand,
    fontWeight: fontWeights.bold,
    marginTop: 5,
  },

  totalArea: {
    backgroundColor: colors.background,
    padding: 14,
    borderRadius: radii.md,
    marginTop: spacing.sm,
  },

  totalLabel: {
    color: colors.subtle,
    fontSize: 12,
  },

  total: {
    color: colors.brand,
    fontSize: 22,
    fontWeight: fontWeights.bold,
    marginTop: 3,
  },

  button: {
    backgroundColor: colors.brand,
    padding: 15,
    borderRadius: radii.md,
    alignItems: "center",
    marginTop: 15,
  },

  buttonText: {
    color: colors.surface,
    fontWeight: fontWeights.bold,
  },

  finished: {
    backgroundColor: colors.successSoft,
    padding: 14,
    borderRadius: radii.md,
    alignItems: "center",
    marginTop: 15,
  },

  finishedText: {
    color: colors.success,
    fontWeight: fontWeights.bold,
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },

  loading: {
    color: colors.subtle,
    marginTop: 10,
  },

  empty: {
    alignItems: "center",
    marginTop: 80,
  },

  emptyIcon: {
    fontSize: 50,
  },

  emptyTitle: {
    fontSize: 20,
    fontWeight: fontWeights.bold,
    color: colors.brand,
    marginTop: 10,
  },
});
