import { db } from '../database/database';
import { calcularImpressao } from '../utils/calcularImpressao';
import { obterCustoTintaPorPagina } from '../utils/custosImpressao';
import { sincronizarPedidoLocal } from './sincronizacaoPedidoService';

export type NovoPedido = {
  cliente: string;
  contacto: string;
  servico: string;
  precoUnitario: number;
  quantidade: number;
  total: number;
  numeroPaginas: number;
  numeroCopias: number;
  frenteVerso: boolean;
  folhasNecessarias: number;
  documentoNome?: string;
  documentoUri?: string;
  tipoEncadernacao?: string;
  precoEncadernacao?: number;
};

export type Pedido = {
  id: number;
  numero: string;
  cliente: string;
  contacto: string;
  servico: string;
  preco_unitario: number;
  quantidade: number;
  numero_paginas: number;
  numero_copias: number;
  frente_verso: number;
  folhas_necessarias: number;
  stock_descontado: number;
  custo_papel: number;
  custo_papel_unitario: number;
  custo_tinta: number;
  custo_tinta_por_pagina: number;
  total: number;
  documento_nome: string | null;
  documento_uri: string | null;
  estado: string;
  data_criacao: string;
  valor_pago: number;
  tipo_encadernacao: string;
  preco_encadernacao: number;
  sync_chave: string | null;
  remoto_id: string | null;
  sincronizacao_estado: 'PENDENTE' | 'SINCRONIZADO';
  sincronizacao_erro: string | null;
};

export type ResumoPedido = {
  totalPaginasImpressas: number;
  folhasUtilizadas: number;
  valorPedido: number;
  valorRecebido: number;
  valorPendente: number;
  custoPapel: number;
  custoTinta: number;
  custosDiretos: number;
  margemAntesOutrosCustos: number;
};

export function calcularResumoPedido(pedido: Pedido): ResumoPedido {
  const totalPaginasImpressas =
    pedido.numero_paginas * pedido.numero_copias;
  const valorPedido = pedido.total ?? 0;
  const valorRecebido = pedido.valor_pago ?? 0;
  const valorPendente = Math.max(valorPedido - valorRecebido, 0);
  const custoPapel = pedido.custo_papel ?? 0;
  const custoTinta = pedido.custo_tinta ?? 0;
  const custosDiretos = custoPapel + custoTinta;

  return {
    totalPaginasImpressas,
    folhasUtilizadas: pedido.folhas_necessarias ?? 0,
    valorPedido,
    valorRecebido,
    valorPendente,
    custoPapel,
    custoTinta,
    custosDiretos,
    margemAntesOutrosCustos: valorPedido - custosDiretos,
  };
}

const proximosEstados: Record<string, string> = {
  'Pedido recebido': 'Em preparação',
  'Em preparação': 'Em impressão',
  'Em impressão': 'Pronto para levantamento',
  'Pronto para levantamento': 'Entregue',
};

