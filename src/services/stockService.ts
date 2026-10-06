import { db } from '../database/database';
import { obterTokenAdministrador } from './adminAuthService';

function obterUrlApi() {
  const url = process.env.EXPO_PUBLIC_API_URL?.trim();
  return url ? url.replace(/\/$/, '') : null;
}

async function fetchRemoto<T>(path: string, init?: RequestInit, obrigatorio = false): Promise<T | null> {
  const api = obterUrlApi();
  if (!api) {
    if (obrigatorio) throw new Error('Configure a URL do backend para alterar o stock.');
    return null;
  }

  const token = await obterTokenAdministrador();
  if (!token) throw new Error('Inicie sessão como administrador para consultar ou alterar o stock.');

  try {
    const resposta = await fetch(`${api}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    });

    if (!resposta.ok) {
      throw new Error(`HTTP ${resposta.status}`);
    }

    return (await resposta.json()) as T;
  } catch (error) {
    console.warn('[stockService] falha ao contactar o backend:', error);
    throw error instanceof Error ? error : new Error('Não foi possível contactar o backend.');
  }
}

async function exigirStockRemoto<T>(path: string, init: RequestInit): Promise<T> {
  const resultado = await fetchRemoto<T>(path, init, true);
  if (resultado === null) throw new Error('O backend não devolveu o stock atualizado.');
  return resultado;
}

function normalizarItemRemoto(item: any): ItemStock {
  return {
    id: item.id,
    nome: item.name ?? item.nome ?? '',
    categoria: item.category ?? item.categoria ?? '',
    unidade: item.unit ?? item.unidade ?? '',
    quantidade: Number(item.quantity ?? item.quantidade ?? 0),
    stock_minimo: Number(item.minimumQuantity ?? item.stock_minimo ?? 0),
    custo_medio: Number(item.averageUnitCost ?? item.custo_medio ?? 0),
    data_atualizacao: item.updatedAt ?? item.data_atualizacao ?? new Date().toISOString(),
  };
}

export type ItemStock = {
  id: number | string;
  nome: string;
  categoria: string;
  unidade: string;
  quantidade: number;
  stock_minimo: number;
  custo_medio: number;
  data_atualizacao: string;
};

export type PerdaStock = {
  id: number | string;
  stock_id: number | string;
  material: string;
  quantidade: number;
  unidade: string;
  motivo: string;
  data_criacao: string;
};

export async function criarItemStock(
  nome: string,
  categoria: string,
  unidade: string,
  quantidade: number,
  stockMinimo: number
) {
  const nomeNormalizado = nome.trim().toLocaleLowerCase();

  if (!nome.trim() || !categoria.trim() || !unidade.trim()) {
    throw new Error('Nome, categoria e unidade são obrigatórios.');
  }

  if (
    !Number.isFinite(quantidade) ||
    quantidade < 0 ||
    !Number.isFinite(stockMinimo) ||
    stockMinimo < 0
  ) {
    throw new Error('As quantidades de stock devem ser válidas.');
  }

  if (nomeNormalizado === 'papel' || nomeNormalizado === 'resma') {
    throw new Error(
      'Use o cadastro único “Papel A4” para controlar folhas de papel.'
    );
  }

  const ehPapelA4 = nomeNormalizado === 'papel a4';
  if (
    (ehPapelA4 || unidade.trim().toLocaleLowerCase() === 'folhas') &&
    (!Number.isSafeInteger(quantidade) ||
      !Number.isSafeInteger(stockMinimo))
  ) {
    throw new Error('As quantidades de folhas devem ser números inteiros.');
  }

  const itemRemoto = await exigirStockRemoto<any>('/inventory/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: ehPapelA4 ? 'Papel A4' : nome.trim(),
      category: ehPapelA4 ? 'Papel' : categoria.trim(),
      unit: ehPapelA4 ? 'folhas' : unidade.trim(),
      quantity: quantidade,
      minimumQuantity: stockMinimo,
      externalReference: `stock-create-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    }),
  });
  return normalizarItemRemoto(itemRemoto);
}

export async function listarStock() {
  const itensRemotos = await fetchRemoto<any[]>('/inventory/items');
  if (itensRemotos) {
    return itensRemotos.map(normalizarItemRemoto);
  }

  return await db.getAllAsync<ItemStock>(
    `
      SELECT *
      FROM stock
      ORDER BY nome ASC
    `
  );
}

export async function obterPapelA4() {
  const itens = await listarStock();
  return itens.find((item) => item.nome.trim().toLocaleLowerCase() === 'papel a4') ?? null;
}

export async function adicionarStock(
  id: number | string,
  quantidade: number
) {
  if (!Number.isFinite(quantidade) || quantidade <= 0) throw new Error('Quantidade inválida.');
  const item = await exigirStockRemoto<any>(`/inventory/items/${id}/adjustments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      direction: 'ADD',
      quantity: quantidade,
      reason: 'Adição manual de stock',
      externalReference: `stock-add-${id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    }),
  });
  return normalizarItemRemoto(item);
}

