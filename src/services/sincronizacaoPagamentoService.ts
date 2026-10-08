import { db } from '../database/database';
import { fetch as expoFetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import { sincronizarPedidosPendentes, sincronizarPedidosRecebidos } from './sincronizacaoPedidoService';
import { obterTokenAdministrador } from './adminAuthService';
import type { MetodoPagamento, Pagamento, TipoPagamento } from './pagamentoService';

type EstadoRemoto = 'PENDING' | 'CONFIRMED' | 'REJECTED';
type PagamentoRemoto = { id: string; status: EstadoRemoto; confirmedAt?: string | null; rejectionReason?: string | null };
type PedidoRemotoLocal = { remoto_id: string | null };
type OpcoesSincronizacao = { propagarErrosDeCliente?: boolean; propagarErros?: boolean };
type PagamentoPendenteRemoto = {
  id: string;
  externalReference: string | null;
  orderId: string;
  amountCents: number;
  method: MetodoPagamento;
  type: TipoPagamento;
  status: EstadoRemoto;
  reference: string | null;
  proofOriginalName: string | null;
  proofMimeType: string | null;
  rejectionReason: string | null;
  createdAt: string;
  confirmedAt: string | null;
};

class ApiResponseError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function urlApi() {
  const url = process.env.EXPO_PUBLIC_API_URL?.trim();
  return url ? url.replace(/\/$/, '') : null;
}

function mensagemErro(erro: unknown) {
  return erro instanceof Error ? erro.message.slice(0, 240) : 'Falha de sincronização do pagamento.';
}

async function mensagemErroApi(resposta: Response) {
  const body = await resposta.json().catch(() => null) as { message?: unknown } | null;
  if (typeof body?.message === 'string') return body.message;
  if (Array.isArray(body?.message)) return body.message.join(' ');
  return `API respondeu ${resposta.status}.`;
}

async function fetchComTimeout(url: string, init: RequestInit = {}, executarFetch: typeof fetch = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    return await executarFetch(url, { ...init, signal: controller.signal });
  } catch (erro) {
    if (controller.signal.aborted) {
      throw new Error('O servidor demorou demasiado a responder. Verifique a ligação e tente novamente.');
    }
    throw erro;
  } finally {
    clearTimeout(timeout);
  }
}

async function aplicarEstadoRemoto(pagamentoId: number, remoto: PagamentoRemoto) {
  await db.withTransactionAsync(async () => {
    const local = await db.getFirstAsync<Pagamento>(
      'SELECT * FROM pagamentos WHERE id = ?',
      pagamentoId
    );
    if (!local) return;

    if (remoto.status === 'CONFIRMED' && local.status === 'PENDENTE') {
      await db.runAsync(
        `UPDATE pagamentos SET status = 'CONFIRMADO', data_confirmacao = ? WHERE id = ?`,
        remoto.confirmedAt ?? new Date().toISOString(),
        pagamentoId
      );
      await db.runAsync(
        'UPDATE pedidos SET valor_pago = valor_pago + ? WHERE id = ?',
        local.valor,
        local.pedido_id
      );
    } else if (remoto.status === 'REJECTED' && local.status === 'PENDENTE') {
      await db.runAsync(
        `UPDATE pagamentos SET status = 'REJEITADO', motivo_rejeicao = ? WHERE id = ?`,
        remoto.rejectionReason ?? 'Pagamento reprovado no servidor.',
        pagamentoId
      );
    }

    await db.runAsync(
      `UPDATE pagamentos
       SET remoto_id = ?, sincronizacao_estado = 'SINCRONIZADO', sincronizacao_erro = NULL
       WHERE id = ?`,
      remoto.id,
      pagamentoId
    );
  });
}

