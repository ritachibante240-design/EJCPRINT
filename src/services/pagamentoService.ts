import { db, executarTransacaoLocal } from '../database/database';
import { sincronizarPagamentoLocal } from './sincronizacaoPagamentoService';
import { obterTokenAdministrador } from './adminAuthService';

// cspell:ignore Metodo
export type MetodoPagamento =
  | 'Dinheiro'
  | 'M-Pesa'
  | 'e-Mola'
  | 'Transferência'
  | 'Outro';

export type TipoPagamento = 'SINAL' | 'SALDO' | 'TOTAL';
export type StatusPagamento = 'PENDENTE' | 'CONFIRMADO' | 'REJEITADO';

export type Pagamento = {
  id: number;
  pedido_id: number;
  valor: number;
  metodo: MetodoPagamento;
  referencia: string | null;
  data_criacao: string;
  tipo: TipoPagamento;
  status: StatusPagamento;
  comprovativo_nome: string | null;
  comprovativo_uri: string | null;
  data_confirmacao: string | null;
  motivo_rejeicao: string | null;
  sync_chave: string | null;
  remoto_id: string | null;
  sincronizacao_estado: 'PENDENTE' | 'SINCRONIZADO';
  sincronizacao_erro: string | null;
};

export type PagamentoPendente = Pagamento & { numero_pedido: string; cliente: string; contacto: string; total_pedido: number; valor_pago: number };

export function determinarTipoPagamento(totalPedido: number, valorPago: number, novoPagamento: number): TipoPagamento {
  const novoTotalPago = valorPago + novoPagamento;
  if (valorPago === 0 && novoTotalPago >= totalPedido) return 'TOTAL';
  if (valorPago === 0) return 'SINAL';
  return 'SALDO';
}

export async function registrarPagamento(
  pedidoId: number,
  valor: number,
  metodo: MetodoPagamento,
  referencia?: string,
  tipo: TipoPagamento = 'TOTAL'
) {
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new Error(
      'O valor do pagamento deve ser maior que zero.'
    );
  }

  await executarTransacaoLocal(async (transacao) => {
    const pedido =
      await transacao.getFirstAsync<{
        id: number;
        numero: string;
        total: number;
        valor_pago: number;
        estado: string;
      }>(
        `
          SELECT
            id,
            numero,
            total,
            valor_pago,
            estado
          FROM pedidos
          WHERE id = ?
        `,
        pedidoId
      );

    if (!pedido) {
      throw new Error(
        'Pedido não encontrado.'
      );
    }

    if (pedido.estado === 'Cancelado') {
      throw new Error(
        'Não é possível receber pagamento de um pedido cancelado.'
      );
    }

    const pagoAtual =
      pedido.valor_pago ?? 0;

    const falta =
      Math.max(
        pedido.total - pagoAtual,
        0
      );

    if (falta <= 0) {
      throw new Error(
        'Este pedido já está totalmente pago.'
      );
    }

    if (valor > falta) {
      throw new Error(
        `O valor máximo a receber é ${falta.toFixed(
          2
        )} MT.`
      );
    }

    const agora =
      new Date().toISOString();

    await transacao.runAsync(
      `
        INSERT INTO pagamentos (
          pedido_id,
          valor,
          metodo,
        referencia,
        data_criacao,
        tipo,
        status,
        data_confirmacao
      )
      VALUES (?, ?, ?, ?, ?, ?, 'CONFIRMADO', ?)
      `,
      pedidoId,
      valor,
      metodo,
      referencia?.trim() || null,
      agora,
      tipo,
      agora
    );

    await transacao.runAsync(
      `
        UPDATE pedidos
        SET valor_pago = valor_pago + ?
        WHERE id = ?
      `,
      valor,
      pedidoId
    );
  });
}

export async function registrarPagamentoDinheiro(pedidoId: number, valor: number, tipo: TipoPagamento) {
  return registrarPagamento(pedidoId, valor, 'Dinheiro', undefined, tipo);
}

