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
  if (!token) return null;

  try {
    const resposta = await fetch(`${api}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!resposta.ok) {
      throw new Error(`HTTP ${resposta.status}`);
    }

    return (await resposta.json()) as T;
  } catch (error) {
    console.warn('[relatorioService] fallback para SQLite:', error);
    return null;
  }
}

export type PeriodoRelatorio = 'HOJE' | 'MES' | 'GERAL';
export type ResumoRelatorio = { valorPedidos: number; recebido: number; porReceber: number; saidas: number; saldoMovimentos: number; totalPedidos: number; entregues: number; cancelados: number };

function inicioPeriodo(periodo: PeriodoRelatorio) {
  if (periodo === 'GERAL') return null;
  const agora = new Date();
  return new Date(agora.getFullYear(), periodo === 'HOJE' ? agora.getMonth() : agora.getMonth(), periodo === 'HOJE' ? agora.getDate() : 1).toISOString();
}

export async function obterResumoRelatorio(periodo: PeriodoRelatorio): Promise<ResumoRelatorio> {
  const resumoRemoto = await fetchRemoto<{ valorPedidosCents: number; recebidoCents: number; porReceberCents: number; saidasCents: number; saldoMovimentosCents: number; totalPedidos: number; entregues: number; cancelados: number }>(`/inventory/reports?period=${periodo}`);
  if (resumoRemoto) {
    return {
      valorPedidos: resumoRemoto.valorPedidosCents / 100,
      recebido: resumoRemoto.recebidoCents / 100,
      porReceber: resumoRemoto.porReceberCents / 100,
      saidas: resumoRemoto.saidasCents / 100,
      saldoMovimentos: resumoRemoto.saldoMovimentosCents / 100,
      totalPedidos: resumoRemoto.totalPedidos,
      entregues: resumoRemoto.entregues,
      cancelados: resumoRemoto.cancelados,
    };
  }

  const inicio = inicioPeriodo(periodo);
  const filtro = inicio ? ' AND data_criacao >= ?' : '';
  const pedidos = await db.getFirstAsync<any>(`SELECT COALESCE(SUM(CASE WHEN estado != 'Cancelado' THEN total ELSE 0 END),0) AS valorPedidos, COALESCE(SUM(CASE WHEN estado != 'Cancelado' THEN valor_pago ELSE 0 END),0) AS recebido, COALESCE(SUM(CASE WHEN estado != 'Cancelado' AND total > valor_pago THEN total - valor_pago ELSE 0 END),0) AS porReceber, COUNT(*) AS totalPedidos, COALESCE(SUM(CASE WHEN estado = 'Entregue' THEN 1 ELSE 0 END),0) AS entregues, COALESCE(SUM(CASE WHEN estado = 'Cancelado' THEN 1 ELSE 0 END),0) AS cancelados FROM pedidos WHERE 1=1${filtro}`, ...(inicio ? [inicio] : []));
  const despesas = await db.getFirstAsync<{ total: number }>(`SELECT COALESCE(SUM(valor),0) AS total FROM despesas ${inicio ? 'WHERE data_criacao >= ?' : ''}`, ...(inicio ? [inicio] : []));
  const recebido = pedidos?.recebido ?? 0; const saidas = despesas?.total ?? 0;
  return { valorPedidos: pedidos?.valorPedidos ?? 0, recebido, porReceber: pedidos?.porReceber ?? 0, saidas, saldoMovimentos: recebido - saidas, totalPedidos: pedidos?.totalPedidos ?? 0, entregues: pedidos?.entregues ?? 0, cancelados: pedidos?.cancelados ?? 0 };
}
