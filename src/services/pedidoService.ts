import { db, executarTransacaoLocal } from '../database/database';
import { calcularImpressao } from '../utils/calcularImpressao';
import { sincronizarPedidoLocal } from './sincronizacaoPedidoService';
import { obterTokenAdministrador } from './adminAuthService';

export type NovoPedido = {
  cliente: string;
  contacto: string;
  servico: string;
  instrucoes?: string;
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
  instrucoes: string | null;
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
  documento_remoto_id: string | null;
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

const estadosRemotosParaLocal: Record<string, string> = {
  RECEIVED: 'Pedido recebido',
  PREPARING: 'Em preparação',
  PRINTING: 'Em impressão',
  READY_FOR_PICKUP: 'Pronto para levantamento',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
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
        instrucoes,
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    null,
    pedido.cliente,
    pedido.contacto,
    pedido.servico,
    pedido.instrucoes?.trim() || null,
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
  const pedido = await db.getFirstAsync<Pedido>('SELECT * FROM pedidos WHERE id = ?', id);
  if (!pedido) throw new Error('Pedido não encontrado.');
  if (!pedido.remoto_id) {
    throw new Error('O pedido ainda não está no servidor. Ligue à Internet e atualize a lista antes de alterar o estado.');
  }

  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '');
  if (!apiUrl) throw new Error('A URL do backend não está configurada.');
  const token = await obterTokenAdministrador();
  if (!token) throw new Error('Inicie sessão como administrador para alterar o estado do pedido.');

  const estadoResponse = await fetch(`${apiUrl}/orders/${encodeURIComponent(pedido.remoto_id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const estadoBody = await estadoResponse.json().catch(() => null) as {
    status?: string;
    message?: unknown;
  } | null;
  if (!estadoResponse.ok) {
    throw new Error(typeof estadoBody?.message === 'string'
      ? estadoBody.message
      : `API respondeu ${estadoResponse.status} ao confirmar o estado do pedido.`);
  }

  const estadoServidor = estadoBody?.status ? estadosRemotosParaLocal[estadoBody.status] : undefined;
  if (!estadoServidor) throw new Error('O servidor retornou um estado de pedido inválido.');
  if (estadoServidor !== pedido.estado) {
    await executarTransacaoLocal(async (transaction) => {
      await transaction.runAsync(
        `UPDATE pedidos
         SET estado = ?, sincronizacao_estado = 'SINCRONIZADO', sincronizacao_erro = NULL
         WHERE id = ?`,
        estadoServidor,
        id
      );
    });
    throw new Error(
      `O estado atualizado no servidor é "${estadoServidor}". Atualizei a lista; confira o pedido antes de tentar novamente.`
    );
  }

  if (proximosEstados[estadoServidor] !== novoEstado) {
    throw new Error(`Não é possível alterar um pedido de "${estadoServidor}" para "${novoEstado}".`);
  }
  if (novoEstado === 'Em impressão') {
    throw new Error('Inicie a impressão para reservar o papel no stock.');
  }

  const status = Object.entries(estadosRemotosParaLocal)
    .find(([, estado]) => estado === novoEstado)?.[0];
  if (!status) throw new Error(`Estado de pedido não suportado: ${novoEstado}.`);

  const response = await fetch(`${apiUrl}/orders/${encodeURIComponent(pedido.remoto_id)}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  });
  const body = await response.json().catch(() => null) as {
    status?: string;
    message?: unknown;
  } | null;
  if (!response.ok) {
    throw new Error(typeof body?.message === 'string' ? body.message : `API respondeu ${response.status}.`);
  }

  const estadoConfirmado = body?.status ? estadosRemotosParaLocal[body.status] : undefined;
  if (estadoConfirmado !== novoEstado) {
    throw new Error('O servidor não confirmou a alteração de estado esperada. Atualize a lista e tente novamente.');
  }

  await executarTransacaoLocal(async (transaction) => {
    await transaction.runAsync(
      `UPDATE pedidos
       SET estado = ?, sincronizacao_estado = 'SINCRONIZADO', sincronizacao_erro = NULL
       WHERE id = ?`,
      estadoConfirmado,
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
  let pedido = await db.getFirstAsync<Pedido>('SELECT * FROM pedidos WHERE id = ?', pedidoId);
  if (!pedido) throw new Error('Pedido não encontrado.');

  if (!pedido.remoto_id || (pedido.estado === 'Em preparação' && pedido.sincronizacao_estado === 'PENDENTE')) {
    await sincronizarPedidoLocal(pedido);
    pedido = await db.getFirstAsync<Pedido>('SELECT * FROM pedidos WHERE id = ?', pedidoId);
  }
  if (!pedido?.remoto_id) {
    throw new Error('O pedido ainda não está sincronizado com o backend. Verifique a ligação e tente novamente.');
  }

  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '');
  if (!apiUrl) throw new Error('A URL do backend não está configurada.');
  const token = await obterTokenAdministrador();
  if (!token) throw new Error('Inicie sessão como administrador para iniciar a impressão.');

  const estadosLocais: Record<string, string> = {
    RECEIVED: 'Pedido recebido',
    PREPARING: 'Em preparação',
    PRINTING: 'Em impressão',
    READY_FOR_PICKUP: 'Pronto para levantamento',
    DELIVERED: 'Entregue',
    CANCELLED: 'Cancelado',
  };
  const estadoResponse = await fetch(`${apiUrl}/orders/${encodeURIComponent(pedido.remoto_id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const estadoBody = await estadoResponse.json().catch(() => null) as {
    status?: string;
    message?: unknown;
  } | null;
  if (!estadoResponse.ok) {
    const message = typeof estadoBody?.message === 'string'
      ? estadoBody.message
      : `API respondeu ${estadoResponse.status} ao confirmar o estado do pedido.`;
    throw new Error(message);
  }
  const estadoRemoto = estadoBody?.status;
  if (!estadoRemoto || !Object.prototype.hasOwnProperty.call(estadosLocais, estadoRemoto)) {
    throw new Error('O servidor retornou um estado de pedido inválido.');
  }
  if (estadoRemoto !== 'PREPARING' && estadoRemoto !== 'PRINTING') {
    const estadoAtual = estadosLocais[estadoRemoto];
    await executarTransacaoLocal(async (transaction) => {
      await transaction.runAsync(
        `UPDATE pedidos
         SET estado = ?, sincronizacao_estado = 'SINCRONIZADO', sincronizacao_erro = NULL
         WHERE id = ?`,
        estadoAtual,
        pedidoId
      );
    });
    throw new Error(
      `O servidor confirma que o pedido está "${estadoAtual}", e não "Em preparação". Atualizei a lista; confira o estado antes de tentar novamente.`
    );
  }

  const usaPapel = ['Impressão P/B', 'Fotocópia P/B', 'Colorida simples', 'Colorida com imagens'].includes(pedido.servico);
  const externalReference = `start-print-${pedido.sync_chave ?? pedido.remoto_id}`;
  const response = await fetch(`${apiUrl}/inventory/orders/${pedido.remoto_id}/start-print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ externalReference }),
  });
  const body = await response.json().catch(() => null) as {
    message?: unknown;
    stockItem?: { averageUnitCost?: number } | null;
    costs?: { paper: number; ink: number; inkCostPerPage: number; wasteReserve: number; total: number };
  } | null;
  if (!response.ok) {
    const message = typeof body?.message === 'string' ? body.message : `API respondeu ${response.status}.`;
    throw new Error(message);
  }

  const costs = body?.costs;
  if (
    !costs ||
    !Number.isFinite(costs.paper) ||
    !Number.isFinite(costs.ink) ||
    !Number.isFinite(costs.inkCostPerPage) ||
    !Number.isFinite(costs.total)
  ) {
    throw new Error('O backend não devolveu o cálculo de custos da impressão. Atualize o backend e tente novamente.');
  }
  const custoPapelUnitario = body?.stockItem?.averageUnitCost ?? 0;
  await executarTransacaoLocal(async (transaction) => {
    await transaction.runAsync(
      `UPDATE pedidos
       SET estado = ?, sincronizacao_estado = 'SINCRONIZADO', sincronizacao_erro = NULL,
           stock_descontado = ?, custo_papel_unitario = ?, custo_papel = ?,
           custo_tinta_por_pagina = ?, custo_tinta = ?
       WHERE id = ?`,
      'Em impressão',
      usaPapel ? 1 : 0,
      custoPapelUnitario,
      costs.paper,
      costs.inkCostPerPage,
      costs.ink,
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

type ResumoRemotoPedidos = {
  valorPedidosCents: number;
  valorTotalInclCancelledCents: number;
  recebidoCents: number;
  porReceberCents: number;
  totalPedidos: number;
  entregues: number;
  cancelados: number;
  emProducao: number;
};

async function obterResumoRemotoPedidos() {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '');
  if (!apiUrl) return null;
  const token = await obterTokenAdministrador();
  if (!token) throw new Error('Inicie sessão como administrador para consultar os resumos online.');

  const response = await fetch(`${apiUrl}/inventory/reports?period=GERAL`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => null) as (ResumoRemotoPedidos & { message?: unknown }) | null;
  if (!response.ok) {
    throw new Error(typeof body?.message === 'string' ? body.message : `API respondeu ${response.status}.`);
  }
  if (!body || !Number.isFinite(body.valorTotalInclCancelledCents) || !Number.isFinite(body.emProducao)) {
    throw new Error('O backend precisa ser atualizado para fornecer os resumos do Dashboard.');
  }
  return body;
}

export async function obterEstatisticasPedidos(): Promise<EstatisticasPedidos> {
  const remoto = await obterResumoRemotoPedidos();
  if (remoto) {
    return {
      totalPedidos: remoto.totalPedidos,
      pedidosPendentes: remoto.totalPedidos - remoto.entregues - remoto.cancelados,
      pedidosEntregues: remoto.entregues,
      emProducao: remoto.emProducao,
      valorTotal: remoto.valorTotalInclCancelledCents / 100,
      cancelados: remoto.cancelados,
    };
  }

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

  await executarTransacaoLocal(async (transaction) => {
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
  const remoto = await obterResumoRemotoPedidos();
  if (remoto) {
    return {
      valorPedidos: remoto.valorPedidosCents / 100,
      valorRecebido: remoto.recebidoCents / 100,
      valorPendente: remoto.porReceberCents / 100,
    };
  }

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
