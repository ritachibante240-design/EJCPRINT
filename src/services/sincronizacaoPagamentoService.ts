import { db, executarTransacaoLocal } from '../database/database';
import { fetch as expoFetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { ehDocumentoWeb, lerDocumentoWeb } from '../utils/webDocumentStore';
import { sincronizarPedidoLocal, sincronizarPedidosPendentes, sincronizarPedidosRecebidos } from './sincronizacaoPedidoService';
import type { Pedido } from './pedidoService';
import { obterTokenAdministrador } from './adminAuthService';
import type { MetodoPagamento, Pagamento, TipoPagamento } from './pagamentoService';

type EstadoRemoto = 'PENDING' | 'CONFIRMED' | 'REJECTED';
type PagamentoRemoto = { id: string; status: EstadoRemoto; confirmedAt?: string | null; rejectionReason?: string | null };
type PedidoRemotoLocal = { remoto_id: string | null; sincronizacao_estado: string | null; sincronizacao_erro: string | null };
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
    super(status === 413 ? 'O comprovativo excede o tamanho máximo aceite pelo servidor (5 MB).' : message);
  }
}

/** Erro que não se resolve a tentar outra vez: o pagamento fica marcado como 'ERRO'. */
class ErroPagamentoPermanente extends Error {}

const ESTADOS_HTTP_PERMANENTES = new Set([400, 404, 410, 413, 415, 422]);

function erroPermanente(erro: unknown) {
  return erro instanceof ErroPagamentoPermanente
    || (erro instanceof ApiResponseError && ESTADOS_HTTP_PERMANENTES.has(erro.status));
}

function urlApi() {
  const url = process.env.EXPO_PUBLIC_API_URL?.trim();
  return url ? url.replace(/\/$/, '') : null;
}

function mensagemErro(erro: unknown) {
  return erro instanceof Error ? erro.message.slice(0, 240) : 'Falha de sincronização do pagamento.';
}