export async function registrarCompraStock(
  stockId: number | string,
  quantidade: number,
  valorTotal: number
) {
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    throw new Error(
      'A quantidade comprada deve ser maior que zero.'
    );
  }

  if (!Number.isFinite(valorTotal) || valorTotal <= 0) {
    throw new Error(
      'O valor da compra deve ser maior que zero.'
    );
  }

  if (!Number.isSafeInteger(Math.round(quantidade * 100))) {
    throw new Error('A quantidade comprada é demasiado grande.');
  }

  const valorCentavos = Math.round(
    (valorTotal + Number.EPSILON) * 100
  );

  if (!Number.isSafeInteger(valorCentavos) || valorCentavos <= 0) {
    throw new Error('O valor da compra é inválido.');
  }

  const compraRemota = await exigirStockRemoto<any>(`/inventory/items/${stockId}/purchases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quantity: quantidade,
      amountCents: valorCentavos,
      externalReference: `purchase-${stockId}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    }),
  });
  return normalizarItemRemoto(compraRemota);
}

export async function removerStock(
  id: number | string,
  quantidade: number
) {
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    throw new Error('Quantidade inválida.');
  }

  const remocaoRemota = await exigirStockRemoto<any>(`/inventory/items/${id}/adjustments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      direction: 'REMOVE',
      quantity: quantidade,
      reason: 'Remoção manual de stock',
      externalReference: `stock-remove-${id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    }),
  });
  return normalizarItemRemoto(remocaoRemota);
}

export async function ajustarQuantidadeStock(
  stockId: number | string,
  novaQuantidade: number,
  motivo: string
) {
  if (!Number.isFinite(novaQuantidade) || novaQuantidade < 0) {
    throw new Error('A quantidade não pode ser negativa.');
  }

  const ajusteRemoto = await exigirStockRemoto<any>(`/inventory/items/${stockId}/adjustments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      direction: 'SET',
      quantity: novaQuantidade,
      reason: motivo.trim() || 'Ajuste de inventário',
      externalReference: `stock-adjust-${stockId}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    }),
  });
  return normalizarItemRemoto(ajusteRemoto);
}

export async function definirCustoInicialStock(
  stockId: number | string,
  valorTotalStock: number
) {
  if (!Number.isFinite(valorTotalStock) || valorTotalStock <= 0) {
    throw new Error('Informe o valor real do stock existente.');
  }

  const custoRemoto = await exigirStockRemoto<any>(`/inventory/items/${stockId}/initial-cost`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amountCents: Math.round((valorTotalStock + Number.EPSILON) * 100),
      externalReference: `stock-initial-cost-${stockId}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    }),
  });
  return normalizarItemRemoto(custoRemoto);
}

export async function registrarDesperdicio(
  stockId: number | string,
  quantidade: number,
  motivo: string,
  pedidoId?: number
) {
  if (!Number.isSafeInteger(quantidade) || quantidade <= 0) {
    throw new Error(
      'A quantidade deve ser um número inteiro maior que zero.'
    );
  }

  if (!motivo.trim()) {
    throw new Error('Informe o motivo do desperdício.');
  }

  let pedidoRemotoId: string | undefined;
  if (pedidoId) {
    const pedido = await db.getFirstAsync<{ remoto_id: string | null }>(
      'SELECT remoto_id FROM pedidos WHERE id = ?',
      pedidoId
    );
    if (!pedido?.remoto_id) {
      throw new Error('Sincronize o pedido antes de associar a perda de stock.');
    }
    pedidoRemotoId = pedido.remoto_id;
  }

  const desperdicioRemoto = await exigirStockRemoto<any>(`/inventory/items/${stockId}/waste`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quantity: quantidade,
      reason: motivo.trim(),
      orderId: pedidoRemotoId,
      externalReference: `stock-waste-${stockId}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    }),
  });
  return normalizarItemRemoto(desperdicioRemoto);
}

export async function registrarPerdaStock(
  id: number | string,
  quantidade: number
) {
  await registrarDesperdicio(
    id,
    quantidade,
    'Perda/Desperdício'
  );
}

export async function listarPerdasStock() {
  const movimentosRemotos = await fetchRemoto<any[]>('/inventory/movements');
  if (movimentosRemotos) {
    return movimentosRemotos
      .filter((movimento) => movimento.type === 'DESPERDICIO')
      .map((movimento) => ({
        id: movimento.id,
        stock_id: movimento.stockItemId ?? movimento.stock_id ?? 0,
        material: movimento.stockItem?.name ?? 'Material',
        quantidade: Number(movimento.quantity ?? 0),
        unidade: movimento.stockItem?.unit ?? '',
        motivo: movimento.reason ?? 'Desperdício',
        data_criacao: movimento.createdAt ?? new Date().toISOString(),
      }));
  }

  return await db.getAllAsync<PerdaStock>(
    `
      SELECT id, stock_id, material, quantidade, unidade, motivo, data_criacao
      FROM perdas_stock
      UNION ALL
      SELECT
        -movimentos_stock.id AS id,
        movimentos_stock.stock_id,
        COALESCE(stock.nome, 'Material') AS material,
        movimentos_stock.quantidade,
        COALESCE(stock.unidade, '') AS unidade,
        movimentos_stock.motivo,
        movimentos_stock.data_criacao
      FROM movimentos_stock
      LEFT JOIN stock
        ON stock.id = movimentos_stock.stock_id
      WHERE movimentos_stock.tipo = 'DESPERDICIO'
      ORDER BY data_criacao DESC, id DESC
    `
  );
}