export async function sincronizarPagamentoLocal(pagamento: Pagamento, opcoes: OpcoesSincronizacao = {}) {
  const api = urlApi();
  if (!api) return;

  try {
    await sincronizarPedidosPendentes();
    const pedido = await db.getFirstAsync<PedidoRemotoLocal>(
      'SELECT remoto_id FROM pedidos WHERE id = ?',
      pagamento.pedido_id
    );
    if (!pedido?.remoto_id) throw new Error('O pedido ainda não foi sincronizado com o servidor.');

    let remoto: PagamentoRemoto;
    if (!pagamento.remoto_id) {
      const externalReference = pagamento.sync_chave ?? `pagamento-local-${pagamento.id}`;
      if (!pagamento.sync_chave) {
        await db.runAsync('UPDATE pagamentos SET sync_chave = ? WHERE id = ?', externalReference, pagamento.id);
      }

      const body = new FormData();
      body.append('externalReference', externalReference);
      body.append('orderId', pedido.remoto_id);
      body.append('amountCents', String(Math.round((pagamento.valor + Number.EPSILON) * 100)));
      body.append('method', pagamento.metodo as MetodoPagamento);
      body.append('type', pagamento.tipo as TipoPagamento);
      if (pagamento.referencia) body.append('reference', pagamento.referencia);
      if (pagamento.comprovativo_uri) {
        const proof = new File(pagamento.comprovativo_uri);
        if (!proof.exists) throw new Error('O ficheiro do comprovativo não está disponível no dispositivo.');
        body.append('proof', proof);
      }
      const resposta = await fetchComTimeout(`${api}/payments`, { method: 'POST', body }, expoFetch);
      if (!resposta.ok) throw new ApiResponseError(resposta.status, await mensagemErroApi(resposta));
      remoto = (await resposta.json()) as PagamentoRemoto;
      if (!remoto.id) throw new Error('A API não retornou o identificador do pagamento.');
      await db.runAsync('UPDATE pagamentos SET remoto_id = ? WHERE id = ?', remoto.id, pagamento.id);
    } else if (pagamento.status === 'PENDENTE') {
      const token = await obterTokenAdministrador();
      if (!token) throw new Error('Inicie sessão como administrador para sincronizar o pagamento.');
      const resposta = await fetchComTimeout(`${api}/payments/${pagamento.remoto_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resposta.ok) throw new Error(await mensagemErroApi(resposta));
      remoto = (await resposta.json()) as PagamentoRemoto;
    } else {
      const token = await obterTokenAdministrador();
      if (!token) throw new Error('Inicie sessão como administrador para confirmar o pagamento no servidor.');
      const acao = pagamento.status === 'CONFIRMADO' ? 'approve' : 'reject';
      const resposta = await fetchComTimeout(`${api}/payments/${pagamento.remoto_id}/${acao}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        ...(acao === 'reject'
          ? { body: JSON.stringify({ reason: pagamento.motivo_rejeicao ?? 'Pagamento reprovado.' }) }
          : {}),
      });
      if (!resposta.ok) throw new Error(await mensagemErroApi(resposta));
      remoto = (await resposta.json()) as PagamentoRemoto;
    }

    if (pagamento.status !== 'PENDENTE' && remoto.status === 'PENDING') {
      const token = await obterTokenAdministrador();
      if (!token) throw new Error('Inicie sessão como administrador para confirmar o pagamento no servidor.');
      const acao = pagamento.status === 'CONFIRMADO' ? 'approve' : 'reject';
      const resposta = await fetchComTimeout(`${api}/payments/${remoto.id}/${acao}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        ...(acao === 'reject'
          ? { body: JSON.stringify({ reason: pagamento.motivo_rejeicao ?? 'Pagamento reprovado.' }) }
          : {}),
      });
      if (!resposta.ok) throw new Error(await mensagemErroApi(resposta));
      remoto = (await resposta.json()) as PagamentoRemoto;
    }

    await aplicarEstadoRemoto(pagamento.id, remoto);
  } catch (erro) {
    await db.runAsync(
      `UPDATE pagamentos SET sincronizacao_estado = 'PENDENTE', sincronizacao_erro = ? WHERE id = ?`,
      mensagemErro(erro),
      pagamento.id
    );
    if (opcoes.propagarErros || (
      opcoes.propagarErrosDeCliente &&
      erro instanceof ApiResponseError &&
      erro.status >= 400 &&
      erro.status < 500
    )) {
      throw erro;
    }
  }
}

export async function sincronizarPagamentosPendentes() {
  if (!urlApi()) return;
  const pendentes = await db.getAllAsync<Pagamento>(
    `SELECT * FROM pagamentos
     WHERE (status = 'PENDENTE' AND (remoto_id IS NULL OR sincronizacao_estado = 'PENDENTE'))
        OR (status IN ('CONFIRMADO', 'REJEITADO') AND sincronizacao_estado = 'PENDENTE')
     ORDER BY id ASC`
  );
  for (const pagamento of pendentes) {
    await sincronizarPagamentoLocal(pagamento, { propagarErros: true });
  }
}

export async function sincronizarPagamentosRecebidos() {
  const api = urlApi();
  const token = await obterTokenAdministrador();
  if (!api || !token) return;

  await sincronizarPedidosPendentes();
  await sincronizarPedidosRecebidos();

  const resposta = await fetchComTimeout(`${api}/payments/pending`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resposta.ok) throw new Error(await mensagemErroApi(resposta));

  const pagamentos = await resposta.json() as (PagamentoPendenteRemoto & {
    order: { id: string; number: string; customerName: string; customerPhone: string; totalCents: number };
    proofStorageKey: string | null;
  })[];

  for (const pagamento of pagamentos) {
    const pedidoLocal = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM pedidos WHERE remoto_id = ? LIMIT 1',
      pagamento.orderId
    );
    if (!pedidoLocal) continue;

    const externalReference = pagamento.externalReference ?? `pagamento-remoto-${pagamento.id}`;
    const comprovativoUri = pagamento.proofStorageKey
      ? `${api}/payments/${pagamento.id}/proof`
      : null;
    const existente = await db.getFirstAsync<Pagamento>(
      'SELECT * FROM pagamentos WHERE remoto_id = ? OR sync_chave = ? LIMIT 1',
      pagamento.id,
      externalReference
    );

    if (existente?.sincronizacao_estado === 'PENDENTE' && existente.status !== 'PENDENTE') continue;

    if (existente) {
      await db.runAsync(
        `UPDATE pagamentos SET
          pedido_id = ?, valor = ?, metodo = ?, referencia = ?, data_criacao = ?, tipo = ?,
          status = 'PENDENTE', comprovativo_nome = ?, comprovativo_uri = ?,
          data_confirmacao = NULL, motivo_rejeicao = NULL, sync_chave = ?, remoto_id = ?,
          sincronizacao_estado = 'SINCRONIZADO', sincronizacao_erro = NULL
         WHERE id = ?`,
        pedidoLocal.id,
        pagamento.amountCents / 100,
        pagamento.method,
        pagamento.reference,
        pagamento.createdAt,
        pagamento.type,
        pagamento.proofOriginalName,
        comprovativoUri,
        externalReference,
        pagamento.id,
        existente.id
      );
      continue;
    }

    await db.runAsync(
      `INSERT INTO pagamentos (
        pedido_id, valor, metodo, referencia, data_criacao, tipo, status,
        comprovativo_nome, comprovativo_uri, data_confirmacao, motivo_rejeicao,
        sync_chave, remoto_id, sincronizacao_estado, sincronizacao_erro
       ) VALUES (?, ?, ?, ?, ?, ?, 'PENDENTE', ?, ?, NULL, NULL, ?, ?, 'SINCRONIZADO', NULL)`,
      pedidoLocal.id,
      pagamento.amountCents / 100,
      pagamento.method,
      pagamento.reference,
      pagamento.createdAt,
      pagamento.type,
      pagamento.proofOriginalName,
      comprovativoUri,
      externalReference,
      pagamento.id
    );
  }
}
