import { db, executarTransacaoLocal } from '../database/database';
import { fetch as expoFetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { obterTokenAdministrador } from './adminAuthService';
import type { Pedido } from './pedidoService';
import { ehDocumentoWeb, lerDocumentoWeb, removerDocumentoWeb } from '../utils/webDocumentStore';

type EstadoPedidoRemoto = 'RECEIVED' | 'PREPARING' | 'PRINTING' | 'READY_FOR_PICKUP' | 'DELIVERED' | 'CANCELLED';

type PedidoRemoto = {
  id: string;
  number: string;
  externalReference: string | null;
  customerName: string;
  customerPhone: string;
  service: string;
  instructions?: string | null;
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
  documents?: { id: string; originalName: string }[];
  payments?: { id: string; externalReference: string | null; amountCents: number; status: string }[];
  stockMovements?: {
    type: string;
    amountCents: number | null;
    stockItem: { name: string };
  }[];
};

type PedidoLocalSync = Pick<Pedido, 'id' | 'remoto_id' | 'sync_chave' | 'estado' | 'sincronizacao_estado' | 'documento_nome' | 'documento_uri' | 'documento_remoto_id' | 'instrucoes' | 'encadernacao_consumida' | 'espiral_encadernacao' | 'custo_encadernacao'>;
type EstadoClienteRemoto = {
  id: string;
  number?: string;
  status: EstadoPedidoRemoto;
  payments: {
    id: string;
    externalReference: string;
    amountCents: number;
    method: string;
    type: string;
    status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
    reference: string | null;
    proofOriginalName: string | null;
    rejectionReason: string | null;
    createdAt: string;
    confirmedAt: string | null;
  }[];
};

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

const estadoPagamentoRemotoParaLocal = {
  PENDING: 'PENDENTE',
  CONFIRMED: 'CONFIRMADO',
  REJECTED: 'REJEITADO',
} as const;

function obterUrlApi() {
  const url = process.env.EXPO_PUBLIC_API_URL?.trim();
  return url ? url.replace(/\/$/, '') : null;
}

function mensagemErro(erro: unknown) {
  return erro instanceof Error ? erro.message.slice(0, 240) : 'Falha de sincronização.';
}

// Troca o número provisório pelo número do servidor, exceto se outro registo local
// já o usar (a coluna é única). Parâmetros, por ordem: número, número, id do pedido, número.
const SQL_NUMERO_DO_SERVIDOR = `CASE
  WHEN ? IS NULL OR EXISTS (SELECT 1 FROM pedidos AS outro WHERE outro.numero = ? AND outro.id != ?) THEN numero
  ELSE (SELECT ?) END`;

/**
 * Erro que não se resolve a tentar outra vez (o servidor recusou os dados de forma
 * definitiva, ou o ficheiro local já não existe). O registo fica marcado como 'ERRO'
 * em vez de ser reenviado em todas as sincronizações.
 */
export class ErroSincronizacaoPermanente extends Error {}

const ESTADOS_HTTP_PERMANENTES = new Set([400, 404, 410, 413, 415, 422]);

async function erroDaRespostaApi(resposta: Response) {
  const mensagem = resposta.status === 413
    ? 'O documento excede o tamanho máximo aceite pelo servidor (20 MB).'
    : await mensagemErroApi(resposta);
  return ESTADOS_HTTP_PERMANENTES.has(resposta.status)
    ? new ErroSincronizacaoPermanente(mensagem)
    : new Error(mensagem);
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
  if (!resposta.ok) throw await erroDaRespostaApi(resposta);
}

// Garante que o mesmo pedido nunca é enviado por duas sincronizações em simultâneo
// (arranque da app, ecrãs e criação do pedido podem disparar ao mesmo tempo).
// Uma segunda chamada espera pela primeira e relê o pedido da base local, para
// não voltar a enviar o que já foi sincronizado.
const sincronizacoesPorPedido = new Map<number, Promise<void>>();

export function sincronizarPedidoLocal(pedido: Pedido): Promise<void> {
  const anterior = sincronizacoesPorPedido.get(pedido.id) ?? Promise.resolve();
  const atual = anterior
    .catch(() => undefined)
    .then(async () => {
      const atualizado = await db.getFirstAsync<Pedido>('SELECT * FROM pedidos WHERE id = ?', pedido.id);
      if (atualizado) await sincronizarPedidoLocalSemConcorrencia(atualizado);
    });
  sincronizacoesPorPedido.set(pedido.id, atual);
  atual
    .finally(() => {
      if (sincronizacoesPorPedido.get(pedido.id) === atual) sincronizacoesPorPedido.delete(pedido.id);
    })
    .catch(() => undefined);
  return atual;
}

async function sincronizarPedidoLocalSemConcorrencia(pedido: Pedido) {
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
          instructions: pedido.instrucoes ?? undefined,
          unitPrice: pedido.preco_unitario,
          pageCount: pedido.numero_paginas,
          copyCount: pedido.numero_copias,
          doubleSided: pedido.frente_verso === 1,
          bindingType: pedido.tipo_encadernacao,
          bindingPrice: pedido.preco_encadernacao,
        }),
      });

      if (!resposta.ok) throw await erroDaRespostaApi(resposta);
      const remoto = (await resposta.json()) as { id: string; number?: string };
      if (!remoto.id) throw new Error('A API não retornou o identificador do pedido.');
      remotoId = remoto.id;
      // Passa a mostrar o número oficial do servidor (ex.: EJC-2026-38BE1364) em vez
      // do número provisório do dispositivo (EJC-0001), igual ao que o admin vê.
      await db.runAsync(
        `UPDATE pedidos
         SET remoto_id = ?, numero = ${SQL_NUMERO_DO_SERVIDOR}, sincronizacao_estado = 'PENDENTE'
         WHERE id = ?`,
        remotoId,
        remoto.number ?? null,
        remoto.number ?? null,
        pedido.id,
        remoto.number ?? null,
        pedido.id
      );
    }

    if (pedido.documento_uri && !pedido.documento_remoto_id) {
      const body = new FormData();
      if (ehDocumentoWeb(pedido.documento_uri)) {
        const guardado = await lerDocumentoWeb(pedido.documento_uri);
        if (!guardado) throw new ErroSincronizacaoPermanente('O documento do pedido não está disponível neste navegador.');
        body.append('document', guardado.blob, pedido.documento_nome ?? guardado.nome);
      } else if (pedido.documento_uri.startsWith('data:')) {
        const respostaArquivo = await fetch(pedido.documento_uri);
        const arquivo = await respostaArquivo.blob();
        body.append('document', arquivo, pedido.documento_nome ?? 'documento');
      } else if (Platform.OS === 'web') {
        const respostaArquivo = await fetch(pedido.documento_uri).catch(() => null);
        if (!respostaArquivo?.ok) throw new ErroSincronizacaoPermanente('O documento do pedido não está disponível neste navegador.');
        body.append('document', await respostaArquivo.blob(), pedido.documento_nome ?? 'documento');
      } else {
        const arquivo = new File(pedido.documento_uri);
        if (!arquivo.exists) throw new ErroSincronizacaoPermanente('O documento do pedido não está disponível neste dispositivo.');
        body.append('document', arquivo);
      }

      const respostaDocumento = await expoFetch(`${apiUrl}/orders/${remotoId}/document`, {
        method: 'POST',
        body,
      });
      if (!respostaDocumento.ok) throw await erroDaRespostaApi(respostaDocumento);
      const documentoRemoto = await respostaDocumento.json() as { id: string };
      if (!documentoRemoto.id) throw new Error('A API não retornou o identificador do documento.');
      await db.runAsync('UPDATE pedidos SET documento_remoto_id = ? WHERE id = ?', documentoRemoto.id, pedido.id);
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
       SET sincronizacao_estado = ?, sincronizacao_erro = ?
       WHERE id = ?`,
      erro instanceof ErroSincronizacaoPermanente ? 'ERRO' : 'PENDENTE',
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
       AND sincronizacao_estado != 'ERRO'
       AND (remoto_id IS NULL OR sincronizacao_estado = 'PENDENTE')
     ORDER BY id ASC`
  );
  for (const pedido of pedidos) await sincronizarPedidoLocal(pedido);
}