export async function criarPedido(pedido: NovoPedido) {
  const calculo = calcularImpressao(
    pedido.numeroPaginas,
    pedido.numeroCopias,
    pedido.frenteVerso
  );
  const totalServicoCentavos = Math.round(
    (pedido.precoUnitario *
      calculo.totalPaginasImpressas +
      Number.EPSILON) *
      100
  );
  const precoEncadernacao = Number(pedido.precoEncadernacao ?? 0);
  const precoEncadernacaoCentavos = Math.round(
    (precoEncadernacao + Number.EPSILON) * 100
  );
  const totalCentavosCalculado =
    totalServicoCentavos + precoEncadernacaoCentavos;
  const totalCentavosInformado = Math.round(
    (pedido.total + Number.EPSILON) * 100
  );
  const folhasNecessariasCalculadas =
    pedido.servico === 'Digitalização' ? 0 : calculo.totalFolhas;

  if (
    !Number.isFinite(pedido.precoUnitario) ||
    pedido.precoUnitario <= 0 ||
    !Number.isFinite(precoEncadernacao) ||
    precoEncadernacao < 0 ||
    pedido.quantidade !== pedido.numeroCopias ||
    pedido.folhasNecessarias !== folhasNecessariasCalculadas ||
    !Number.isSafeInteger(totalCentavosCalculado) ||
    totalCentavosInformado !== totalCentavosCalculado
  ) {
    throw new Error('Os dados do pedido são inválidos.');
  }

  // Primeiro criamos o pedido para obter o ID automático.
  const resultado = await db.runAsync(
    `
      INSERT INTO pedidos (
        numero,
        cliente,
        contacto,
        servico,
        preco_unitario,
        quantidade,
        total,
        documento_nome,
        documento_uri,
        estado,
        data_criacao,
        numero_paginas,
        numero_copias,
        frente_verso,
        folhas_necessarias,
        tipo_encadernacao,
        preco_encadernacao
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    null,
    pedido.cliente,
    pedido.contacto,
    pedido.servico,
    pedido.precoUnitario,
    pedido.quantidade,
    totalCentavosCalculado / 100,
    pedido.documentoNome ?? null,
    pedido.documentoUri ?? null,
    'Pedido recebido',
    new Date().toISOString(),
    pedido.numeroPaginas,
    pedido.numeroCopias,
    pedido.frenteVerso ? 1 : 0,
    calculo.totalFolhas,
    pedido.tipoEncadernacao ?? 'SEM_ENCADERNACAO',
    precoEncadernacao
  );

  const id = resultado.lastInsertRowId;

  const numero = `EJC-${String(id).padStart(4, '0')}`;

  await db.runAsync(
    `
      UPDATE pedidos
      SET numero = ?
      WHERE id = ?
    `,
    numero,
    id
  );

  const pedidoCriado = await db.getFirstAsync<Pedido>(
    'SELECT * FROM pedidos WHERE id = ?',
    id
  );
  if (!pedidoCriado) {
    throw new Error('Não foi possível obter o pedido criado.');
  }
  const syncChave = `pedido-${pedidoCriado.id}-${Date.now()}`;
  await db.runAsync(
    'UPDATE pedidos SET sync_chave = ? WHERE id = ?',
    syncChave,
    pedidoCriado.id
  );
  pedidoCriado.sync_chave = syncChave;
  void sincronizarPedidoLocal(pedidoCriado).catch(() => undefined);
  return pedidoCriado;
}

export async function listarPedidos() {
  return await db.getAllAsync<Pedido>(
    `
      SELECT *
      FROM pedidos
      ORDER BY id DESC
    `
  );
}

export async function atualizarEstadoPedido(
  id: number,
  novoEstado: string
) {
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const pedido = await transaction.getFirstAsync<Pedido>(
      'SELECT * FROM pedidos WHERE id = ?',
      id
    );

    if (!pedido) {
      throw new Error('Pedido não encontrado.');
    }

    if (novoEstado === 'Em preparação') {
      const sinalNecessario = pedido.total * 0.5;
      const valorConfirmado = pedido.valor_pago ?? 0;
      if (valorConfirmado < sinalNecessario) {
        throw new Error(
          `Ainda faltam ${(sinalNecessario - valorConfirmado).toFixed(2)} MT para completar o sinal de 50%.`
        );
      }
    }

    if (novoEstado === 'Entregue') {
      const falta = Math.max(pedido.total - (pedido.valor_pago ?? 0), 0);
      if (falta > 0.001) {
        throw new Error(
          `Ainda faltam ${falta.toFixed(2)} MT. O pedido não pode ser entregue antes do pagamento completo.`
        );
      }
    }

    if (proximosEstados[pedido.estado] !== novoEstado) {
      throw new Error(
        `Não é possível alterar um pedido de "${pedido.estado}" para "${novoEstado}".`
      );
    }

    if (novoEstado === 'Em impressão') {
      throw new Error(
        'Inicie a impressão para reservar o papel no stock.'
      );
    }

    await transaction.runAsync(
      "UPDATE pedidos SET estado = ?, sincronizacao_estado = 'PENDENTE' WHERE id = ?",
      novoEstado,
      id
    );
  });
}

export async function verificarSinalPedido(pedidoId: number) {
  const pedido = await db.getFirstAsync<{
    id: number;
    total: number;
    valor_pago: number;
  }>(
    `SELECT id, total, valor_pago FROM pedidos WHERE id = ?`,
    pedidoId
  );

  if (!pedido) throw new Error('Pedido não encontrado.');

  const sinalNecessario = pedido.total * 0.5;
  const valorConfirmado = pedido.valor_pago ?? 0;
  const faltaParaSinal = Math.max(sinalNecessario - valorConfirmado, 0);

  return {
    total: pedido.total,
    sinalNecessario,
    valorConfirmado,
    faltaParaSinal,
    sinalConfirmado: valorConfirmado >= sinalNecessario,
  };
}

export async function iniciarImpressao(
  pedidoId: number
) {
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const pedido = await transaction.getFirstAsync<Pedido>(
      `
        SELECT *
        FROM pedidos
        WHERE id = ?
      `,
      pedidoId
    );

  if (!pedido) {
    throw new Error('Pedido não encontrado.');
  }

  const usaPapel = ['Impressão P/B', 'Fotocópia P/B', 'Colorida simples', 'Colorida com imagens'].includes(pedido.servico);
  if (!usaPapel) {
    await db.runAsync(
      "UPDATE pedidos SET estado = ?, sincronizacao_estado = 'PENDENTE' WHERE id = ?",
      'Em impressão',
      pedidoId
    );
    return;
  }

    if (pedido.estado !== 'Em preparação') {
      throw new Error(
        'A impressão só pode começar quando o pedido estiver em preparação.'
      );
    }

    if (pedido.stock_descontado === 1) {
      throw new Error('O papel deste pedido já foi reservado.');
    }

    if (
      !Number.isInteger(pedido.folhas_necessarias) ||
      pedido.folhas_necessarias <= 0
    ) {
      throw new Error(
        'Este pedido não possui um cálculo válido de folhas.'
      );
    }

    const papel = await transaction.getFirstAsync<{
      id: number;
      quantidade: number;
      custo_medio: number;
    }>(
      `
        SELECT id, quantidade, custo_medio
        FROM stock
        WHERE LOWER(nome) = LOWER(?)
        LIMIT 1
      `,
      'Papel A4'
    );

    if (!papel) {
      throw new Error(
        'Papel A4 não está cadastrado no stock.'
      );
    }

    if (papel.quantidade < pedido.folhas_necessarias) {
      throw new Error(
        `Stock insuficiente. Necessário: ${pedido.folhas_necessarias} folhas. Disponível: ${papel.quantidade} folhas.`
      );
    }

    const custoUnitarioPapel = papel.custo_medio ?? 0;
    const custoTotalPapel =
      pedido.folhas_necessarias * custoUnitarioPapel;
    const totalPaginasImpressas =
      pedido.numero_paginas * pedido.numero_copias;
    const custoTintaPorPagina = obterCustoTintaPorPagina(
      pedido.servico
    );
    const custoTotalTinta =
      totalPaginasImpressas * custoTintaPorPagina;

    const resultado = await transaction.runAsync(
      `
        UPDATE stock
        SET quantidade = quantidade - ?,
            data_atualizacao = ?
        WHERE id = ? AND quantidade >= ?
      `,
      pedido.folhas_necessarias,
      new Date().toISOString(),
      papel.id,
      pedido.folhas_necessarias
    );

    if (resultado.changes !== 1) {
      throw new Error(
        'Não foi possível reservar o papel. Verifique o stock.'
      );
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
      papel.id,
      pedido.id,
      'CONSUMO_PEDIDO',
      pedido.folhas_necessarias,
      `Impressão do pedido ${pedido.numero}`,
      new Date().toISOString()
    );

    await transaction.runAsync(
      `
        UPDATE pedidos
        SET estado = ?,
          sincronizacao_estado = 'PENDENTE',
            stock_descontado = 1,
            custo_papel_unitario = ?,
            custo_papel = ?,
            custo_tinta_por_pagina = ?,
            custo_tinta = ?
        WHERE id = ?
      `,
      'Em impressão',
      custoUnitarioPapel,
      custoTotalPapel,
      custoTintaPorPagina,
      custoTotalTinta,
      pedidoId
    );
  });
}

export type EstatisticasPedidos = {
  totalPedidos: number;
  pedidosPendentes: number;
  pedidosEntregues: number;
  emProducao: number;
  valorTotal: number;
  cancelados: number;
};

export async function obterEstatisticasPedidos(): Promise<EstatisticasPedidos> {
  const resultado = await db.getFirstAsync<{
    totalPedidos: number;
    pedidosPendentes: number;
    pedidosEntregues: number;
    emProducao: number;
    valorTotalCentavos: number;
    cancelados: number;
  }>(`
    SELECT
      COUNT(*) AS totalPedidos,

      SUM(
        CASE
          WHEN estado NOT IN ('Entregue', 'Cancelado') THEN 1
          ELSE 0
        END
      ) AS pedidosPendentes,

      SUM(
        CASE
          WHEN estado = 'Entregue' THEN 1
          ELSE 0
        END
      ) AS pedidosEntregues,

      SUM(
        CASE
          WHEN estado = 'Em preparação'
            OR estado = 'Em impressão'
          THEN 1
          ELSE 0
        END
      ) AS emProducao,

      COALESCE(SUM(ROUND(total * 100)), 0) AS valorTotalCentavos
      ,SUM(CASE WHEN estado = 'Cancelado' THEN 1 ELSE 0 END) AS cancelados

    FROM pedidos
  `);

  return {
    totalPedidos: resultado?.totalPedidos ?? 0,
    pedidosPendentes: resultado?.pedidosPendentes ?? 0,
    pedidosEntregues: resultado?.pedidosEntregues ?? 0,
    emProducao: resultado?.emProducao ?? 0,
    cancelados: resultado?.cancelados ?? 0,
    valorTotal:
      Math.round(resultado?.valorTotalCentavos ?? 0) / 100,
  };
}

export async function registrarPagamento(
  pedidoId: number,
  valor: number
) {
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new Error('Valor inválido.');
  }

  const valorCentavos = Math.round(
    (valor + Number.EPSILON) * 100
  );
  if (!Number.isSafeInteger(valorCentavos) || valorCentavos <= 0) {
    throw new Error('Valor inválido.');
  }

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const pedido = await transaction.getFirstAsync<Pedido>(
      'SELECT * FROM pedidos WHERE id = ?',
      pedidoId
    );

    if (!pedido) {
      throw new Error('Pedido não encontrado.');
    }

    const valorPagoCentavos = Math.round(
      (pedido.valor_pago + Number.EPSILON) * 100
    );
    const totalCentavos = Math.round(
      (pedido.total + Number.EPSILON) * 100
    );
    const novoValorPagoCentavos = valorPagoCentavos + valorCentavos;

    if (novoValorPagoCentavos > totalCentavos) {
      throw new Error(
        'O pagamento não pode ultrapassar o total do pedido.'
      );
    }

    await transaction.runAsync(
      'UPDATE pedidos SET valor_pago = ? WHERE id = ?',
      novoValorPagoCentavos / 100,
      pedidoId
    );
  });
}

export type ResumoFinanceiro = {
  valorPedidos: number;
  valorRecebido: number;
  valorPendente: number;
};

export async function obterResumoFinanceiro(): Promise<ResumoFinanceiro> {
  const resultado = await db.getFirstAsync<{
    valorPedidosCentavos: number;
    valorRecebidoCentavos: number;
  }>(`
    SELECT
      COALESCE(SUM(CASE WHEN estado != 'Cancelado' THEN ROUND(total * 100) ELSE 0 END), 0) AS valorPedidosCentavos,
      COALESCE(SUM(CASE WHEN estado != 'Cancelado' THEN ROUND(valor_pago * 100) ELSE 0 END), 0) AS valorRecebidoCentavos
    FROM pedidos
  `);

  const valorPedidosCentavos = Math.round(
    resultado?.valorPedidosCentavos ?? 0
  );
  const valorRecebidoCentavos = Math.round(
    resultado?.valorRecebidoCentavos ?? 0
  );

  return {
    valorPedidos: valorPedidosCentavos / 100,
    valorRecebido: valorRecebidoCentavos / 100,
    valorPendente:
      (valorPedidosCentavos - valorRecebidoCentavos) / 100,
  };
}