async function obterComprovativoLocal(pagamento: Pagamento): Promise<Blob | File | null> {
  const uri = pagamento.comprovativo_uri;
  if (!uri || /^https?:\/\//i.test(uri)) return null;

  if (Platform.OS === 'web') {
    // No navegador não existe o File do expo-file-system: o comprovativo está
    // guardado como data:/blob: ou na IndexedDB (web-doc:).
    try {
      if (ehDocumentoWeb(uri)) return (await lerDocumentoWeb(uri))?.blob ?? null;
      const resposta = await fetch(uri);
      return resposta.ok ? await resposta.blob() : null;
    } catch {
      return null;
    }
  }

  const proof = new File(uri);
  return proof.exists ? proof : null;
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
  await executarTransacaoLocal(async (transacao) => {
    const local = await transacao.getFirstAsync<Pagamento>(
      'SELECT * FROM pagamentos WHERE id = ?',
      pagamentoId
    );
    if (!local) return;

    if (remoto.status === 'CONFIRMED' && local.status === 'PENDENTE') {
      await transacao.runAsync(
        `UPDATE pagamentos SET status = 'CONFIRMADO', data_confirmacao = ? WHERE id = ?`,
        remoto.confirmedAt ?? new Date().toISOString(),
        pagamentoId
      );
      await transacao.runAsync(
        'UPDATE pedidos SET valor_pago = valor_pago + ? WHERE id = ?',
        local.valor,
        local.pedido_id
      );
    } else if (remoto.status === 'REJECTED' && local.status === 'PENDENTE') {
      await transacao.runAsync(
        `UPDATE pagamentos SET status = 'REJEITADO', motivo_rejeicao = ? WHERE id = ?`,
        remoto.rejectionReason ?? 'Pagamento reprovado no servidor.',
        pagamentoId
      );
    }

    await transacao.runAsync(
      `UPDATE pagamentos
       SET remoto_id = ?, sincronizacao_estado = 'SINCRONIZADO', sincronizacao_erro = NULL
       WHERE id = ?`,
      remoto.id,
      pagamentoId
    );
  });
}

// O mesmo pagamento nunca é enviado por duas sincronizações em simultâneo.
// Uma segunda chamada espera pela primeira e relê o pagamento da base local.
const sincronizacoesPorPagamento = new Map<number, Promise<void>>();

export function sincronizarPagamentoLocal(pagamento: Pagamento, opcoes: OpcoesSincronizacao = {}): Promise<void> {
  const anterior = sincronizacoesPorPagamento.get(pagamento.id) ?? Promise.resolve();
  const atual = anterior
    .catch(() => undefined)
    .then(async () => {
      const atualizado = await db.getFirstAsync<Pagamento>('SELECT * FROM pagamentos WHERE id = ?', pagamento.id);
      if (atualizado) await sincronizarPagamentoLocalSemConcorrencia(atualizado, opcoes);
    });
  sincronizacoesPorPagamento.set(pagamento.id, atual);
  atual
    .finally(() => {
      if (sincronizacoesPorPagamento.get(pagamento.id) === atual) sincronizacoesPorPagamento.delete(pagamento.id);
    })
    .catch(() => undefined);
  return atual;
}

async function sincronizarPagamentoLocalSemConcorrencia(pagamento: Pagamento, opcoes: OpcoesSincronizacao = {}) {
  const api = urlApi();
  if (!api) return;

  try {
    // Só é preciso que o pedido DESTE pagamento exista no servidor. Antes, todos os
    // pedidos pendentes do dispositivo eram sincronizados primeiro, o que deixava o
    // envio do comprovativo à espera de pedidos antigos sem relação com ele.
    const pedidoLocal = await db.getFirstAsync<Pedido>('SELECT * FROM pedidos WHERE id = ?', pagamento.pedido_id);
    if (pedidoLocal && !pedidoLocal.remoto_id) await sincronizarPedidoLocal(pedidoLocal);
    const pedido = await db.getFirstAsync<PedidoRemotoLocal>(
      'SELECT remoto_id, sincronizacao_estado, sincronizacao_erro FROM pedidos WHERE id = ?',
      pagamento.pedido_id
    );
    if (!pedido?.remoto_id) {
      if (!pedido || pedido.sincronizacao_estado === 'ERRO') {
        throw new ErroPagamentoPermanente(
          `O pedido deste pagamento não pode ser enviado ao servidor${pedido?.sincronizacao_erro ? `: ${pedido.sincronizacao_erro}` : '.'}`
        );
      }
      throw new Error('O pedido ainda não foi sincronizado com o servidor.');
    }

    let remoto: PagamentoRemoto;
    if (!pagamento.remoto_id) {
      const externalReference = pagamento.sync_chave ?? `pagamento-local-${pagamento.id}`;
      if (!pagamento.sync_chave) {
        await db.runAsync('UPDATE pagamentos SET sync_chave = ? WHERE id = ?', externalReference, pagamento.id);
      }

      const proof = await obterComprovativoLocal(pagamento);
      const adminConfirmedWithoutProof =
        pagamento.status === 'CONFIRMADO' &&
        pagamento.metodo !== 'Dinheiro' &&
        !proof;
      let body: FormData | string;
      let headers: HeadersInit | undefined;
      let endpoint = `${api}/payments`;

      if (adminConfirmedWithoutProof) {
        const token = await obterTokenAdministrador();
        if (!token) throw new Error('Inicie sessão como administrador para sincronizar o pagamento confirmado.');
        endpoint = `${api}/payments/admin/confirmed`;
        headers = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        };
        body = JSON.stringify({
          externalReference,
          orderId: pedido.remoto_id,
          amountCents: Math.round((pagamento.valor + Number.EPSILON) * 100),
          method: pagamento.metodo,
          type: pagamento.tipo,
          ...(pagamento.referencia ? { reference: pagamento.referencia } : {}),
        });
      } else {
        const formData = new FormData();
        formData.append('externalReference', externalReference);
        formData.append('orderId', pedido.remoto_id);
        formData.append('amountCents', String(Math.round((pagamento.valor + Number.EPSILON) * 100)));
        formData.append('method', pagamento.metodo as MetodoPagamento);
        formData.append('type', pagamento.tipo as TipoPagamento);
        if (pagamento.referencia) formData.append('reference', pagamento.referencia);
        if (proof) {
          if (Platform.OS === 'web') {
            formData.append('proof', proof as Blob, pagamento.comprovativo_nome ?? 'comprovativo');
          } else {
            formData.append('proof', proof as File);
          }
        }
        body = formData;
      }
      const resposta = await fetchComTimeout(endpoint, { method: 'POST', headers, body }, expoFetch);
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
      if (!resposta.ok) throw new ApiResponseError(resposta.status, await mensagemErroApi(resposta));
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
      if (!resposta.ok) throw new ApiResponseError(resposta.status, await mensagemErroApi(resposta));
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
      if (!resposta.ok) throw new ApiResponseError(resposta.status, await mensagemErroApi(resposta));
      remoto = (await resposta.json()) as PagamentoRemoto;
    }

    await aplicarEstadoRemoto(pagamento.id, remoto);
  } catch (erro) {
    await db.runAsync(
      `UPDATE pagamentos SET sincronizacao_estado = ?, sincronizacao_erro = ? WHERE id = ?`,
      erroPermanente(erro) ? 'ERRO' : 'PENDENTE',
      mensagemErro(erro),
      pagamento.id
    );
    if (opcoes.propagarErros || (
      opcoes.propagarErrosDeCliente && (
        erroPermanente(erro) ||
        (erro instanceof ApiResponseError && erro.status >= 400 && erro.status < 500)
      )
    )) {
      throw erro;
    }
  }
}

