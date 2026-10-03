import { db } from '../database/database';

export type TipoSaida =
  | 'COMPRA_STOCK'
  | 'DESPESA_OPERACIONAL'
  | 'OUTRO';

export type Despesa = {
  id: number;
  descricao: string;
  categoria: string;
  tipo: TipoSaida;
  valor: number;
  data_criacao: string;
};

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

  await db.runAsync(
    `
      INSERT INTO despesas (
        descricao,
        categoria,
        tipo,
        valor,
        data_criacao
      )
      VALUES (?, ?, ?, ?, ?)
    `,
    descricao,
    categoria,
    tipo,
    valorCentavos / 100,
    new Date().toISOString()
  );
}

export async function listarDespesas() {
  return await db.getAllAsync<Despesa>(
    `
      SELECT *
      FROM despesas
      ORDER BY id DESC
    `
  );
}

export async function obterTotalDespesas() {
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