export async function enviarPagamento(
  pedidoId: number,
  valor: number,
  metodo: MetodoPagamento,
  tipo: TipoPagamento,
  referencia?: string,
  comprovativoNome?: string,
  comprovativoUri?: string
) {
  if (!Number.isFinite(valor) || valor <= 0) throw new Error('O valor deve ser maior que zero.');
  const pedido = await db.getFirstAsync<{ total: number; valor_pago: number; estado: string }>('SELECT total, valor_pago, estado FROM pedidos WHERE id = ?', pedidoId);
  if (!pedido) throw new Error('Pedido não encontrado.');
  if (pedido.estado === 'Cancelado') throw new Error('Este pedido foi cancelado.');
  const falta = Math.max(pedido.total - pedido.valor_pago, 0);
  if (falta <= 0) throw new Error('Este pedido já está totalmente pago.');
  if (valor > falta) throw new Error(`Faltam apenas ${falta.toFixed(2)} MT.`);
  if (metodo !== 'Dinheiro' && !comprovativoUri) throw new Error('Anexe o comprovativo do pagamento.');
  const pagamentoPendente = await db.getFirstAsync<{ id: number; valor: number }>(
    `SELECT id, valor FROM pagamentos WHERE pedido_id = ? AND status = 'PENDENTE' LIMIT 1`,
    pedidoId
  );
  if (pagamentoPendente) {
    throw new Error('Já existe um pagamento aguardando análise. Aguarde a confirmação antes de enviar outro comprovativo.');
  }
  const resultado = await db.runAsync(
    `INSERT INTO pagamentos (pedido_id, valor, metodo, referencia, data_criacao, tipo, status, comprovativo_nome, comprovativo_uri)
     VALUES (?, ?, ?, ?, ?, ?, 'PENDENTE', ?, ?)`,
    pedidoId, valor, metodo, referencia?.trim() || null, new Date().toISOString(), tipo, comprovativoNome ?? null, comprovativoUri ?? null
  );
  const syncChave = `pagamento-${resultado.lastInsertRowId}-${Date.now()}`;
  await db.runAsync('UPDATE pagamentos SET sync_chave = ? WHERE id = ?', syncChave, resultado.lastInsertRowId);
  const criado = await db.getFirstAsync<Pagamento>('SELECT * FROM pagamentos WHERE id = ?', resultado.lastInsertRowId);
  if (criado) {
    try {
      await sincronizarPagamentoLocal(criado, { propagarErrosDeCliente: true });
    } catch (erro) {
      await db.runAsync('DELETE FROM pagamentos WHERE id = ? AND remoto_id IS NULL', criado.id);
      throw erro;
    }
  }
}

export const enviarPagamentoPendente = enviarPagamento;

export async function confirmarPagamento(id: number) {
  let pagamentoConfirmado: Pagamento | null = null;
  await executarTransacaoLocal(async (transacao) => {
    const pagamento = await transacao.getFirstAsync<Pagamento>('SELECT * FROM pagamentos WHERE id = ?', id);
    if (!pagamento) throw new Error('Pagamento não encontrado.');
    // O painel pode receber uma atualização enquanto o utilizador ainda tem a lista aberta.
    // Nesse caso, tornar a aprovação idempotente evita uma rejeição não tratada ao tocar duas vezes.
    if (pagamento.status !== 'PENDENTE') return;
    const agora = new Date().toISOString();
    await transacao.runAsync("UPDATE pagamentos SET status = 'CONFIRMADO', data_confirmacao = ? WHERE id = ?", agora, id);
    await transacao.runAsync('UPDATE pedidos SET valor_pago = valor_pago + ? WHERE id = ?', pagamento.valor, pagamento.pedido_id);
    await transacao.runAsync("UPDATE pagamentos SET sincronizacao_estado = 'PENDENTE' WHERE id = ?", id);
    pagamentoConfirmado = await transacao.getFirstAsync<Pagamento>('SELECT * FROM pagamentos WHERE id = ?', id);
  });
  if (pagamentoConfirmado) {
    try {
      await sincronizarPagamentoLocal(pagamentoConfirmado, { propagarErros: true });
    } catch (erro) {
      await executarTransacaoLocal(async (transacao) => {
        const atual = await transacao.getFirstAsync<Pagamento>(
          'SELECT * FROM pagamentos WHERE id = ?',
          id
        );
        if (atual?.status !== 'CONFIRMADO') return;
        await transacao.runAsync(
          `UPDATE pagamentos
           SET status = 'PENDENTE', data_confirmacao = NULL, sincronizacao_estado = 'PENDENTE'
           WHERE id = ?`,
          id
        );
        await transacao.runAsync(
          'UPDATE pedidos SET valor_pago = MAX(valor_pago - ?, 0) WHERE id = ?',
          atual.valor,
          atual.pedido_id
        );
      });
      throw new Error(
        `Não foi possível confirmar o pagamento no servidor. Verifique a ligação e tente novamente. ${erro instanceof Error ? erro.message : ''}`.trim()
      );
    }
  }
}

