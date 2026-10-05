import { db } from '../database/database';
import { obterTokenAdministrador } from './adminAuthService';
import type { Pedido } from './pedidoService';

type EstadoPedidoRemoto = 'RECEIVED' | 'PREPARING' | 'PRINTING' | 'READY_FOR_PICKUP' | 'DELIVERED' | 'CANCELLED';

type PedidoRemoto = {
  id: string;
  number: string;
  externalReference: string | null;
  customerName: string;
  customerPhone: string;
  service: string;
  unitPriceCents: number;
  pageCount: number;
  copyCount: number;
  doubleSided: boolean;
  sheetsRequired: number;
  bindingType: string;
  bindingPriceCents: number;
  totalCents: number;
  status: EstadoPedidoRemoto;
  createdAt: string;
  payments?: { amountCents: number; status: string }[];
};

type PedidoLocalSync = Pick<Pedido, 'id' | 'remoto_id' | 'sync_chave' | 'estado' | 'sincronizacao_estado'>;

const estadoRemotoParaLocal: Record<EstadoPedidoRemoto, string> = {
  RECEIVED: 'Pedido recebido',
  PREPARING: 'Em preparação',
  PRINTING: 'Em impressão',
  READY_FOR_PICKUP: 'Pronto para levantamento',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
};

const estadoLocalParaRemoto: Record<string, EstadoPedidoRemoto> = {
  'Pedido recebido': 'RECEIVED',
  'Em preparação': 'PREPARING',
  'Em impressão': 'PRINTING',
  'Pronto para levantamento': 'READY_FOR_PICKUP',
  Entregue: 'DELIVERED',
  Cancelado: 'CANCELLED',
};

function obterUrlApi() {
  const url = process.env.EXPO_PUBLIC_API_URL?.trim();
  return url ? url.replace(/\/$/, '') : null;
}

function mensagemErro(erro: unknown) {
  return erro instanceof Error ? erro.message.slice(0, 240) : 'Falha de sincronização.';
}

async function mensagemErroApi(resposta: Response) {
  const corpo = await resposta.json().catch(() => null) as { message?: unknown } | null;
  if (typeof corpo?.message === 'string') return corpo.message;
  if (Array.isArray(corpo?.message)) return corpo.message.join(' ');
  return `API respondeu ${resposta.status}.`;
}

async function enviarEstadoPedidoRemoto(apiUrl: string, pedido: Pedido, token: string) {
  if (!pedido.remoto_id) return;
  const status = estadoLocalParaRemoto[pedido.estado];
  if (!status) throw new Error(`Estado de pedido não suportado: ${pedido.estado}.`);

  const resposta = await fetch(`${apiUrl}/orders/${pedido.remoto_id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  });
  if (!resposta.ok) throw new Error(await mensagemErroApi(resposta));
}

export async function sincronizarPedidoLocal(pedido: Pedido) {
  const apiUrl = obterUrlApi();
  if (!apiUrl || !pedido.sync_chave) return;
  if (pedido.remoto_id && pedido.sincronizacao_estado !== 'PENDENTE') return;

  try {
    let remotoId = pedido.remoto_id;
    if (!remotoId) {
      const resposta = await fetch(`${apiUrl}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalReference: pedido.sync_chave,
          customerName: pedido.cliente,
          customerPhone: pedido.contacto,
          service: pedido.servico,
          unitPrice: pedido.preco_unitario,
          pageCount: pedido.numero_paginas,
          copyCount: pedido.numero_copias,
          doubleSided: pedido.frente_verso === 1,
          bindingType: pedido.tipo_encadernacao,
          bindingPrice: pedido.preco_encadernacao,
        }),
      });

      if (!resposta.ok) throw new Error(await mensagemErroApi(resposta));
      const remoto = (await resposta.json()) as { id: string };
      if (!remoto.id) throw new Error('A API não retornou o identificador do pedido.');
      remotoId = remoto.id;
      await db.runAsync(
        `UPDATE pedidos
         SET remoto_id = ?, sincronizacao_estado = 'PENDENTE'
         WHERE id = ?`,
        remotoId,
        pedido.id
      );
    }

    if (pedido.estado !== 'Pedido recebido') {
      const token = await obterTokenAdministrador();
      if (!token) throw new Error('Inicie sessão como administrador para sincronizar o estado do pedido.');
      await enviarEstadoPedidoRemoto(apiUrl, { ...pedido, remoto_id: remotoId }, token);
    }

    await db.runAsync(
      `UPDATE pedidos
       SET remoto_id = ?, sincronizacao_estado = 'SINCRONIZADO', sincronizacao_erro = NULL
       WHERE id = ?`,
      remotoId,
      pedido.id
    );
  } catch (erro) {
    await db.runAsync(
      `UPDATE pedidos
       SET sincronizacao_estado = 'PENDENTE', sincronizacao_erro = ?
       WHERE id = ?`,
      mensagemErro(erro),
      pedido.id
    );
  }
}