export async function sincronizarPagamentosPendentes() {
  if (!urlApi()) return;
  const pagamentosSemComprovativo = await db.getAllAsync<Pagamento>(
    `SELECT * FROM pagamentos
     WHERE status = 'PENDENTE' AND remoto_id IS NULL AND metodo != 'Dinheiro'`
  );
  for (const pagamento of pagamentosSemComprovativo) {
    if (await obterComprovativoLocal(pagamento)) continue;
    const motivo = 'Comprovativo não encontrado neste dispositivo. Envie novamente o pagamento com o comprovativo.';
    await db.runAsync(
      `UPDATE pagamentos
       SET status = 'REJEITADO', motivo_rejeicao = ?, sincronizacao_erro = ?
       WHERE id = ? AND status = 'PENDENTE' AND remoto_id IS NULL`,
      motivo,
      motivo,
      pagamento.id
    );
  }

  const pendentes = await db.getAllAsync<Pagamento>(
    `SELECT * FROM pagamentos
     WHERE (status = 'PENDENTE' AND sincronizacao_estado != 'ERRO' AND (remoto_id IS NULL OR sincronizacao_estado = 'PENDENTE'))
        OR (status = 'CONFIRMADO' AND sincronizacao_estado = 'PENDENTE')
        OR (status = 'REJEITADO' AND sincronizacao_estado = 'PENDENTE' AND remoto_id IS NOT NULL)
     ORDER BY id ASC`
  );
  const erros: string[] = [];
  for (const pagamento of pendentes) {
    try {
      await sincronizarPagamentoLocal(pagamento, { propagarErros: true });
    } catch (erro) {
      const mensagem = mensagemErro(erro);
      console.warn(`Não foi possível sincronizar o pagamento ${pagamento.id}.`, erro);
      // Erros definitivos ficam registados no próprio pagamento ('ERRO') e não
      // fazem falhar a sincronização dos restantes dados.
      if (!erroPermanente(erro)) erros.push(`${pagamento.id}: ${mensagem}`);
    }
  }
  if (erros.length > 0) {
    const restantes = erros.length > 3 ? ` (e mais ${erros.length - 3})` : '';
    throw new Error(`Falha ao sincronizar pagamento(s): ${erros.slice(0, 3).join('; ')}${restantes}`);
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
