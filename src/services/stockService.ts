import { db } from '../database/database';

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

  const ehPapelA4 = nomeNormalizado === 'papel a4';

  if (
    (ehPapelA4 || unidade.trim().toLocaleLowerCase() === 'folhas') &&
    (!Number.isSafeInteger(quantidade) ||
      !Number.isSafeInteger(stockMinimo))
  ) {
    throw new Error('As quantidades de folhas devem ser números inteiros.');
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
