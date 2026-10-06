import { db } from '../database/database';
import { obterTokenAdministrador } from './adminAuthService';

function obterUrlApi() {
  const url = process.env.EXPO_PUBLIC_API_URL?.trim();
  return url ? url.replace(/\/$/, '') : null;
}

async function fetchRemoto<T>(path: string): Promise<T | null> {
  const api = obterUrlApi();
  if (!api) return null;

  const token = await obterTokenAdministrador();
  if (!token) throw new Error('Inicie sessão como administrador para consultar o caixa.');

  try {
    const resposta = await fetch(`${api}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!resposta.ok) {
      throw new Error(`HTTP ${resposta.status}`);
    }

    return (await resposta.json()) as T;
  } catch (error) {
    console.warn('[caixaService] falha ao contactar o backend:', error);
    throw error instanceof Error ? error : new Error('Não foi possível consultar o caixa no backend.');
  }
}

export type ResumoCaixa = {
  entradas: number;
  saidas: number;
  saldo: number;
  porReceber: number;
};

export type MovimentoCaixa = {
  id: string;
  tipo: 'ENTRADA' | 'SAIDA';
  descricao: string;
  detalhe: string;
  valor: number;
  data: string;
};

export async function obterResumoCaixa(): Promise<ResumoCaixa> {
  const resumoRemoto = await fetchRemoto<{ entradasCents: number; saidasCents: number; saldoCents: number; porReceberCents: number }>('/inventory/cash/summary');
  if (resumoRemoto) {
    return {
      entradas: resumoRemoto.entradasCents / 100,
      saidas: resumoRemoto.saidasCents / 100,
      saldo: resumoRemoto.saldoCents / 100,
      porReceber: resumoRemoto.porReceberCents / 100,
    };
  }

  const pagamentos = await db.getFirstAsync<{ recebido: number }>("SELECT COALESCE(SUM(valor), 0) AS recebido FROM pagamentos WHERE status = 'CONFIRMADO'");
  const pendentes = await db.getFirstAsync<{ porReceber: number }>("SELECT COALESCE(SUM(CASE WHEN estado != 'Cancelado' THEN MAX(total - valor_pago, 0) ELSE 0 END), 0) AS porReceber FROM pedidos");
  const despesas = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(valor), 0) AS total FROM despesas'
  );
  const entradas = pagamentos?.recebido ?? 0;
  const saidas = despesas?.total ?? 0;
  return { entradas, saidas, saldo: entradas - saidas, porReceber: pendentes?.porReceber ?? 0 };
}

export async function listarMovimentosCaixa(): Promise<MovimentoCaixa[]> {
  const movimentosRemotos = await fetchRemoto<Array<{ id: string; tipo: 'ENTRADA' | 'SAIDA'; descricao: string; detalhe: string; amountCents: number; date: string }>>('/inventory/cash/movements');
  if (movimentosRemotos) {
    return movimentosRemotos.map((item) => ({
      id: item.id,
      tipo: item.tipo,
      descricao: item.descricao,
      detalhe: item.detalhe,
      valor: item.amountCents / 100,
      data: item.date,
    }));
  }

  const entradas = await db.getAllAsync<{ id: number; numero: string | null; cliente: string; valor: number; metodo: string; tipo: string; data_confirmacao: string | null; data_criacao: string }>(`SELECT pg.id, p.numero, p.cliente, pg.valor, pg.metodo, pg.tipo, pg.data_confirmacao, pg.data_criacao FROM pagamentos pg INNER JOIN pedidos p ON p.id = pg.pedido_id WHERE pg.status = 'CONFIRMADO' ORDER BY COALESCE(pg.data_confirmacao, pg.data_criacao) DESC`);
  const saidas = await db.getAllAsync<{
    id: number; descricao: string; tipo: string; categoria: string; valor: number; data_criacao: string;
  }>(`SELECT id, descricao, tipo, categoria, valor, data_criacao FROM despesas`);

  const movimentos: MovimentoCaixa[] = [
    ...entradas.map((item) => ({
      id: `entrada-${item.id}`, tipo: 'ENTRADA' as const,
      descricao: item.numero ?? 'Pedido', detalhe: `${item.tipo} • ${item.metodo} • ${item.cliente}`,
      valor: item.valor, data: item.data_confirmacao ?? item.data_criacao,
    })),
    ...saidas.map((item) => ({
      id: `saida-${item.id}`, tipo: 'SAIDA' as const,
      descricao: item.descricao,
      detalhe: item.tipo === 'COMPRA_STOCK' ? `Compra de material • ${item.categoria}` : item.tipo === 'DESPESA_OPERACIONAL' ? `Despesa • ${item.categoria}` : `Outra saída • ${item.categoria}`,
      valor: item.valor, data: item.data_criacao,
    })),
  ];

  return movimentos.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
}

