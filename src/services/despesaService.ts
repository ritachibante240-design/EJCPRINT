import { db } from '../database/database';
import { obterTokenAdministrador } from './adminAuthService';

export type TipoSaida =
  | 'COMPRA_STOCK'
  | 'DESPESA_OPERACIONAL'
  | 'OUTRO';

export type Despesa = {
  id: number | string;
  descricao: string;
  categoria: string;
  tipo: TipoSaida;
  valor: number;
  data_criacao: string;
};

type DespesaRemota = {
  id: string;
  description: string;
  category: string;
  type: TipoSaida;
  amountCents: number;
  createdAt: string;
};

function obterUrlApi() {
  const url = process.env.EXPO_PUBLIC_API_URL?.trim();
  return url ? url.replace(/\/$/, '') : null;
}

async function requisitarRemoto<T>(
  path: string,
  init: RequestInit = {},
  obrigatorio = false
): Promise<T | null> {
  const api = obterUrlApi();
  if (!api) {
    if (obrigatorio) throw new Error('Configure a URL do backend para gerir despesas.');
    return null;
  }

  const token = await obterTokenAdministrador();
  if (!token) throw new Error('Inicie sessão como administrador para consultar ou gerir despesas.');

  try {
    const response = await fetch(`${api}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: unknown } | null;
      const message = typeof body?.message === 'string' ? body.message : `API respondeu ${response.status}.`;
      throw new Error(message);
    }
    return await response.json() as T;
  } catch (error) {
    console.warn('[despesaService] falha ao contactar o backend:', error);
    throw error;
  }
}

function normalizarDespesa(remota: DespesaRemota): Despesa {
  return {
    id: remota.id,
    descricao: remota.description,
    categoria: remota.category,
    tipo: remota.type,
    valor: remota.amountCents / 100,
    data_criacao: remota.createdAt,
  };
}

export async function criarDespesa(
  descricao: string,
  categoria: string,
  tipo: TipoSaida,
  valor: number
) {
  if (!['COMPRA_STOCK', 'DESPESA_OPERACIONAL', 'OUTRO'].includes(tipo)) {
    throw new Error('Tipo de saída inválido.');
  }

  if (!Number.isFinite(valor) || valor <= 0) {
    throw new Error('Valor inválido.');
  }

  const valorCentavos = Math.round(
    (valor + Number.EPSILON) * 100
  );

  if (!Number.isSafeInteger(valorCentavos) || valorCentavos <= 0) {
    throw new Error('Valor inválido.');
  }

  const criada = await requisitarRemoto<DespesaRemota>('/inventory/expenses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      externalReference: `expense-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      description: descricao.trim(),
      category: categoria.trim(),
      type: tipo,
      amountCents: valorCentavos,
    }),
  }, true);

  if (!criada) throw new Error('O backend não confirmou a despesa.');
  return normalizarDespesa(criada);
}

export async function listarDespesas() {
  const remotas = await requisitarRemoto<DespesaRemota[]>('/inventory/expenses');
  if (remotas) return remotas.map(normalizarDespesa);

  return await db.getAllAsync<Despesa>(
    `
      SELECT *
      FROM despesas
      ORDER BY id DESC
    `
  );
}

export async function obterTotalDespesas() {
  const resumoRemoto = await requisitarRemoto<{ totalSaidasCents: number }>('/inventory/expenses/summary');
  if (resumoRemoto) return resumoRemoto.totalSaidasCents / 100;

  const resultado = await db.getFirstAsync<{
    totalCentavos: number;
  }>(`
    SELECT COALESCE(SUM(ROUND(valor * 100)), 0) AS totalCentavos
    FROM despesas
  `);

  return Math.round(resultado?.totalCentavos ?? 0) / 100;
}

export type ResumoSaidas = {
  comprasStock: number;
  despesasOperacionais: number;
  outros: number;
  totalSaidas: number;
};

export async function obterResumoSaidas(): Promise<ResumoSaidas> {
  const resumoRemoto = await requisitarRemoto<{
    comprasStockCents: number;
    despesasOperacionaisCents: number;
    outrosCents: number;
    totalSaidasCents: number;
  }>('/inventory/expenses/summary');
  if (resumoRemoto) {
    return {
      comprasStock: resumoRemoto.comprasStockCents / 100,
      despesasOperacionais: resumoRemoto.despesasOperacionaisCents / 100,
      outros: resumoRemoto.outrosCents / 100,
      totalSaidas: resumoRemoto.totalSaidasCents / 100,
    };
  }

  const resultado = await db.getFirstAsync<{
    comprasStockCentavos: number;
    despesasOperacionaisCentavos: number;
    outrosCentavos: number;
    totalSaidasCentavos: number;
  }>(`
    SELECT
      COALESCE(SUM(CASE WHEN tipo = 'COMPRA_STOCK' THEN ROUND(valor * 100) ELSE 0 END), 0) AS comprasStockCentavos,
      COALESCE(SUM(CASE WHEN tipo = 'DESPESA_OPERACIONAL' THEN ROUND(valor * 100) ELSE 0 END), 0) AS despesasOperacionaisCentavos,
      COALESCE(SUM(CASE WHEN tipo = 'OUTRO' THEN ROUND(valor * 100) ELSE 0 END), 0) AS outrosCentavos,
      COALESCE(SUM(ROUND(valor * 100)), 0) AS totalSaidasCentavos
    FROM despesas
  `);

  return {
    comprasStock: Math.round(resultado?.comprasStockCentavos ?? 0) / 100,
    despesasOperacionais:
      Math.round(resultado?.despesasOperacionaisCentavos ?? 0) / 100,
    outros: Math.round(resultado?.outrosCentavos ?? 0) / 100,
    totalSaidas: Math.round(resultado?.totalSaidasCentavos ?? 0) / 100,
  };
}