export async function rejeitarPagamento(id: number, motivo: string) {
  if (!motivo.trim()) throw new Error('Selecione ou informe o motivo da reprovação.');
  const result = await db.runAsync("UPDATE pagamentos SET status = 'REJEITADO', motivo_rejeicao = ? WHERE id = ? AND status = 'PENDENTE'", motivo.trim(), id);
  if (result.changes === 0) throw new Error('Pagamento não encontrado ou já analisado.');
  await db.runAsync("UPDATE pagamentos SET sincronizacao_estado = 'PENDENTE' WHERE id = ?", id);
  const rejeitado = await db.getFirstAsync<Pagamento>('SELECT * FROM pagamentos WHERE id = ?', id);
  if (rejeitado) await sincronizarPagamentoLocal(rejeitado);
}

export async function listarPagamentos() {
  return db.getAllAsync<Pagamento & { numero_pedido: string; cliente: string }>(`
    SELECT pg.*, p.numero AS numero_pedido, p.cliente
    FROM pagamentos pg INNER JOIN pedidos p ON p.id = pg.pedido_id
    ORDER BY pg.data_criacao DESC
  `);
}

export async function listarPagamentosPedido(pedidoId: number) {
  return db.getAllAsync<Pagamento>(
    'SELECT * FROM pagamentos WHERE pedido_id = ? ORDER BY data_criacao DESC',
    pedidoId
  );
}

export async function obterPagamentoPendentePedido(pedidoId: number) {
  return db.getFirstAsync<Pagamento>(
    `SELECT * FROM pagamentos WHERE pedido_id = ? AND status = 'PENDENTE' ORDER BY data_criacao DESC LIMIT 1`,
    pedidoId
  );
}

export async function listarPagamentosPendentes() {
  return db.getAllAsync<PagamentoPendente>(`SELECT pg.*, p.numero AS numero_pedido, p.cliente, p.contacto, p.total AS total_pedido, p.valor_pago FROM pagamentos pg INNER JOIN pedidos p ON p.id = pg.pedido_id WHERE pg.status = 'PENDENTE' ORDER BY pg.data_criacao ASC`);
}

export async function contarPagamentosPendentes() {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '');
  if (apiUrl) {
    const token = await obterTokenAdministrador();
    if (!token) throw new Error('Inicie sessão como administrador para consultar pagamentos pendentes.');
    const response = await fetch(`${apiUrl}/payments/pending`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Não foi possível consultar pagamentos pendentes (API ${response.status}).`);
    const pagamentosRemotos: unknown = await response.json();
    if (!Array.isArray(pagamentosRemotos)) throw new Error('Resposta inválida do backend ao consultar pagamentos pendentes.');
    return pagamentosRemotos.length;
  }

  const resultado = await db.getFirstAsync<{ total: number }>("SELECT COUNT(*) AS total FROM pagamentos WHERE status = 'PENDENTE'");
  return resultado?.total ?? 0;
}
