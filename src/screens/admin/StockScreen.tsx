import { formatarDinheiro } from '../../utils/formatters';
import { colors, fontWeights, radii, spacing } from '../../theme';
import { showAppAlert } from '../../components/AppAlert';
import ActionButton from '../../components/ActionButton';
import React, { useCallback, useState } from 'react';

import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  Modal,
  Alert,
  ScrollView,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { useFocusEffect } from '@react-navigation/native';
import { useResponsiveContent } from '../../hooks/useResponsive';

import {
  criarItemStock,
  listarStock,
  removerStock,
  registrarCompraStock,
  definirCustoInicialStock,
  aplicarCustosPadraoImpressao,
  ajustarQuantidadeStock,
  registrarDesperdicio,
  listarPerdasStock,
  ItemStock,
  PerdaStock,
} from '../../services/stockService';

const categoriasDisponiveis = [
  'Papel',
  'Tinta',
  'Encadernação',
  'Manutenção',
  'Equipamento',
  'Outros',
];

const unidadesDisponiveis = [
  'folhas',
  'resmas',
  'unidades',
  'caixas',
  'pacotes',
  'litros',
];

export default function StockScreen() {
  const { isDesktop } = useResponsiveContent(20);
  const [itens, setItens] = useState<ItemStock[]>([]);
  const [perdas, setPerdas] = useState<PerdaStock[]>([]);

  const [modalNovo, setModalNovo] = useState(false);
  const [modalCompra, setModalCompra] = useState(false);
  const [modalCustoInicial, setModalCustoInicial] = useState(false);
  const [modalDesperdicio, setModalDesperdicio] = useState(false);
  const [modalAjuste, setModalAjuste] = useState(false);
  const [modalCalculadora, setModalCalculadora] = useState(false);
  const [itemSelecionado, setItemSelecionado] =
    useState<ItemStock | null>(null);

  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState('Papel');
  const [unidade, setUnidade] = useState('folhas');
  const [quantidade, setQuantidade] = useState('');
  const [stockMinimo, setStockMinimo] = useState('');

  const [movimento, setMovimento] = useState('');
  const [valorCompra, setValorCompra] = useState('');
  const [quantidadeCompra, setQuantidadeCompra] = useState('');
  const [valorCustoInicial, setValorCustoInicial] = useState('');
  const [quantidadeDesperdicio, setQuantidadeDesperdicio] = useState('');
  const [motivoDesperdicio, setMotivoDesperdicio] = useState('');
  const [quantidadeReal, setQuantidadeReal] = useState('');
  const [compraAtiva, setCompraAtiva] = useState(false);
  const [perdaAtiva, setPerdaAtiva] = useState(false);
  const [motivoPerda, setMotivoPerda] = useState('');
  const [pedidoIdPerda, setPedidoIdPerda] = useState('');
  const [processandoStock, setProcessandoStock] = useState(false);

  async function carregar() {
    try {
      const [dados, historicoPerdas] = await Promise.all([
        listarStock(),
        listarPerdasStock(),
      ]);
      setItens(dados);
      setPerdas(historicoPerdas);
    } catch (erro) {
      console.error(erro);
      showAppAlert('Stock indisponível', erro instanceof Error ? erro.message : 'Não foi possível carregar o stock online.');
    }
  }

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [])
  );

  async function guardarItem() {
    const quantidadeNumero =
      Number(quantidade.replace(',', '.'));

    const minimoNumero =
      Number(stockMinimo.replace(',', '.'));

    if (
      !nome.trim() ||
      !categoria.trim() ||
      !unidade.trim()
    ) {
      showAppAlert(
        'Atenção',
        'Preencha nome, categoria e unidade.'
      );
      return;
    }

    if (
      !Number.isFinite(quantidadeNumero) ||
      quantidadeNumero < 0
    ) {
      showAppAlert(
        'Atenção',
        'Informe uma quantidade válida.'
      );
      return;
    }

    if (
      !Number.isFinite(minimoNumero) ||
      minimoNumero < 0
    ) {
      showAppAlert(
        'Atenção',
        'Informe um stock mínimo válido.'
      );
      return;
    }

    if (
      unidade === 'folhas' &&
      (!Number.isSafeInteger(quantidadeNumero) ||
        !Number.isSafeInteger(minimoNumero))
    ) {
      showAppAlert(
        'Atenção',
        'As quantidades de folhas devem ser números inteiros.'
      );
      return;
    }

    try {
      await criarItemStock(
        nome.trim(),
        categoria.trim(),
        unidade.trim(),
        quantidadeNumero,
        minimoNumero
      );

      setNome('');
      setCategoria('Papel');
      setUnidade('folhas');
      setQuantidade('');
      setStockMinimo('');
      setModalNovo(false);

      await carregar();

      showAppAlert(
        'Sucesso',
        'Material adicionado ao stock.'
      );
    } catch (erro) {
      console.error(erro);

      showAppAlert(
        'Erro',
        'Não foi possível criar o material.'
      );
    }
  }

  function abrirNovoMaterial() {
    setNome('');
    setCategoria('Papel');
    setUnidade('folhas');
    setQuantidade('');
    setStockMinimo('');
    setModalNovo(true);
  }

  function alterarNomeMaterial(novoNome: string) {
    setNome(novoNome);
    if (novoNome.trim().toLocaleLowerCase() === 'papel a4') {
      setCategoria('Papel');
      setUnidade('folhas');
    }
  }

  async function comprarMaterial() {
    const item = itemSelecionado;
    if (!item) {
      return;
    }

    const quantidadeNumero = Number(
      movimento.replace(',', '.')
    );
    const valorNumero = Number(
      valorCompra.replace(',', '.')
    );

    if (!Number.isFinite(quantidadeNumero) || quantidadeNumero <= 0) {
      showAppAlert(
        'Atenção',
        'Informe a quantidade comprada.'
      );
      return;
    }

    if (
      item.unidade.trim().toLocaleLowerCase() === 'folhas' &&
      !Number.isSafeInteger(quantidadeNumero)
    ) {
      showAppAlert(
        'Atenção',
        'A quantidade de folhas deve ser um número inteiro.'
      );
      return;
    }

    if (!Number.isFinite(valorNumero) || valorNumero <= 0) {
      showAppAlert(
        'Atenção',
        'Informe o valor total da compra.'
      );
      return;
    }

    try {
      await registrarCompraStock(
        item.id,
        quantidadeNumero,
        valorNumero
      );

      setItemSelecionado(null);
      setMovimento('');
      setValorCompra('');
      setCompraAtiva(false);
      setPerdaAtiva(false);
      setMotivoPerda('');
      setPedidoIdPerda('');

      await carregar();

      showAppAlert(
        'Compra registada',
        `${quantidadeNumero} ${item.unidade} adicionadas ao stock por ${valorNumero.toFixed(2)} MT.`
      );
    } catch (erro) {
      showAppAlert(
        'Erro',
        erro instanceof Error
          ? erro.message
          : 'Não foi possível registar a compra.'
      );
    }
  }

  async function confirmarCompra() {
    if (processandoStock || !itemSelecionado) return;
    const quantidadeNumero = Number(quantidadeCompra.replace(',', '.'));
    const valorNumero = Number(valorCompra.replace(',', '.'));
    if (!Number.isFinite(quantidadeNumero) || quantidadeNumero <= 0) {
      showAppAlert('Quantidade inválida', 'Informe quanto material foi comprado.');
      return;
    }
    if (itemSelecionado.unidade.toLowerCase() === 'folhas' && !Number.isSafeInteger(quantidadeNumero)) {
      showAppAlert('Quantidade inválida', 'A quantidade de folhas deve ser um número inteiro.');
      return;
    }
    if (!Number.isFinite(valorNumero) || valorNumero <= 0) {
      showAppAlert('Valor inválido', 'Informe quanto pagou pela compra.');
      return;
    }
    try {
      setProcessandoStock(true);
      await registrarCompraStock(itemSelecionado.id, quantidadeNumero, valorNumero);
      const unidade = itemSelecionado.unidade;
      setQuantidadeCompra('');
      setValorCompra('');
      setModalCompra(false);
      setItemSelecionado(null);
      await carregar();
      showAppAlert('Compra registada', `${quantidadeNumero} ${unidade} adicionadas ao stock.`);
    } catch (erro) {
      showAppAlert('Erro', erro instanceof Error ? erro.message : 'Não foi possível registar a compra.');
    } finally {
      setProcessandoStock(false);
    }
  }

  function pedirConfirmacaoCompra() {
    if (!itemSelecionado || processandoStock) return;
    const quantidade = Number(quantidadeCompra.replace(',', '.'));
    const valor = Number(valorCompra.replace(',', '.'));
    if (!Number.isFinite(quantidade) || quantidade <= 0 || !Number.isFinite(valor) || valor <= 0) {
      showAppAlert('Dados inválidos', 'Verifique a quantidade e o valor da compra.');
      return;
    }
    showAppAlert(
      'Confirmar compra',
      `${itemSelecionado.nome}\n\nQuantidade: ${quantidade} ${itemSelecionado.unidade}\nValor pago: ${formatarDinheiro(valor)}\n\nEsta operação aumentará o stock e registará uma saída no Caixa.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', onPress: confirmarCompra },
      ]
    );
  }

  async function confirmarCustoInicial() {
    if (!itemSelecionado) return;
    const valor = Number(valorCustoInicial.replace(',', '.'));
    if (!Number.isFinite(valor) || valor <= 0) {
      showAppAlert('Valor inválido', 'Informe o valor real do stock existente.');
      return;
    }
    try {
      await definirCustoInicialStock(itemSelecionado.id, valor);
      setModalCustoInicial(false);
      setValorCustoInicial('');
      setItemSelecionado(null);
      await carregar();
      showAppAlert('Custo definido', 'O custo médio foi inicializado sem alterar a quantidade nem o Caixa.');
    } catch (erro) {
      showAppAlert('Erro', erro instanceof Error ? erro.message : 'Não foi possível definir o custo inicial.');
    }
  }

  async function confirmarDesperdicio() {
    if (processandoStock || !itemSelecionado) return;
    const quantidade = Number(quantidadeDesperdicio.replace(',', '.'));
    if (!Number.isInteger(quantidade) || quantidade <= 0) {
      showAppAlert('Quantidade inválida', 'Informe uma quantidade inteira maior que zero.'); return;
    }
    if (!motivoDesperdicio.trim()) {
      showAppAlert('Informe o motivo', 'Ex.: folha manchada ou papel danificado.'); return;
    }
    try {
      setProcessandoStock(true);
      await registrarDesperdicio(itemSelecionado.id, quantidade, motivoDesperdicio.trim());
      setModalDesperdicio(false); setQuantidadeDesperdicio(''); setMotivoDesperdicio(''); setItemSelecionado(null);
      await carregar();
      showAppAlert('Desperdício registado', `${quantidade} unidade(s) retiradas do stock.`);
    } catch (erro) { showAppAlert('Erro', erro instanceof Error ? erro.message : 'Não foi possível registar.'); }
    finally { setProcessandoStock(false); }
  }

  function pedirConfirmacaoDesperdicio() {
    if (!itemSelecionado || processandoStock) return;
    const quantidade = Number(quantidadeDesperdicio.replace(',', '.'));
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      showAppAlert('Quantidade inválida', 'Informe uma quantidade maior que zero.');
      return;
    }
    showAppAlert(
      'Confirmar desperdício',
      `Deseja retirar ${quantidade} ${itemSelecionado.unidade} de ${itemSelecionado.nome} do stock?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', onPress: confirmarDesperdicio },
      ]
    );
  }

  async function confirmarAjuste() {
    if (processandoStock || !itemSelecionado) return;
    const quantidade = Number(quantidadeReal.replace(',', '.'));
    if (!Number.isFinite(quantidade) || quantidade < 0) {
      showAppAlert('Quantidade inválida', 'Informe a quantidade física encontrada.'); return;
    }
    try {
      setProcessandoStock(true);
      const antes = itemSelecionado.quantidade;
      const unidade = itemSelecionado.unidade;
      await ajustarQuantidadeStock(itemSelecionado.id, quantidade, 'Ajuste de inventário');
      setModalAjuste(false); setQuantidadeReal(''); setItemSelecionado(null);
      await carregar();
      showAppAlert('Stock corrigido', `Antes: ${antes} ${unidade}\nDepois: ${quantidade} ${unidade}`);
    } catch (erro) { showAppAlert('Erro', erro instanceof Error ? erro.message : 'Não foi possível corrigir o stock.'); }
    finally { setProcessandoStock(false); }
  }

  async function confirmarAplicacaoCustos() {
    if (processandoStock) return;
    try {
      setProcessandoStock(true);
      await aplicarCustosPadraoImpressao();
      setModalCalculadora(false);
      await carregar();
      showAppAlert(
        'Custos corrigidos',
        'Os custos de Papel A4 e Tinta Epson L3252 foram atualizados no servidor. A alteração vale para novas impressões; os custos dos pedidos já impressos foram mantidos.'
      );
    } catch (erro) {
      showAppAlert('Erro', erro instanceof Error ? erro.message : 'Não foi possível atualizar os custos.');
    } finally {
      setProcessandoStock(false);
    }
  }

  function pedirConfirmacaoAplicacaoCustos() {
    showAppAlert(
      'Aplicar calculadora de custos?',
      'Papel A4: 0,70 MT/folha. Tinta Epson L3252: 200 MT por frasco. A tinta passará a ser controlada em frascos. Não altera quantidades, caixa nem custos dos pedidos antigos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Aplicar', onPress: confirmarAplicacaoCustos },
      ]
    );
  }

  function pedirConfirmacaoAjuste() {
    if (!itemSelecionado || processandoStock) return;
    const quantidade = Number(quantidadeReal.replace(',', '.'));
    if (!Number.isFinite(quantidade) || quantidade < 0) {
      showAppAlert('Quantidade inválida', 'Informe uma quantidade válida.');
      return;
    }
    showAppAlert(
      'Confirmar correção',
      `O stock de ${itemSelecionado.nome} será alterado de ${itemSelecionado.quantidade} para ${quantidade} ${itemSelecionado.unidade}.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', onPress: confirmarAjuste },
      ]
    );
  }

  async function movimentar(
    tipo: 'saida' | 'perda'
  ) {
    const item = itemSelecionado;

    if (!item) {
      return;
    }

    const valor = Number(
      movimento.replace(',', '.')
    );

    if (!Number.isFinite(valor) || valor <= 0) {
      showAppAlert(
        'Atenção',
        'Informe uma quantidade válida.'
      );
      return;
    }

    const pedidoIdInformado = pedidoIdPerda.trim();
    const pedidoId = pedidoIdInformado
      ? Number(pedidoIdInformado)
      : undefined;

    if (
      tipo === 'perda' &&
      pedidoIdInformado &&
      (!Number.isSafeInteger(pedidoId) || (pedidoId ?? 0) <= 0)
    ) {
      showAppAlert(
        'Atenção',
        'Informe um ID numérico válido para o pedido.'
      );
      return;
    }

    try {
      if (tipo === 'perda') {
        await registrarDesperdicio(
          item.id,
          valor,
          motivoPerda,
          pedidoId
        );
      } else {
        await removerStock(
          item.id,
          valor
        );
      }

      setItemSelecionado(null);
      setMovimento('');
      setValorCompra('');
      setCompraAtiva(false);
      setPerdaAtiva(false);
      setMotivoPerda('');
      setPedidoIdPerda('');

      await carregar();

      showAppAlert(
        'Stock atualizado',
        tipo === 'perda'
          ? `Perda/Desperdício registada: ${valor} ${item.unidade}.`
          : 'Saída manual registada.'
      );
    } catch (erro) {
      showAppAlert(
        'Erro',
        erro instanceof Error
          ? erro.message
          : 'Não foi possível atualizar o stock.'
      );
    }
  }

  function renderItem({
    item,
  }: {
    item: ItemStock;
  }) {
    const stockBaixo =
      item.quantidade <= item.stock_minimo;

    return (
      <View style={styles.materialCard}>
        <View style={styles.materialHeader}>
          <View style={styles.materialIcon}><Ionicons name="cube-outline" size={24} color={colors.brand} /></View>
          <View style={styles.materialInfo}><Text style={styles.materialName}>{item.nome}</Text><Text style={styles.materialCategory}>{item.categoria}</Text></View>
          {stockBaixo && <View style={styles.lowBadge}><Text style={styles.lowBadgeText}>Repor</Text></View>}
        </View>
        <View style={styles.stockArea}><Text style={styles.stockNumber}>{item.quantidade.toLocaleString()}</Text><Text style={styles.stockUnit}>{item.unidade}</Text></View>
        <Text style={styles.availableText}>disponíveis</Text>
        <View style={styles.divider} />
        <View style={styles.detailRow}><Text style={styles.detailLabel}>Repor quando chegar a</Text><Text style={styles.detailValue}>{item.stock_minimo} {item.unidade}</Text></View>
        <View style={styles.detailRow}><Text style={styles.detailLabel}>Custo médio</Text><Text style={styles.detailValue}>{item.custo_medio > 0 ? `${item.custo_medio.toFixed(4)} MT/${item.unidade}` : 'Ainda não definido'}</Text></View>
        {item.custo_medio <= 0 && <Pressable style={styles.initialCostButton} onPress={() => { setItemSelecionado(item); setValorCustoInicial(''); setModalCustoInicial(true); }}><Ionicons name="calculator-outline" size={18} color={colors.brand} /><Text style={styles.initialCostText}>Definir custo inicial</Text></Pressable>}
        <View style={styles.materialActions}>
          <Pressable style={styles.buyButton} onPress={() => { setItemSelecionado(item); setQuantidadeCompra(''); setValorCompra(''); setModalCompra(true); }}><Ionicons name="cart-outline" size={19} color={colors.surface} /><Text style={styles.buyButtonText}>Comprar</Text></Pressable>
          <Pressable style={styles.moreButton} onPress={() => { setItemSelecionado(item); showAppAlert(item.nome, 'Escolha uma opção', [{ text: 'Registar desperdício', onPress: () => { setQuantidadeDesperdicio(''); setMotivoDesperdicio(''); setModalDesperdicio(true); } }, { text: 'Corrigir quantidade', onPress: () => { setQuantidadeReal(String(item.quantidade)); setModalAjuste(true); } }, { text: 'Ver histórico', onPress: () => showAppAlert('Histórico', 'Os movimentos deste material são guardados automaticamente.') }, { text: 'Cancelar', style: 'cancel' }]); }}><Ionicons name="ellipsis-horizontal" size={20} color={colors.brand} /><Text style={styles.moreButtonText}>Mais</Text></Pressable>
        </View>
      </View>
    );
  }

  return (
    <>
      <FlatList
        style={styles.container}
        contentContainerStyle={[styles.content, isDesktop && { maxWidth: 1000, width: '100%', alignSelf: 'center' }]}
        data={itens}
        keyExtractor={(item) =>
          item.id.toString()
        }
        renderItem={renderItem}
        ListHeaderComponent={
          <>
            <View style={styles.header}>
              <View>
                <Text style={styles.title}>
                  Stock
                </Text>

                <Text style={styles.subtitle}>
                  Materiais da EJC Print
                </Text>
              </View>

              <Pressable
                style={styles.addButton}
                onPress={abrirNovoMaterial}
              >
                <Text style={styles.addButtonText}>
                  + Novo
                </Text>
              </Pressable>
            </View>

            <Text style={styles.instruction}>
              Selecione um material para registar movimentos. Folhas são contadas em unidades inteiras.
            </Text>
            <Pressable style={styles.calculatorButton} onPress={() => setModalCalculadora(true)}>
              <Ionicons name="calculator-outline" size={19} color={colors.brand} />
              <Text style={styles.calculatorButtonText}>Calculadora de custos de impressão</Text>
            </Pressable>
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>
              📦
            </Text>

            <Text style={styles.emptyTitle}>
              Stock vazio
            </Text>

            <Text style={styles.emptyText}>
              Adicione o primeiro material.
            </Text>
          </View>
        }
        ListFooterComponent={
          perdas.length > 0 ? (
            <View style={styles.lossHistory}>
              <Text style={styles.lossHistoryTitle}>
                Perdas/Desperdícios registados
              </Text>

              {perdas.map((perda) => (
                <View
                  key={perda.id}
                  style={styles.lossCard}
                >
                  <View>
                    <Text style={styles.lossMaterial}>
                      {perda.material}
                    </Text>
                    <Text style={styles.lossDetail}>
                      {perda.motivo} · {perda.data_criacao.slice(0, 10)}
                    </Text>
                  </View>

                  <Text style={styles.lossQuantity}>
                    - {perda.quantidade} {perda.unidade}
                  </Text>
                </View>
              ))}
            </View>
          ) : null
        }
      />

      {/* NOVO MATERIAL */}

      <Modal
        visible={modalNovo}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setModalNovo(false)
        }
      >
        <View style={styles.overlay}>
          <View style={[styles.modal, styles.formModal]}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.formContent}
            >
            <Text style={styles.modalTitle}>
              Novo material
            </Text>

            <Text style={styles.formLabel}>Nome do material</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex.: Papel A4"
              value={nome}
              onChangeText={alterarNomeMaterial}
            />

            <Text style={styles.formLabel}>Categoria</Text>
            <View style={styles.choiceGroup}>
              {categoriasDisponiveis.map((opcao) => (
                <Pressable
                  key={opcao}
                  style={[
                    styles.choiceButton,
                    categoria === opcao && styles.choiceSelected,
                  ]}
                  onPress={() => setCategoria(opcao)}
                >
                  <Text
                    style={[
                      styles.choiceText,
                      categoria === opcao && styles.choiceTextSelected,
                    ]}
                  >
                    {opcao}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.formLabel}>Unidade de contagem</Text>
            <View style={styles.choiceGroup}>
              {unidadesDisponiveis.map((opcao) => (
                <Pressable
                  key={opcao}
                  style={[
                    styles.choiceButton,
                    unidade === opcao && styles.choiceSelected,
                  ]}
                  onPress={() => setUnidade(opcao)}
                >
                  <Text
                    style={[
                      styles.choiceText,
                      unidade === opcao && styles.choiceTextSelected,
                    ]}
                  >
                    {opcao}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.formLabel}>Quantidade inicial</Text>
            <TextInput
              style={styles.input}
              placeholder={`Quantidade em ${unidade}`}
              keyboardType="decimal-pad"
              value={quantidade}
              onChangeText={setQuantidade}
            />

            <Text style={styles.formLabel}>Avisar quando chegar a</Text>
            <TextInput
              style={styles.input}
              placeholder={`Mínimo em ${unidade}`}
              keyboardType="decimal-pad"
              value={stockMinimo}
              onChangeText={setStockMinimo}
            />

            <Pressable
              style={styles.primaryButton}
              onPress={guardarItem}
            >
              <Text style={styles.primaryText}>
                Guardar material
              </Text>
            </Pressable>

            <Pressable
              onPress={() =>
                setModalNovo(false)
              }
            >
              <Text style={styles.cancel}>
                Cancelar
              </Text>
            </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MOVIMENTAÇÃO */}

      <Modal
        visible={itemSelecionado !== null && !modalCompra && !modalCustoInicial && !modalDesperdicio && !modalAjuste}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setItemSelecionado(null)
        }
      >
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>
              {itemSelecionado?.nome}
            </Text>

            <Text style={styles.currentStock}>
              Stock atual: {itemSelecionado?.quantidade}{' '}
              {itemSelecionado?.unidade}
            </Text>

            <TextInput
              style={styles.input}
              placeholder={`Quantidade em ${itemSelecionado?.unidade ?? 'unidades'}`}
              keyboardType="decimal-pad"
              value={movimento}
              onChangeText={setMovimento}
            />

            {compraAtiva ? (
              <>
                <Text style={styles.modalLabel}>
                  Valor total da compra
                </Text>

                <TextInput
                  style={styles.input}
                  placeholder="Ex.: 350"
                  keyboardType="decimal-pad"
                  value={valorCompra}
                  onChangeText={setValorCompra}
                />

                <Pressable
                  style={styles.entryButton}
                  onPress={comprarMaterial}
                >
                  <Text style={styles.primaryText}>
                    Confirmar compra
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setCompraAtiva(false)}
                >
                  <Text style={styles.cancel}>
                    Voltar
                  </Text>
                </Pressable>
              </>
            ) : perdaAtiva ? (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Motivo (ex.: folhas manchadas)"
                  value={motivoPerda}
                  onChangeText={setMotivoPerda}
                />

                <TextInput
                  style={styles.input}
                  placeholder="ID numérico do pedido (opcional)"
                  keyboardType="number-pad"
                  value={pedidoIdPerda}
                  onChangeText={setPedidoIdPerda}
                />

                <Pressable
                  style={styles.lossButton}
                  onPress={() => movimentar('perda')}
                >
                  <Text style={styles.primaryText}>
                    Confirmar Perda/Desperdício
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setPerdaAtiva(false)}
                >
                  <Text style={styles.cancel}>
                    Voltar
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  style={styles.entryButton}
                  onPress={() => {
                    setMovimento('');
                    setValorCompra('');
                    setCompraAtiva(true);
                  }}
                >
                  <Text style={styles.primaryText}>
                    + Registar compra
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.exitButton}
                  onPress={() => movimentar('saida')}
                >
                  <Text style={styles.primaryText}>
                    − Saída manual
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.lossButton}
                  onPress={() => setPerdaAtiva(true)}
                >
                  <Text style={styles.primaryText}>
                    Perda/Desperdício
                  </Text>
                </Pressable>
              </>
            )}

            <Pressable
              onPress={() =>
                setItemSelecionado(null)
              }
            >
              <Text style={styles.cancel}>
                Cancelar
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={modalCompra} transparent animationType="slide" onRequestClose={() => setModalCompra(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}><View><Text style={styles.modalTitle}>Comprar material</Text><Text style={styles.modalSubtitle}>{itemSelecionado?.nome}</Text></View><Pressable onPress={() => setModalCompra(false)}><Ionicons name="close" size={28} color={colors.brand} /></Pressable></View>
            <Text style={styles.inputLabel}>Quantidade comprada</Text>
            <TextInput style={styles.input} keyboardType="decimal-pad" placeholder={`Ex.: 500 ${itemSelecionado?.unidade ?? ''}`} value={quantidadeCompra} onChangeText={setQuantidadeCompra} />
            <Text style={styles.inputLabel}>Quanto pagou?</Text>
            <TextInput style={styles.input} keyboardType="decimal-pad" placeholder="Ex.: 350 MT" value={valorCompra} onChangeText={setValorCompra} />
            {Number(quantidadeCompra.replace(',', '.')) > 0 && Number(valorCompra.replace(',', '.')) > 0 && <View style={styles.calculationBox}><Text style={styles.calculationLabel}>Custo desta compra</Text><Text style={styles.calculationValue}>{(Number(valorCompra.replace(',', '.')) / Number(quantidadeCompra.replace(',', '.'))).toFixed(4)} MT/{itemSelecionado?.unidade}</Text></View>}
            <ActionButton title="Confirmar compra" loading={processandoStock} onPress={pedirConfirmacaoCompra} style={styles.confirmButton} />
          </View>
        </View>
      </Modal>

      <Modal visible={modalCustoInicial} transparent animationType="slide" onRequestClose={() => setModalCustoInicial(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}><View><Text style={styles.modalTitle}>Definir custo inicial</Text><Text style={styles.modalSubtitle}>{itemSelecionado?.nome} · {itemSelecionado?.quantidade} {itemSelecionado?.unidade}</Text></View><Pressable onPress={() => setModalCustoInicial(false)}><Ionicons name="close" size={28} color={colors.brand} /></Pressable></View>
            <Text style={styles.inputLabel}>Valor total do stock existente</Text>
            <TextInput style={styles.input} keyboardType="decimal-pad" placeholder="Ex.: 323,40 MT" value={valorCustoInicial} onChangeText={setValorCustoInicial} />
            <Text style={styles.initialCostHint}>Este valor apenas define o custo médio. Não adiciona quantidade, despesa ou movimento no Caixa.</Text>
            <Pressable style={styles.confirmButton} onPress={confirmarCustoInicial}><Ionicons name="checkmark-circle-outline" size={21} color={colors.surface} /><Text style={styles.confirmButtonText}>Guardar custo inicial</Text></Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={modalCalculadora} transparent animationType="slide" onRequestClose={() => setModalCalculadora(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View><Text style={styles.modalTitle}>Calculadora de custos</Text><Text style={styles.modalSubtitle}>Estimativa para próximas impressões</Text></View>
              <Pressable onPress={() => setModalCalculadora(false)}><Ionicons name="close" size={28} color={colors.brand} /></Pressable>
            </View>
            <View style={styles.calculationBox}>
              <Text style={styles.calculationLabel}>Valores de referência</Text>
              <Text style={styles.calculatorDetail}>Papel A4: 0,70 MT por folha</Text>
              <Text style={styles.calculatorDetail}>Tinta preta: 200 MT ÷ 4.500 páginas = {(200 / 4500).toFixed(4)} MT/página</Text>
              <Text style={styles.calculatorDetail}>Tintas C/M/Y: 600 MT ÷ 7.500 páginas = {(600 / 7500).toFixed(4)} MT/página</Text>
              <Text style={styles.calculatorDetail}>Reserva para desperdício e limpeza: 10%</Text>
            </View>
            <View style={styles.calculationBox}>
              <Text style={styles.calculationLabel}>Custo estimado por página simples, com reserva</Text>
              <Text style={styles.calculationValue}>Preto e branco: {((0.7 + 200 / 4500) * 1.1).toFixed(3)} MT</Text>
              <Text style={styles.calculationValue}>A cores: {((0.7 + 600 / 7500) * 1.1).toFixed(3)} MT</Text>
            </View>
            <Text style={styles.initialCostHint}>O servidor calcula o papel pelas folhas realmente usadas (incluindo frente e verso) e acrescenta a tinta e a reserva. Aplicar corrige o custo médio do stock, sem alterar os custos dos pedidos já impressos.</Text>
            <ActionButton title="Aplicar custos para próximos pedidos" loading={processandoStock} onPress={pedirConfirmacaoAplicacaoCustos} style={styles.confirmButton} />
          </View>
        </View>
      </Modal>

      <Modal visible={modalDesperdicio} transparent animationType="slide" onRequestClose={() => setModalDesperdicio(false)}>
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Registar desperdício</Text><Text style={styles.modalSubtitle}>{itemSelecionado?.nome}</Text>
          <Text style={styles.inputLabel}>Quantidade perdida</Text><TextInput style={styles.input} keyboardType="number-pad" value={quantidadeDesperdicio} onChangeText={setQuantidadeDesperdicio} placeholder="Ex.: 3" />
          <Text style={styles.inputLabel}>Motivo</Text><TextInput style={styles.input} value={motivoDesperdicio} onChangeText={setMotivoDesperdicio} placeholder="Ex.: impressão saiu manchada" />
          <ActionButton title="Confirmar desperdício" loading={processandoStock} onPress={pedirConfirmacaoDesperdicio} style={styles.confirmButton} />
        </View></View>
      </Modal>

      <Modal visible={modalAjuste} transparent animationType="slide" onRequestClose={() => setModalAjuste(false)}>
        <View style={styles.modalOverlay}><View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Corrigir quantidade</Text><Text style={styles.modalSubtitle}>{itemSelecionado?.nome}</Text>
          <Text style={styles.inputLabel}>Quantidade física encontrada</Text><TextInput style={styles.input} keyboardType="decimal-pad" value={quantidadeReal} onChangeText={setQuantidadeReal} placeholder="Ex.: 957" />
          <Text style={styles.initialCostHint}>Este ajuste regista a diferença do inventário. Não será classificado automaticamente como desperdício.</Text>
          <ActionButton title="Guardar correção" loading={processandoStock} onPress={pedirConfirmacaoAjuste} style={styles.confirmButton} />
        </View></View>
      </Modal>
    </>
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

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  title: {
    fontSize: 28,
    fontWeight: fontWeights.bold,
    color: colors.brand,
  },

  subtitle: {
    color: colors.subtle,
    marginTop: 3,
  },

  addButton: {
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    borderRadius: radii.sm,
  },

  addButtonText: {
    color: colors.surface,
    fontWeight: fontWeights.bold,
  },

  instruction: {
    color: colors.muted,
    marginVertical: spacing.xl,
  },
  calculatorButton: { minHeight: 48, borderRadius: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginBottom: 18 },
  calculatorButtonText: { color: colors.brand, fontWeight: fontWeights.bold },

  card: {
    backgroundColor: colors.surface,
    padding: 18,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
  },

  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  quantityRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    marginTop: 14,
  },

  itemName: {
    color: colors.brand,
    fontSize: 17,
    fontWeight: fontWeights.bold,
  },

  category: {
    color: colors.subtle,
    marginTop: 3,
  },

  quantity: {
    fontSize: 26,
    fontWeight: fontWeights.bold,
    color: colors.success,
  },

  unitBadge: {
    backgroundColor: colors.brandSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },

  unitText: {
    color: '#486581',
    fontSize: 13,
    fontWeight: fontWeights.semibold,
  },

  lowQuantity: {
    color: colors.danger,
  },

  minimumRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },

  minimumLabel: {
    color: colors.subtle,
    fontSize: 12,
  },

  minimum: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: fontWeights.semibold,
  },

  cost: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 5,
  },

  warning: {
    backgroundColor: colors.dangerSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.xxl,
  },

  warningText: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: fontWeights.bold,
  },

  empty: {
    alignItems: 'center',
    marginTop: 70,
  },

  emptyIcon: {
    fontSize: 45,
  },

  emptyTitle: {
    color: colors.brand,
    fontSize: 20,
    fontWeight: fontWeights.bold,
    marginTop: 10,
  },

  emptyText: {
    color: colors.subtle,
    marginTop: spacing.xs,
  },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: spacing.xxl,
  },

  modal: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
  },

  formModal: {
    maxHeight: '88%',
  },

  formContent: {
    paddingBottom: 6,
  },

  modalTitle: {
    color: colors.brand,
    fontSize: 22,
    fontWeight: fontWeights.bold,
    marginBottom: 15,
  },

  currentStock: {
    color: colors.muted,
    marginBottom: 15,
  },

  modalLabel: {
    color: colors.text,
    fontWeight: fontWeights.semibold,
    marginBottom: 7,
  },

  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 11,
    padding: 14,
    marginBottom: 10,
  },

  formLabel: {
    color: colors.text,
    fontWeight: fontWeights.semibold,
    marginTop: spacing.sm,
    marginBottom: 7,
  },

  choiceGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: spacing.sm,
  },

  choiceButton: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: spacing.sm,
    borderRadius: 9,
  },

  choiceSelected: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },

  choiceText: {
    color: '#486581',
    fontSize: 12,
  },

  choiceTextSelected: {
    color: colors.surface,
    fontWeight: fontWeights.bold,
  },

  primaryButton: {
    backgroundColor: colors.brand,
    padding: 15,
    borderRadius: 11,
    alignItems: 'center',
    marginTop: 5,
  },

  entryButton: {
    backgroundColor: colors.success,
    padding: 15,
    borderRadius: 11,
    alignItems: 'center',
    marginTop: 5,
  },

  exitButton: {
    backgroundColor: colors.danger,
    padding: 15,
    borderRadius: 11,
    alignItems: 'center',
    marginTop: 10,
  },

  lossButton: {
    backgroundColor: colors.warning,
    padding: 15,
    borderRadius: 11,
    alignItems: 'center',
    marginTop: 10,
  },

  lossHistory: {
    marginTop: spacing.xl,
  },

  lossHistoryTitle: {
    color: colors.brand,
    fontSize: 18,
    fontWeight: fontWeights.bold,
    marginBottom: 10,
  },

  lossCard: {
    backgroundColor: colors.warningSoft,
    padding: 14,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  lossMaterial: {
    color: colors.text,
    fontWeight: fontWeights.semibold,
  },

  lossDetail: {
    color: colors.subtle,
    fontSize: 12,
    marginTop: spacing.xs,
  },

  lossQuantity: {
    color: colors.warning,
    fontWeight: fontWeights.bold,
  },

  primaryText: {
    color: colors.surface,
    fontWeight: fontWeights.bold,
  },

  cancel: {
    textAlign: 'center',
    color: colors.muted,
    marginTop: 18,
  },

  materialCard: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: 18, marginBottom: 14 },
  materialHeader: { flexDirection: 'row', alignItems: 'center' },
  materialIcon: { width: 46, height: 46, borderRadius: 13, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  materialInfo: { flex: 1, marginLeft: spacing.md },
  materialName: { color: colors.brand, fontSize: 18, fontWeight: fontWeights.bold },
  materialCategory: { color: colors.subtle, marginTop: 2 },
  lowBadge: { backgroundColor: colors.warningSoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.xxl },
  lowBadgeText: { color: colors.warning, fontSize: 12, fontWeight: fontWeights.bold },
  stockArea: { flexDirection: 'row', alignItems: 'baseline', marginTop: spacing.xl },
  stockNumber: { color: colors.success, fontSize: 34, fontWeight: fontWeights.bold },
  stockUnit: { color: colors.muted, fontSize: 16, marginLeft: 7 },
  availableText: { color: colors.subtle, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 9 },
  detailLabel: { color: colors.subtle },
  detailValue: { color: '#334E68', fontWeight: fontWeights.semibold },
  materialActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  buyButton: { flex: 1, backgroundColor: colors.brand, minHeight: 48, borderRadius: 11, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7 },
  buyButtonText: { color: colors.surface, fontWeight: fontWeights.bold },
  moreButton: { paddingHorizontal: spacing.xl, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 11, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5 },
  moreButtonText: { color: colors.brand, fontWeight: fontWeights.bold },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(16,42,67,0.35)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.surface, padding: 22, paddingBottom: 35, borderTopLeftRadius: 25, borderTopRightRadius: 25 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 25 },
  modalSubtitle: { color: colors.muted, marginTop: spacing.xs },
  inputLabel: { color: colors.text, fontWeight: fontWeights.semibold, marginBottom: 7, marginTop: 10 },
  calculationBox: { backgroundColor: colors.brandSoft, borderRadius: radii.md, padding: 14, marginTop: 15 },
  calculationLabel: { color: colors.muted, fontSize: 12 },
  calculationValue: { color: colors.brand, fontSize: 18, fontWeight: fontWeights.bold, marginTop: 3 },
  calculatorDetail: { color: '#334E68', marginTop: 7 },
  confirmButton: { backgroundColor: colors.brand, minHeight: 55, borderRadius: radii.md, marginTop: spacing.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  confirmButtonText: { color: colors.surface, fontSize: 16, fontWeight: fontWeights.bold },
  initialCostButton: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 6 },
  initialCostText: { color: colors.brand, fontWeight: fontWeights.bold },
  initialCostHint: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: spacing.md },
});
