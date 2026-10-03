import { db } from '../database/database';

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

