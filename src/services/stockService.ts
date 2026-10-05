import { db } from '../database/database';
import { obterTokenAdministrador } from './adminAuthService';

function obterUrlApi() {
  const url = process.env.EXPO_PUBLIC_API_URL?.trim();
  return url ? url.replace(/\/$/, '') : null;
}

async function fetchRemoto<T>(path: string, init?: RequestInit): Promise<T | null> {
  const api = obterUrlApi();
  if (!api) return null;

  const token = await obterTokenAdministrador();
  if (!token) return null;

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
    console.warn('[stockService] fallback para SQLite:', error);
    return null;
  }
}

function normalizarItemRemoto(item: any): ItemStock {
  return {
    id: Number(item.id),
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
  id: number;
  nome: string;
  categoria: string;
  unidade: string;
  quantidade: number;
  stock_minimo: number;
  custo_medio: number;
  data_atualizacao: string;
};

export type PerdaStock = {
  id: number;
  stock_id: number;
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

  const existente = await db.getFirstAsync<{ id: number }>(
    `
      SELECT id
      FROM stock
      WHERE LOWER(TRIM(nome)) = LOWER(?)
      LIMIT 1
    `,
    nome.trim()
  );

  if (existente) {
    throw new Error('Já existe um material com esse nome no stock.');
  }

  const itemRemoto = await fetchRemoto<any>('/inventory/items', {
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

  if (itemRemoto) {
    return normalizarItemRemoto(itemRemoto);
  }

  await db.runAsync(
    `
      INSERT INTO stock (
        nome,
        categoria,
        unidade,
        quantidade,
        stock_minimo,
        data_atualizacao
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    ehPapelA4 ? 'Papel A4' : nome.trim(),
    ehPapelA4 ? 'Papel' : categoria.trim(),
    ehPapelA4 ? 'folhas' : unidade.trim(),
    quantidade,
    stockMinimo,
    new Date().toISOString()
  );
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
  return await db.getFirstAsync<ItemStock>(
    `
      SELECT *
      FROM stock
      WHERE LOWER(TRIM(nome)) = LOWER(?)
      LIMIT 1
    `,
    'Papel A4'
  );
}

export async function adicionarStock(
  id: number,
  quantidade: number
) {
  await db.runAsync(
    `
      UPDATE stock
      SET
        quantidade = quantidade + ?,
        data_atualizacao = ?
      WHERE id = ?
    `,
    quantidade,
    new Date().toISOString(),
    id
  );
}

export async function registrarCompraStock(
  stockId: number,
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

  const compraRemota = await fetchRemoto<any>(`/inventory/items/${stockId}/purchases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quantity: quantidade,
      amountCents: valorCentavos,
      externalReference: `purchase-${stockId}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    }),
  });

  if (compraRemota) {
    return normalizarItemRemoto(compraRemota);
  }

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const item = await transaction.getFirstAsync<ItemStock>(
      `
        SELECT *
        FROM stock
        WHERE id = ?
      `,
      stockId
    );

    if (!item) {
      throw new Error('Material não encontrado.');
    }

    if (
      item.unidade.trim().toLocaleLowerCase() === 'folhas' &&
      !Number.isSafeInteger(quantidade)
    ) {
      throw new Error(
        'A quantidade de folhas deve ser um número inteiro.'
      );
    }

    const quantidadeAtual = item.quantidade;
    const custoMedioAtual = item.custo_medio ?? 0;
    const valorStockAtual = quantidadeAtual * custoMedioAtual;
    const novaQuantidade = quantidadeAtual + quantidade;
    if (!Number.isFinite(novaQuantidade) || novaQuantidade <= 0) {
      throw new Error('A quantidade total do stock é inválida.');
    }
    const novoValorStock = valorStockAtual + valorCentavos / 100;
    const novoCustoMedio = novoValorStock / novaQuantidade;

    const agora = new Date().toISOString();
    const descricao = `Compra de ${item.nome}`;

    const atualizacao = await transaction.runAsync(
      `
        UPDATE stock
        SET quantidade = ?,
            custo_medio = ?,
            data_atualizacao = ?
        WHERE id = ?
      `,
      novaQuantidade,
      novoCustoMedio,
      agora,
      stockId
    );

    if (atualizacao.changes !== 1) {
      throw new Error('Não foi possível atualizar o stock.');
    }

    await transaction.runAsync(
      `
        INSERT INTO despesas (
          descricao,
          categoria,
          tipo,
          valor,
          data_criacao
        )
        VALUES (?, ?, ?, ?, ?)
      `,
      descricao,
      item.categoria,
      'COMPRA_STOCK',
      valorCentavos / 100,
      agora
    );

    await transaction.runAsync(
      `
        INSERT INTO compras_stock (
          stock_id,
          descricao,
          quantidade,
          valor_total,
          data_criacao
        )
        VALUES (?, ?, ?, ?, ?)
      `,
      stockId,
      descricao,
      quantidade,
      valorCentavos / 100,
      agora
    );

    await transaction.runAsync(
      `
        INSERT INTO movimentos_stock (
          stock_id,
          pedido_id,
          tipo,
          quantidade,
          motivo,
          data_criacao
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      stockId,
      null,
      'ENTRADA_COMPRA',
      quantidade,
      descricao,
      agora
    );
  });
}

export async function removerStock(
  id: number,
  quantidade: number
) {
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    throw new Error('Quantidade inválida.');
  }

  const remocaoRemota = await fetchRemoto<any>(`/inventory/items/${id}/adjustments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      direction: 'REMOVE',
      quantity: quantidade,
      reason: 'Remoção manual de stock',
      externalReference: `stock-remove-${id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    }),
  });

  if (remocaoRemota) {
    return normalizarItemRemoto(remocaoRemota);
  }

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const item = await transaction.getFirstAsync<ItemStock>(
      'SELECT * FROM stock WHERE id = ?',
      id
    );

    if (!item) {
      throw new Error('Material não encontrado.');
    }

    if (
      item.unidade.trim().toLocaleLowerCase() === 'folhas' &&
      !Number.isSafeInteger(quantidade)
    ) {
      throw new Error('A quantidade de folhas deve ser um número inteiro.');
    }

    const resultado = await transaction.runAsync(
      `UPDATE stock
       SET quantidade = quantidade - ?, data_atualizacao = ?
       WHERE id = ? AND quantidade >= ?`,
      quantidade,
      new Date().toISOString(),
      id,
      quantidade
    );

    if (resultado.changes !== 1) {
      throw new Error('Stock insuficiente.');
    }
  });
}

