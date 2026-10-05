#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';

function printUsage() {
  console.log(`Uso:
  node scripts/migrate-local-db.mjs --db "caminho/para/ejcprint.db" --api "https://dominio/api" --token "ADMIN_TOKEN"

  Também pode usar variáveis de ambiente:
  LOCAL_SQLITE_DB
  EXPO_PUBLIC_API_URL (ou API_URL)
  ADMIN_TOKEN
`);
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    result[key] = value;
  }
  return result;
}

async function requestJson(url, token, payload) {
  const response = await fetch(url, {
    method: payload?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(payload?.headers ?? {}),
    },
    body: payload?.body ?? undefined,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${text || 'sem detalhe'}`);
  }

  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = args.db ?? process.env.LOCAL_SQLITE_DB;
  const rawApiUrl = args.api ?? process.env.EXPO_PUBLIC_API_URL ?? process.env.API_URL;
  const token = args.token ?? process.env.ADMIN_TOKEN;

  if (!dbPath) {
    printUsage();
    process.exit(1);
  }

  if (!rawApiUrl) {
    console.error('Falta a URL do backend. Use --api ou EXPO_PUBLIC_API_URL / API_URL.');
    process.exit(1);
  }

  if (!token) {
    console.error('Falta o token admin. Use --token ou ADMIN_TOKEN.');
    process.exit(1);
  }

  const apiUrl = rawApiUrl.replace(/\/$/, '');

  let db;
  try {
    db = new DatabaseSync(dbPath);
  } catch (error) {
    console.error('Não foi possível abrir a base SQLite local:', error.message ?? error);
    process.exit(1);
  }

  try {
    const stockRows = db.prepare(`
      SELECT id, nome, categoria, unidade, quantidade, stock_minimo, custo_medio
      FROM stock
      ORDER BY id ASC
    `).all();

    const stockById = new Map(stockRows.map((row) => [row.id, row]));

    let stockImported = 0;

    for (const item of stockRows) {
      const payload = {
        externalReference: `local-stock:${item.id}`,
        name: String(item.nome ?? '').trim(),
        category: String(item.categoria ?? '').trim(),
        unit: String(item.unidade ?? '').trim(),
        quantity: Number(item.quantidade ?? 0),
        minimumQuantity: Number(item.stock_minimo ?? 0),
      };

      if (!payload.name || !payload.category || !payload.unit) {
        console.warn(`Ignorou material inválido (id=${item.id}).`);
        continue;
      }

      try {
        const result = await requestJson(`${apiUrl}/inventory/items`, token, {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        if (result && typeof result === 'object') {
          stockImported += 1;
          console.log(`Stock importado: ${payload.name} (${item.id})`);
        }
      } catch (error) {
        console.warn(`Erro ao importar stock ${payload.name}:`, error.message ?? error);
      }
    }

    const expenseRows = db.prepare(`
      SELECT id, descricao, categoria, tipo, valor, data_criacao
      FROM despesas
      ORDER BY id ASC
    `).all();

    let expensesImported = 0;
    for (const expense of expenseRows) {
      const payload = {
        externalReference: `local-expense:${expense.id}`,
        description: String(expense.descricao ?? '').trim(),
        category: String(expense.categoria ?? '').trim(),
        type: String(expense.tipo ?? 'DESPESA_OPERACIONAL'),
        amountCents: Math.max(0, Math.round((Number(expense.valor ?? 0) * 100))),
      };

      if (!payload.description || !payload.category || payload.amountCents <= 0) {
        console.warn(`Ignorou despesa inválida (id=${expense.id}).`);
        continue;
      }

      try {
        const result = await requestJson(`${apiUrl}/inventory/expenses`, token, {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        if (result && typeof result === 'object') {
          expensesImported += 1;
          console.log(`Despesa importada: ${payload.description} (${expense.id})`);
        }
      } catch (error) {
        console.warn(`Erro ao importar despesa ${payload.description}:`, error.message ?? error);
      }
    }

    console.log('\nResumo da migração local:');
    console.log(`- stock: ${stockImported}`);
    console.log(`- despesas: ${expensesImported}`);
    console.log(`- ficheiro: ${dbPath}`);
    console.log(`- api: ${apiUrl}`);
    console.log('\nNota: este passo importa os dados históricos do SQLite para o backend e mantém o SQLite local como fallback até à validação final.');
  } finally {
    db?.close();
  }
}

main().catch((error) => {
  console.error('Erro na migração:', error.message ?? error);
  process.exit(1);
});