async function guardarPedidoRemoto(pedido: PedidoRemoto) {
  const syncChave = pedido.externalReference ?? `pedido-remoto-${pedido.id}`;
  const existente = await db.getFirstAsync<PedidoLocalSync>(
    'SELECT id, remoto_id, sync_chave, estado, sincronizacao_estado, documento_nome, documento_uri, documento_remoto_id, instrucoes, encadernacao_consumida, espiral_encadernacao, custo_encadernacao FROM pedidos WHERE remoto_id = ? OR sync_chave = ? LIMIT 1',
    pedido.id,
    syncChave
  );
  const estado = estadoRemotoParaLocal[pedido.status];
  const valorPago = (pedido.payments ?? [])
    .filter((pagamento) => pagamento.status === 'CONFIRMED')
    .reduce((total, pagamento) => total + pagamento.amountCents, 0) / 100;
  const documentoRemoto = pedido.documents?.[0];
  const documentoRemotoId = documentoRemoto?.id ?? existente?.documento_remoto_id ?? null;
  const documentoUri = existente?.documento_uri && !existente.documento_remoto_id
    ? existente.documento_uri
    : documentoRemoto
      ? `${obterUrlApi()}/orders/${pedido.id}/document`
      : existente?.documento_uri ?? null;
  const documentoNome = documentoRemoto?.originalName ?? existente?.documento_nome ?? null;
  const movimentosEncadernacao = pedido.stockMovements?.filter(
    (movement) => movement.type === 'CONSUMO_ENCADERNACAO',
  );
  const movimentoEspiral = movimentosEncadernacao?.find((movement) =>
    movement.stockItem.name.trim().toLocaleLowerCase().startsWith('espiral '),
  );
  const encadernacaoConsumida = movimentosEncadernacao
    ? (movimentosEncadernacao.length > 0 ? 1 : 0)
    : (existente?.encadernacao_consumida ?? 0);
  const espiralEncadernacao = movimentoEspiral
    ? movimentoEspiral.stockItem.name
    : existente?.espiral_encadernacao ?? null;
  const custoEncadernacao = movimentosEncadernacao
    ? movimentosEncadernacao.reduce((total, movement) => total + (movement.amountCents ?? 0), 0) / 100
    : existente?.custo_encadernacao ?? 0;
  const valores = [
    pedido.number,
    pedido.customerName,
    pedido.customerPhone,
    pedido.service,
    pedido.instructions ?? existente?.instrucoes ?? null,
    pedido.unitPriceCents / 100,
    pedido.copyCount,
    pedido.totalCents / 100,
    estado,
    pedido.createdAt,
    documentoNome,
    documentoUri,
    documentoRemotoId,
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
        numero = ?, cliente = ?, contacto = ?, servico = ?, instrucoes = ?, preco_unitario = ?,
        quantidade = ?, total = ?, estado = ?, data_criacao = ?, documento_nome = ?,
        documento_uri = ?, documento_remoto_id = ?, numero_paginas = ?,
        numero_copias = ?, frente_verso = ?, folhas_necessarias = ?, valor_pago = ?,
        tipo_encadernacao = ?, preco_encadernacao = ?, sync_chave = ?, remoto_id = ?,
        sincronizacao_estado = ?, encadernacao_consumida = ?, espiral_encadernacao = ?, custo_encadernacao = ?
       WHERE id = ?`,
      ...valores,
      existente.sincronizacao_estado === 'PENDENTE' && existente.documento_uri && !existente.documento_remoto_id
        ? 'PENDENTE'
        : 'SINCRONIZADO',
      encadernacaoConsumida,
      espiralEncadernacao,
      custoEncadernacao,
      existente.id
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO pedidos (
      numero, cliente, contacto, servico, instrucoes, preco_unitario, quantidade, total, estado,
      data_criacao, documento_nome, documento_uri, documento_remoto_id, numero_paginas,
      numero_copias, frente_verso, folhas_necessarias,
      valor_pago, tipo_encadernacao, preco_encadernacao, sync_chave, remoto_id,
      sincronizacao_estado, encadernacao_consumida, espiral_encadernacao, custo_encadernacao
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SINCRONIZADO', ?, ?, ?)`,
    ...valores,
    encadernacaoConsumida,
    espiralEncadernacao,
    custoEncadernacao
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
  if (Platform.OS === 'web') await alinharPedidosComServidor(pedidos);
}

/**
 * Na versão web, o servidor é a fonte de verdade do painel admin: a cópia guardada
 * no navegador é só uma cache. Quando chega a lista completa do servidor, removemos
 * do navegador os pedidos que já lá não existem (apagados ou criados noutro ambiente),
 * em vez de os deixar presos com erros. Pedidos ainda não enviados (sem remoto_id)
 * mantêm-se, para não perder trabalho por enviar.
 */
async function alinharPedidosComServidor(pedidosServidor: PedidoRemoto[]) {
  // Proteção: uma lista vazia pode ser uma resposta anómala; nesse caso não removemos nada.
  if (pedidosServidor.length === 0) return;
  const idsServidor = new Set(pedidosServidor.map((pedido) => pedido.id));
  const locais = await db.getAllAsync<{ id: number; remoto_id: string; documento_uri: string | null }>(
    'SELECT id, remoto_id, documento_uri FROM pedidos WHERE remoto_id IS NOT NULL'
  );
  const obsoletos = locais.filter((pedido) => !idsServidor.has(pedido.remoto_id));
  if (obsoletos.length === 0) return;

  await executarTransacaoLocal(async (transacao) => {
    for (const pedido of obsoletos) {
      await transacao.runAsync('UPDATE movimentos_stock SET pedido_id = NULL WHERE pedido_id = ?', pedido.id);
      await transacao.runAsync('DELETE FROM pagamentos WHERE pedido_id = ?', pedido.id);
      await transacao.runAsync('DELETE FROM pedidos WHERE id = ?', pedido.id);
    }
  });
  for (const pedido of obsoletos) await removerDocumentoWeb(pedido.documento_uri).catch(() => undefined);
  console.info(`Removidos do navegador ${obsoletos.length} pedido(s) que já não existem no servidor.`);
}

let filaSincronizacaoCliente: Promise<void> = Promise.resolve();

const MENSAGEM_PEDIDO_INEXISTENTE = 'Este pedido não existe no servidor (pode ter sido criado noutro ambiente ou removido).';

export function sincronizarPedidosCliente(apenasPedidoId?: number) {
  const sincronizacao = filaSincronizacaoCliente.then(
    () => sincronizarPedidosClienteAgora(apenasPedidoId)
  );
  filaSincronizacaoCliente = sincronizacao.catch(() => undefined);
  return sincronizacao;
}

async function sincronizarPedidosClienteAgora(apenasPedidoId?: number) {
  const apiUrl = obterUrlApi();
  if (!apiUrl) return;

  if (apenasPedidoId === undefined) await sincronizarPedidosPendentes();
  const pedidos = apenasPedidoId === undefined
    ? await db.getAllAsync<Pedido>(
      `SELECT * FROM pedidos
       WHERE remoto_id IS NOT NULL
         AND NOT (sincronizacao_estado = 'ERRO' AND sincronizacao_erro = ?)
       ORDER BY id ASC`,
      MENSAGEM_PEDIDO_INEXISTENTE
    )
    : await db.getAllAsync<Pedido>(
      'SELECT * FROM pedidos WHERE remoto_id IS NOT NULL AND id = ?',
      apenasPedidoId
    );

  for (const pedido of pedidos) {
    if (!pedido.remoto_id) continue;
    const resposta = await fetch(
      `${apiUrl}/orders/${encodeURIComponent(pedido.remoto_id)}/customer-status`
    );
    if (resposta.status === 404) {
      // O pedido já não existe no servidor: fica marcado e os restantes continuam
      // a ser atualizados (antes, um único pedido destes fazia falhar tudo).
      await db.runAsync(
        `UPDATE pedidos SET sincronizacao_estado = 'ERRO', sincronizacao_erro = ? WHERE id = ?`,
        MENSAGEM_PEDIDO_INEXISTENTE,
        pedido.id
      );
      continue;
    }
    if (!resposta.ok) throw new Error(await mensagemErroApi(resposta));
    const remoto = await resposta.json() as EstadoClienteRemoto;
    if (remoto.id !== pedido.remoto_id) {
      throw new Error('O servidor retornou um pedido diferente do solicitado.');
    }

    const guardarEstadoRemoto = async (transacao: typeof db) => {
      for (const pagamento of remoto.payments) {
        const existente = await transacao.getFirstAsync<PagamentoLocalSyncStatus>(
          `SELECT id, comprovativo_uri, comprovativo_nome
           FROM pagamentos
           WHERE remoto_id = ? OR sync_chave = ?
           LIMIT 1`,
          pagamento.id,
          pagamento.externalReference
        );
        const status = estadoPagamentoRemotoParaLocal[pagamento.status];
        if (existente) {
          await transacao.runAsync(
            `UPDATE pagamentos SET
              pedido_id = ?, valor = ?, metodo = ?, referencia = ?, data_criacao = ?,
              tipo = ?, status = ?, comprovativo_nome = ?, data_confirmacao = ?,
              motivo_rejeicao = ?, sync_chave = ?, remoto_id = ?,
              sincronizacao_estado = 'SINCRONIZADO', sincronizacao_erro = NULL
             WHERE id = ?`,
            pedido.id,
            pagamento.amountCents / 100,
            pagamento.method,
            pagamento.reference,
            pagamento.createdAt,
            pagamento.type,
            status,
            pagamento.proofOriginalName ?? existente.comprovativo_nome,
            pagamento.confirmedAt,
            pagamento.rejectionReason,
            pagamento.externalReference,
            pagamento.id,
            existente.id
          );
        } else {
          await transacao.runAsync(
            `INSERT INTO pagamentos (
              pedido_id, valor, metodo, referencia, data_criacao, tipo, status,
              comprovativo_nome, comprovativo_uri, data_confirmacao, motivo_rejeicao,
              sync_chave, remoto_id, sincronizacao_estado, sincronizacao_erro
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 'SINCRONIZADO', NULL)`,
            pedido.id,
            pagamento.amountCents / 100,
            pagamento.method,
            pagamento.reference,
            pagamento.createdAt,
            pagamento.type,
            status,
            pagamento.proofOriginalName,
            pagamento.confirmedAt,
            pagamento.rejectionReason,
            pagamento.externalReference,
            pagamento.id
          );
        }
      }

      const valorPagoRemoto = remoto.payments
        .filter((pagamento) => pagamento.status === 'CONFIRMED')
        .reduce((total, pagamento) => total + pagamento.amountCents, 0) / 100;
      await transacao.runAsync(
        `UPDATE pedidos SET estado = ?, valor_pago = ?, numero = ${SQL_NUMERO_DO_SERVIDOR} WHERE id = ?`,
        estadoRemotoParaLocal[remoto.status],
        valorPagoRemoto,
        remoto.number ?? null,
        remoto.number ?? null,
        pedido.id,
        remoto.number ?? null,
        pedido.id
      );
    };

    await executarTransacaoLocal(guardarEstadoRemoto);
  }
}

type PagamentoLocalSyncStatus = {
  id: number;
  comprovativo_uri: string | null;
  comprovativo_nome: string | null;
};
