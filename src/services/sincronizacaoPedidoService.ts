import { db } from '../database/database';
import type { Pedido } from './pedidoService';

type PedidoRemoto = { id: string };

function obterUrlApi() {
  const url = process.env.EXPO_PUBLIC_API_URL?.trim();
  return url ? url.replace(/\/$/, '') : null;
}

function mensagemErro(erro: unknown) {
  return erro instanceof Error ? erro.message.slice(0, 240) : 'Falha de sincronização.';
}

export async function sincronizarPedidoLocal(pedido: Pedido) {
  const apiUrl = obterUrlApi();
  if (!apiUrl || pedido.remoto_id || !pedido.sync_chave) return;

  try {
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

    if (!resposta.ok) throw new Error(`API respondeu ${resposta.status}.`);
    const remoto = (await resposta.json()) as PedidoRemoto;
    if (!remoto.id) throw new Error('A API não retornou o identificador do pedido.');

    await db.runAsync(
      `UPDATE pedidos
       SET remoto_id = ?, sincronizacao_estado = 'SINCRONIZADO', sincronizacao_erro = NULL
       WHERE id = ?`,
      remoto.id,
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
    'SELECT * FROM pedidos WHERE remoto_id IS NULL AND sync_chave IS NOT NULL ORDER BY id ASC'
  );
  for (const pedido of pedidos) await sincronizarPedidoLocal(pedido);
}