export async function ajustarQuantidadeStock(
  stockId: number,
  novaQuantidade: number,
  motivo: string
) {
  if (!Number.isFinite(novaQuantidade) || novaQuantidade < 0) {
    throw new Error('A quantidade não pode ser negativa.');
  }

  const ajusteRemoto = await fetchRemoto<any>(`/inventory/items/${stockId}/adjustments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      direction: 'SET',
      quantity: novaQuantidade,
      reason: motivo.trim() || 'Ajuste de inventário',
      externalReference: `stock-adjust-${stockId}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    }),
  });

  if (ajusteRemoto) {
    return normalizarItemRemoto(ajusteRemoto);
  }

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const item = await transaction.getFirstAsync<ItemStock>(
      'SELECT * FROM stock WHERE id = ?', stockId
    );
    if (!item) throw new Error('Material não encontrado.');
    if (item.unidade.toLowerCase() === 'folhas' && !Number.isSafeInteger(novaQuantidade)) {
      throw new Error('A quantidade de folhas deve ser um número inteiro.');
    }
    const diferenca = novaQuantidade - item.quantidade;
    if (diferenca === 0) throw new Error('A quantidade informada é igual ao stock atual.');
    const agora = new Date().toISOString();
    await transaction.runAsync(
      'UPDATE stock SET quantidade = ?, data_atualizacao = ? WHERE id = ?',
      novaQuantidade, agora, stockId
    );
    await transaction.runAsync(
      `INSERT INTO movimentos_stock (stock_id, pedido_id, tipo, quantidade, motivo, data_criacao)
       VALUES (?, ?, ?, ?, ?, ?)`,
      stockId, null, diferenca > 0 ? 'AJUSTE_POSITIVO' : 'AJUSTE_NEGATIVO',
      Math.abs(diferenca), motivo.trim() || 'Ajuste de inventário', agora
    );
  });
}

export async function definirCustoInicialStock(
  stockId: number,
  valorTotalStock: number
) {
  if (!Number.isFinite(valorTotalStock) || valorTotalStock <= 0) {
    throw new Error('Informe o valor real do stock existente.');
  }

  const custoRemoto = await fetchRemoto<any>(`/inventory/items/${stockId}/initial-cost`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amountCents: Math.round((valorTotalStock + Number.EPSILON) * 100),
      externalReference: `stock-initial-cost-${stockId}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    }),
  });

  if (custoRemoto) {
    return normalizarItemRemoto(custoRemoto);
  }

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const item = await transaction.getFirstAsync<ItemStock>(
      'SELECT * FROM stock WHERE id = ?',
      stockId
    );
    if (!item) throw new Error('Material não encontrado.');
    if (item.quantidade <= 0) throw new Error('Este material não possui stock disponível.');
    if ((item.custo_medio ?? 0) > 0) throw new Error('O custo deste material já foi definido.');

    const custoMedio = valorTotalStock / item.quantidade;
    await transaction.runAsync(
      `UPDATE stock SET custo_medio = ?, data_atualizacao = ? WHERE id = ?`,
      custoMedio,
      new Date().toISOString(),
      stockId
    );
  });
}

export async function registrarDesperdicio(
  stockId: number,
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

  const desperdicioRemoto = await fetchRemoto<any>(`/inventory/items/${stockId}/waste`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quantity: quantidade,
      reason: motivo.trim(),
      orderId: pedidoId ? String(pedidoId) : undefined,
      externalReference: `stock-waste-${stockId}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    }),
  });

  if (desperdicioRemoto) {
    return normalizarItemRemoto(desperdicioRemoto);
  }

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const item = await transaction.getFirstAsync<ItemStock>(
      `
        SELECT *
        FROM stock
        WHERE id = ?
      `,
      stockId
    );

    if (!item) {
      throw new Error('Material não encontrado.');
    }

    if (item.quantidade < quantidade) {
      throw new Error(
        `Stock insuficiente. Disponível: ${item.quantidade} ${item.unidade}.`
      );
    }

    const resultado = await transaction.runAsync(
      `
        UPDATE stock
        SET quantidade = quantidade - ?,
            data_atualizacao = ?
        WHERE id = ? AND quantidade >= ?
      `,
      quantidade,
      new Date().toISOString(),
      stockId,
      quantidade
    );

    if (resultado.changes !== 1) {
      throw new Error('Não foi possível atualizar o stock.');
    }

    await transaction.runAsync(
      `
        INSERT INTO movimentos_stock (
          stock_id,
          pedido_id,
          tipo,
          quantidade,
          motivo,
          data_criacao
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      stockId,
      pedidoId ?? null,
      'DESPERDICIO',
      quantidade,
      motivo.trim(),
      new Date().toISOString()
    );
  });
}

export async function registrarPerdaStock(
  id: number,
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
        id: Number(movimento.id),
        stock_id: Number(movimento.stockItemId ?? movimento.stock_id ?? 0),
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