export async function sincronizarPedidosPendentes() {
  if (!obterUrlApi()) return;
  const pedidos = await db.getAllAsync<Pedido>(
    `SELECT * FROM pedidos
     WHERE sync_chave IS NOT NULL
       AND (remoto_id IS NULL OR sincronizacao_estado = 'PENDENTE')
     ORDER BY id ASC`
  );
  for (const pedido of pedidos) await sincronizarPedidoLocal(pedido);
}

async function guardarPedidoRemoto(pedido: PedidoRemoto) {
  const syncChave = pedido.externalReference ?? `pedido-remoto-${pedido.id}`;
  const existente = await db.getFirstAsync<PedidoLocalSync>(
    'SELECT id, remoto_id, sync_chave, estado, sincronizacao_estado FROM pedidos WHERE remoto_id = ? OR sync_chave = ? LIMIT 1',
    pedido.id,
    syncChave
  );
  const estado = existente?.sincronizacao_estado === 'PENDENTE'
    ? existente.estado
    : estadoRemotoParaLocal[pedido.status];
  const valorPago = (pedido.payments ?? [])
    .filter((pagamento) => pagamento.status === 'CONFIRMED')
    .reduce((total, pagamento) => total + pagamento.amountCents, 0) / 100;
  const valores = [
    pedido.number,
    pedido.customerName,
    pedido.customerPhone,
    pedido.service,
    pedido.unitPriceCents / 100,
    pedido.copyCount,
    pedido.totalCents / 100,
    estado,
    pedido.createdAt,
    pedido.pageCount,
    pedido.copyCount,
    pedido.doubleSided ? 1 : 0,
    pedido.sheetsRequired,
    valorPago,
    pedido.bindingType,
    pedido.bindingPriceCents / 100,
    syncChave,
    pedido.id,
  ];

  if (existente) {
    await db.runAsync(
      `UPDATE pedidos SET
        numero = ?, cliente = ?, contacto = ?, servico = ?, preco_unitario = ?,
        quantidade = ?, total = ?, estado = ?, data_criacao = ?, numero_paginas = ?,
        numero_copias = ?, frente_verso = ?, folhas_necessarias = ?, valor_pago = ?,
        tipo_encadernacao = ?, preco_encadernacao = ?, sync_chave = ?, remoto_id = ?,
        sincronizacao_estado = ?
       WHERE id = ?`,
      ...valores,
      existente.sincronizacao_estado === 'PENDENTE' ? 'PENDENTE' : 'SINCRONIZADO',
      existente.id
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO pedidos (
      numero, cliente, contacto, servico, preco_unitario, quantidade, total, estado,
      data_criacao, numero_paginas, numero_copias, frente_verso, folhas_necessarias,
      valor_pago, tipo_encadernacao, preco_encadernacao, sync_chave, remoto_id,
      sincronizacao_estado
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SINCRONIZADO')`,
    ...valores
  );
}

export async function sincronizarPedidosRecebidos() {
  const apiUrl = obterUrlApi();
  const token = await obterTokenAdministrador();
  if (!apiUrl || !token) return;

  const resposta = await fetch(`${apiUrl}/orders`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resposta.ok) throw new Error(await mensagemErroApi(resposta));

  const pedidos = (await resposta.json()) as PedidoRemoto[];
  for (const pedido of pedidos) await guardarPedidoRemoto(pedido);
}
