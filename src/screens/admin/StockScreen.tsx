import { formatarDinheiro } from '../../utils/formatters';
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
          <View style={styles.materialIcon}><Ionicons name="cube-outline" size={24} color="#102A43" /></View>
          <View style={styles.materialInfo}><Text style={styles.materialName}>{item.nome}</Text><Text style={styles.materialCategory}>{item.categoria}</Text></View>
          {stockBaixo && <View style={styles.lowBadge}><Text style={styles.lowBadgeText}>Repor</Text></View>}
        </View>
        <View style={styles.stockArea}><Text style={styles.stockNumber}>{item.quantidade.toLocaleString()}</Text><Text style={styles.stockUnit}>{item.unidade}</Text></View>
        <Text style={styles.availableText}>disponíveis</Text>
        <View style={styles.divider} />
        <View style={styles.detailRow}><Text style={styles.detailLabel}>Repor quando chegar a</Text><Text style={styles.detailValue}>{item.stock_minimo} {item.unidade}</Text></View>
        <View style={styles.detailRow}><Text style={styles.detailLabel}>Custo médio</Text><Text style={styles.detailValue}>{item.custo_medio > 0 ? `${item.custo_medio.toFixed(4)} MT/${item.unidade}` : 'Ainda não definido'}</Text></View>
        {item.custo_medio <= 0 && <Pressable style={styles.initialCostButton} onPress={() => { setItemSelecionado(item); setValorCustoInicial(''); setModalCustoInicial(true); }}><Ionicons name="calculator-outline" size={18} color="#102A43" /><Text style={styles.initialCostText}>Definir custo inicial</Text></Pressable>}
        <View style={styles.materialActions}>
          <Pressable style={styles.buyButton} onPress={() => { setItemSelecionado(item); setQuantidadeCompra(''); setValorCompra(''); setModalCompra(true); }}><Ionicons name="cart-outline" size={19} color="#FFFFFF" /><Text style={styles.buyButtonText}>Comprar</Text></Pressable>
          <Pressable style={styles.moreButton} onPress={() => { setItemSelecionado(item); showAppAlert(item.nome, 'Escolha uma opção', [{ text: 'Registar desperdício', onPress: () => { setQuantidadeDesperdicio(''); setMotivoDesperdicio(''); setModalDesperdicio(true); } }, { text: 'Corrigir quantidade', onPress: () => { setQuantidadeReal(String(item.quantidade)); setModalAjuste(true); } }, { text: 'Ver histórico', onPress: () => showAppAlert('Histórico', 'Os movimentos deste material são guardados automaticamente.') }, { text: 'Cancelar', style: 'cancel' }]); }}><Ionicons name="ellipsis-horizontal" size={20} color="#102A43" /><Text style={styles.moreButtonText}>Mais</Text></Pressable>
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
            <View style={styles.modalHeader}><View><Text style={styles.modalTitle}>Comprar material</Text><Text style={styles.modalSubtitle}>{itemSelecionado?.nome}</Text></View><Pressable onPress={() => setModalCompra(false)}><Ionicons name="close" size={28} color="#102A43" /></Pressable></View>
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
            <View style={styles.modalHeader}><View><Text style={styles.modalTitle}>Definir custo inicial</Text><Text style={styles.modalSubtitle}>{itemSelecionado?.nome} · {itemSelecionado?.quantidade} {itemSelecionado?.unidade}</Text></View><Pressable onPress={() => setModalCustoInicial(false)}><Ionicons name="close" size={28} color="#102A43" /></Pressable></View>
            <Text style={styles.inputLabel}>Valor total do stock existente</Text>
            <TextInput style={styles.input} keyboardType="decimal-pad" placeholder="Ex.: 323,40 MT" value={valorCustoInicial} onChangeText={setValorCustoInicial} />
            <Text style={styles.initialCostHint}>Este valor apenas define o custo médio. Não adiciona quantidade, despesa ou movimento no Caixa.</Text>
            <Pressable style={styles.confirmButton} onPress={confirmarCustoInicial}><Ionicons name="checkmark-circle-outline" size={21} color="#FFFFFF" /><Text style={styles.confirmButtonText}>Guardar custo inicial</Text></Pressable>
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
    backgroundColor: '#F5F7FA',
  },

  content: {
    padding: 20,
    paddingBottom: 40,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#102A43',
  },

  subtitle: {
    color: '#829AB1',
    marginTop: 3,
  },

  addButton: {
    backgroundColor: '#102A43',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
  },

  addButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },

  instruction: {
    color: '#627D98',
    marginVertical: 20,
  },

  card: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 16,
    marginBottom: 12,
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
    color: '#102A43',
    fontSize: 17,
    fontWeight: 'bold',
  },

  category: {
    color: '#829AB1',
    marginTop: 3,
  },

  quantity: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#147D64',
  },

  unitBadge: {
    backgroundColor: '#EAF0F6',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },

  unitText: {
    color: '#486581',
    fontSize: 13,
    fontWeight: '600',
  },

  lowQuantity: {
    color: '#C53030',
  },

  minimumRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },

  minimumLabel: {
    color: '#829AB1',
    fontSize: 12,
  },

  minimum: {
    color: '#627D98',
    fontSize: 12,
    fontWeight: '600',
  },

  cost: {
    color: '#627D98',
    fontSize: 12,
    marginTop: 5,
  },

  warning: {
    backgroundColor: '#FFF5F5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },

  warningText: {
    color: '#C53030',
    fontSize: 11,
    fontWeight: 'bold',
  },

  empty: {
    alignItems: 'center',
    marginTop: 70,
  },

  emptyIcon: {
    fontSize: 45,
  },

  emptyTitle: {
    color: '#102A43',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 10,
  },

  emptyText: {
    color: '#829AB1',
    marginTop: 4,
  },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },

  modal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
  },

  formModal: {
    maxHeight: '88%',
  },

  formContent: {
    paddingBottom: 6,
  },

  modalTitle: {
    color: '#102A43',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 15,
  },

  currentStock: {
    color: '#627D98',
    marginBottom: 15,
  },

  modalLabel: {
    color: '#243B53',
    fontWeight: '600',
    marginBottom: 7,
  },

  input: {
    borderWidth: 1,
    borderColor: '#D9E2EC',
    borderRadius: 11,
    padding: 14,
    marginBottom: 10,
  },

  formLabel: {
    color: '#243B53',
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 7,
  },

  choiceGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 8,
  },

  choiceButton: {
    borderWidth: 1,
    borderColor: '#BCCCDC',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 9,
  },

  choiceSelected: {
    backgroundColor: '#102A43',
    borderColor: '#102A43',
  },

  choiceText: {
    color: '#486581',
    fontSize: 12,
  },

  choiceTextSelected: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },

  primaryButton: {
    backgroundColor: '#102A43',
    padding: 15,
    borderRadius: 11,
    alignItems: 'center',
    marginTop: 5,
  },

  entryButton: {
    backgroundColor: '#147D64',
    padding: 15,
    borderRadius: 11,
    alignItems: 'center',
    marginTop: 5,
  },

  exitButton: {
    backgroundColor: '#C53030',
    padding: 15,
    borderRadius: 11,
    alignItems: 'center',
    marginTop: 10,
  },

  lossButton: {
    backgroundColor: '#B7791F',
    padding: 15,
    borderRadius: 11,
    alignItems: 'center',
    marginTop: 10,
  },

  lossHistory: {
    marginTop: 20,
  },

  lossHistoryTitle: {
    color: '#102A43',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },

  lossCard: {
    backgroundColor: '#FFF9EB',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  lossMaterial: {
    color: '#243B53',
    fontWeight: '600',
  },

  lossDetail: {
    color: '#829AB1',
    fontSize: 12,
    marginTop: 4,
  },

  lossQuantity: {
    color: '#B7791F',
    fontWeight: 'bold',
  },

  primaryText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },

  cancel: {
    textAlign: 'center',
    color: '#627D98',
    marginTop: 18,
  },

  materialCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, marginBottom: 14 },
  materialHeader: { flexDirection: 'row', alignItems: 'center' },
  materialIcon: { width: 46, height: 46, borderRadius: 13, backgroundColor: '#F0F4F8', alignItems: 'center', justifyContent: 'center' },
  materialInfo: { flex: 1, marginLeft: 12 },
  materialName: { color: '#102A43', fontSize: 18, fontWeight: 'bold' },
  materialCategory: { color: '#829AB1', marginTop: 2 },
  lowBadge: { backgroundColor: '#FFF3C4', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  lowBadgeText: { color: '#B7791F', fontSize: 12, fontWeight: 'bold' },
  stockArea: { flexDirection: 'row', alignItems: 'baseline', marginTop: 20 },
  stockNumber: { color: '#147D64', fontSize: 34, fontWeight: 'bold' },
  stockUnit: { color: '#627D98', fontSize: 16, marginLeft: 7 },
  availableText: { color: '#829AB1', marginTop: 2 },
  divider: { height: 1, backgroundColor: '#E6EAF0', marginVertical: 16 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 9 },
  detailLabel: { color: '#829AB1' },
  detailValue: { color: '#334E68', fontWeight: '600' },
  materialActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  buyButton: { flex: 1, backgroundColor: '#102A43', minHeight: 48, borderRadius: 11, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7 },
  buyButtonText: { color: '#FFFFFF', fontWeight: 'bold' },
  moreButton: { paddingHorizontal: 20, minHeight: 48, borderWidth: 1, borderColor: '#BCCCDC', borderRadius: 11, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5 },
  moreButtonText: { color: '#102A43', fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(16,42,67,0.35)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFFFFF', padding: 22, paddingBottom: 35, borderTopLeftRadius: 25, borderTopRightRadius: 25 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 25 },
  modalSubtitle: { color: '#627D98', marginTop: 4 },
  inputLabel: { color: '#243B53', fontWeight: '600', marginBottom: 7, marginTop: 10 },
  calculationBox: { backgroundColor: '#F0F4F8', borderRadius: 12, padding: 14, marginTop: 15 },
  calculationLabel: { color: '#627D98', fontSize: 12 },
  calculationValue: { color: '#102A43', fontSize: 18, fontWeight: 'bold', marginTop: 3 },
  confirmButton: { backgroundColor: '#102A43', minHeight: 55, borderRadius: 12, marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  confirmButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  initialCostButton: { minHeight: 44, borderWidth: 1, borderColor: '#BCCCDC', borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 6 },
  initialCostText: { color: '#102A43', fontWeight: 'bold' },
  initialCostHint: { color: '#627D98', fontSize: 12, lineHeight: 18, marginTop: 12 },
});

