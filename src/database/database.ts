import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let filaEscritas: Promise<void> = Promise.resolve();

function executarNaFilaDeEscrita<T>(operacao: () => Promise<T>): Promise<T> {
  const anterior = filaEscritas;
  let libertar!: () => void;
  filaEscritas = new Promise<void>((resolver) => {
    libertar = resolver;
  });

  return (async () => {
    await anterior;
    try {
      return await operacao();
    } finally {
      libertar();
    }
  })();
}

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('ejcprint.db')
      .then((database) => {
        dbInstance = database;
        return database;
      })
      .catch((error) => {
        dbPromise = null;
        throw error;
      });
  }
  return dbPromise;
}

export function executarTransacaoLocal(
  operacao: (transacao: SQLite.SQLiteDatabase) => Promise<void>
) {
  return executarNaFilaDeEscrita(async () => {
    const database = await getDb();
    if (Platform.OS === 'web') {
      return database.withTransactionAsync(() => operacao(database));
    }
    return database.withExclusiveTransactionAsync(operacao);
  });
}

export const db: SQLite.SQLiteDatabase = new Proxy({} as SQLite.SQLiteDatabase, {
  get(_target, prop: string | symbol) {
    if (prop === 'runAsync' || prop === 'execAsync') {
      return (...args: any[]) => executarNaFilaDeEscrita(async () => {
        const database = await getDb();
        const metodo = (database as any)[prop];
        return metodo.apply(database, args);
      });
    }

    if (prop === 'closeAsync') {
      return async () => {
        if (dbInstance) {
          const inst = dbInstance;
          dbInstance = null;
          dbPromise = null;
          await inst.closeAsync();
        }
      };
    }

    if (dbInstance && prop in dbInstance) {
      const val = (dbInstance as any)[prop];
      return typeof val === 'function' ? val.bind(dbInstance) : val;
    }

    return async (...args: any[]) => {
      const database = await getDb();
      const val = (database as any)[prop];
      if (typeof val === 'function') {
        return val.apply(database, args);
      }
      return val;
    };
  },
});

export async function iniciarBancoDados() {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT UNIQUE,
      cliente TEXT NOT NULL,
      contacto TEXT NOT NULL,
      servico TEXT NOT NULL,
      preco_unitario REAL NOT NULL,
      quantidade INTEGER NOT NULL,
      total REAL NOT NULL,
      documento_nome TEXT,
      documento_uri TEXT,
      estado TEXT NOT NULL DEFAULT 'Pedido recebido',
      data_criacao TEXT NOT NULL,
      numero_paginas INTEGER NOT NULL DEFAULT 1,
      numero_copias INTEGER NOT NULL DEFAULT 1,
      frente_verso INTEGER NOT NULL DEFAULT 0,
      folhas_necessarias INTEGER NOT NULL DEFAULT 1,
      stock_descontado INTEGER NOT NULL DEFAULT 0,
      sync_chave TEXT,
      remoto_id TEXT,
      sincronizacao_estado TEXT NOT NULL DEFAULT 'PENDENTE',
      sincronizacao_erro TEXT
    );

    CREATE TABLE IF NOT EXISTS despesas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      descricao TEXT NOT NULL,
      categoria TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'DESPESA_OPERACIONAL',
      valor REAL NOT NULL,
      data_criacao TEXT NOT NULL
    );

 CREATE TABLE IF NOT EXISTS stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL,
  unidade TEXT NOT NULL,
  quantidade REAL NOT NULL DEFAULT 0,
  stock_minimo REAL NOT NULL DEFAULT 0,
  data_atualizacao TEXT NOT NULL
);

    CREATE TABLE IF NOT EXISTS perdas_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_id INTEGER NOT NULL,
      material TEXT NOT NULL,
      quantidade REAL NOT NULL,
      unidade TEXT NOT NULL,
      motivo TEXT NOT NULL,
      data_criacao TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS movimentos_stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stock_id INTEGER NOT NULL,
  pedido_id INTEGER,
  tipo TEXT NOT NULL,
  quantidade REAL NOT NULL,
  motivo TEXT,
  data_criacao TEXT NOT NULL,
  FOREIGN KEY (stock_id) REFERENCES stock(id),
  FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
);

    CREATE TABLE IF NOT EXISTS compras_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_id INTEGER NOT NULL,
      descricao TEXT NOT NULL,
      quantidade REAL NOT NULL,
      valor_total REAL NOT NULL,
      data_criacao TEXT NOT NULL,
      FOREIGN KEY (stock_id) REFERENCES stock(id)
    );

    CREATE TABLE IF NOT EXISTS pagamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL,
  valor REAL NOT NULL,
  metodo TEXT NOT NULL,
  referencia TEXT,
  data_criacao TEXT NOT NULL,
  sync_chave TEXT,
  remoto_id TEXT,
  sincronizacao_estado TEXT NOT NULL DEFAULT 'PENDENTE',
  sincronizacao_erro TEXT,

  FOREIGN KEY (pedido_id)
    REFERENCES pedidos(id)
);

    CREATE TABLE IF NOT EXISTS migracoes (
      chave TEXT PRIMARY KEY,
      data_execucao TEXT NOT NULL
    );
  `);

  try {
    await db.execAsync(`
      ALTER TABLE stock
      ADD COLUMN custo_medio REAL NOT NULL DEFAULT 0;
    `);
  } catch {
    // A coluna já existe.
  }

  try {
    await db.execAsync(`
      ALTER TABLE pedidos
      ADD COLUMN valor_pago REAL NOT NULL DEFAULT 0;
    `);
  } catch {
    // Já existe.
  }

  for (const migration of [
    `ALTER TABLE pagamentos ADD COLUMN tipo TEXT NOT NULL DEFAULT 'TOTAL'`,
    `ALTER TABLE pagamentos ADD COLUMN status TEXT NOT NULL DEFAULT 'PENDENTE'`,
    `ALTER TABLE pagamentos ADD COLUMN comprovativo_nome TEXT`,
    `ALTER TABLE pagamentos ADD COLUMN comprovativo_uri TEXT`,
    `ALTER TABLE pagamentos ADD COLUMN data_confirmacao TEXT`,
    `ALTER TABLE pagamentos ADD COLUMN motivo_rejeicao TEXT`,
    `ALTER TABLE pagamentos ADD COLUMN sync_chave TEXT`,
    `ALTER TABLE pagamentos ADD COLUMN remoto_id TEXT`,
    `ALTER TABLE pagamentos ADD COLUMN sincronizacao_estado TEXT NOT NULL DEFAULT 'PENDENTE'`,
    `ALTER TABLE pagamentos ADD COLUMN sincronizacao_erro TEXT`,
  ]) {
    try { await db.execAsync(migration); } catch { /* coluna já existe */ }
  }

  const colunasAntesDaMigracao = await db.getAllAsync<{
    name: string;
  }>('PRAGMA table_info(pedidos)');
  const nomesAntesDaMigracao = new Set(
    colunasAntesDaMigracao.map((coluna) => coluna.name)
  );

  try {
    await db.execAsync(`
      ALTER TABLE pedidos
      ADD COLUMN numero_paginas INTEGER NOT NULL DEFAULT 1;
    `);
  } catch {
    // A coluna já existe.
  }

  try {
    await db.execAsync(`
      ALTER TABLE pedidos
      ADD COLUMN numero_copias INTEGER NOT NULL DEFAULT 1;
    `);
  } catch {
    // A coluna já existe.
  }

  try {
    await db.execAsync(`
      ALTER TABLE pedidos
      ADD COLUMN frente_verso INTEGER NOT NULL DEFAULT 0;
    `);
  } catch {
    // A coluna já existe.
  }

  try {
    await db.execAsync(`
      ALTER TABLE pedidos
      ADD COLUMN folhas_necessarias INTEGER NOT NULL DEFAULT 1;
    `);
  } catch {
    // A coluna já existe.
  }

  if (!nomesAntesDaMigracao.has('numero_paginas')) {
    const colunaLegada = nomesAntesDaMigracao.has('paginas')
      ? 'paginas'
      : 'quantidade';

    await db.execAsync(`
      UPDATE pedidos
      SET numero_paginas = MAX(
        CAST(ROUND(${colunaLegada}) AS INTEGER),
        1
      );
    `);
  }

  if (
    !nomesAntesDaMigracao.has('numero_copias') &&
    nomesAntesDaMigracao.has('copias')
  ) {
    await db.execAsync(`
      UPDATE pedidos
      SET numero_copias = MAX(CAST(ROUND(copias) AS INTEGER), 1);
    `);
  }

  if (!nomesAntesDaMigracao.has('folhas_necessarias')) {
    await db.execAsync(`
      UPDATE pedidos
      SET folhas_necessarias =
        CASE
          WHEN frente_verso = 1
            THEN ((numero_paginas + 1) / 2) * numero_copias
          ELSE numero_paginas * numero_copias
        END;
    `);
  }

  try {
    await db.execAsync(`
      ALTER TABLE pedidos
      ADD COLUMN stock_descontado INTEGER NOT NULL DEFAULT 0;
    `);
  } catch {
    // A coluna já existe.
  }

  try {
    await db.execAsync(`
      ALTER TABLE pedidos
      ADD COLUMN custo_papel REAL NOT NULL DEFAULT 0;
    `);
  } catch {
    // A coluna já existe.
  }

  try {
    await db.execAsync(`
      ALTER TABLE pedidos
      ADD COLUMN custo_papel_unitario REAL NOT NULL DEFAULT 0;
    `);
  } catch {
    // A coluna já existe.
  }

  try {
    await db.execAsync(`
      ALTER TABLE pedidos
      ADD COLUMN custo_tinta REAL NOT NULL DEFAULT 0;
    `);
  } catch {
    // A coluna já existe.
  }

  try {
    await db.execAsync(`
      ALTER TABLE pedidos
      ADD COLUMN custo_tinta_por_pagina REAL NOT NULL DEFAULT 0;
    `);
  } catch {
    // A coluna já existe.
  }

  const colunasPerdas = await db.getAllAsync<{
    name: string;
  }>('PRAGMA table_info(perdas_stock)');
  const nomesColunasPerdas = new Set(
    colunasPerdas.map((coluna) => coluna.name)
  );

  if (!nomesColunasPerdas.has('material')) {
    await db.execAsync(`
      ALTER TABLE perdas_stock
      ADD COLUMN material TEXT NOT NULL DEFAULT 'Material';
    `);
    await db.execAsync(`
      UPDATE perdas_stock
      SET material = COALESCE(
        (
          SELECT nome
          FROM stock
          WHERE stock.id = perdas_stock.stock_id
        ),
        'Material'
      );
    `);
  }

  if (!nomesColunasPerdas.has('unidade')) {
    await db.execAsync(`
      ALTER TABLE perdas_stock
      ADD COLUMN unidade TEXT NOT NULL DEFAULT '';
    `);
    await db.execAsync(`
      UPDATE perdas_stock
      SET unidade = COALESCE(
        (
          SELECT unidade
          FROM stock
          WHERE stock.id = perdas_stock.stock_id
        ),
        ''
      );
    `);
  }

  const colunasDespesas = await db.getAllAsync<{
    name: string;
  }>('PRAGMA table_info(despesas)');
  const nomesColunasDespesas = new Set(
    colunasDespesas.map((coluna) => coluna.name)
  );

  if (!nomesColunasDespesas.has('tipo')) {
    await db.execAsync(`
      ALTER TABLE despesas
      ADD COLUMN tipo TEXT NOT NULL DEFAULT 'DESPESA_OPERACIONAL';
    `);
  }

  const papelA4 = await db.getFirstAsync<{ id: number }>(
    `
      SELECT id
      FROM stock
      WHERE LOWER(TRIM(nome)) = LOWER(?)
      ORDER BY id ASC
      LIMIT 1
    `,
    'Papel A4'
  );

  if (papelA4) {
    await executarTransacaoLocal(async (transacao) => {
      const duplicados = await transacao.getAllAsync<{
        id: number;
      }>(
        `
          SELECT id
          FROM stock
          WHERE LOWER(TRIM(nome)) IN (LOWER(?), LOWER(?))
            AND id != ?
        `,
        'Papel',
        'Resma',
        papelA4.id
      );

      for (const duplicado of duplicados) {
        await transacao.runAsync(
          `
            UPDATE movimentos_stock
            SET stock_id = ?
            WHERE stock_id = ?
          `,
          papelA4.id,
          duplicado.id
        );

        await transacao.runAsync(
          `
            UPDATE perdas_stock
            SET stock_id = ?
            WHERE stock_id = ?
          `,
          papelA4.id,
          duplicado.id
        );

        await transacao.runAsync(
          'DELETE FROM stock WHERE id = ?',
          duplicado.id
        );
      }

      await transacao.runAsync(
        `
          UPDATE stock
          SET categoria = ?,
              unidade = ?
          WHERE id = ?
        `,
        'Papel',
        'folhas',
        papelA4.id
      );
    });
  } else {
    await db.runAsync(
      `
        INSERT INTO stock (
          nome,
          categoria,
          unidade,
          quantidade,
          stock_minimo,
          data_atualizacao
        )
        VALUES (?, ?, ?, 0, 0, ?)
      `,
      'Papel A4',
      'Papel',
      'folhas',
      new Date().toISOString()
    );
  }

  try { await db.execAsync(`ALTER TABLE pedidos ADD COLUMN tipo_encadernacao TEXT NOT NULL DEFAULT 'SEM_ENCADERNACAO'`); } catch {}
  try { await db.execAsync(`ALTER TABLE pedidos ADD COLUMN preco_encadernacao REAL NOT NULL DEFAULT 0`); } catch {}
  try { await db.execAsync(`ALTER TABLE pedidos ADD COLUMN sync_chave TEXT`); } catch {}
  try { await db.execAsync(`ALTER TABLE pedidos ADD COLUMN remoto_id TEXT`); } catch {}
  try { await db.execAsync(`ALTER TABLE pedidos ADD COLUMN sincronizacao_estado TEXT NOT NULL DEFAULT 'PENDENTE'`); } catch {}
  try { await db.execAsync(`ALTER TABLE pedidos ADD COLUMN sincronizacao_erro TEXT`); } catch {}
  try { await db.execAsync(`ALTER TABLE pedidos ADD COLUMN documento_remoto_id TEXT`); } catch {}

  const chaveMigracao = 'MIGRAR_PAGAMENTOS_ANTIGOS_V1';
  const migracao = await db.getFirstAsync<{ chave: string }>('SELECT chave FROM migracoes WHERE chave = ?', chaveMigracao);
  if (!migracao) {
    const antigos = await db.getAllAsync<{ id: number; total: number; valor_pago: number }>('SELECT id, total, valor_pago FROM pedidos WHERE valor_pago > 0');
    const agora = new Date().toISOString();
    for (const pedido of antigos) {
      const existente = await db.getFirstAsync<{ total: number }>("SELECT COALESCE(SUM(valor), 0) AS total FROM pagamentos WHERE pedido_id = ? AND status = 'CONFIRMADO'", pedido.id);
      const faltaMigrar = pedido.valor_pago - (existente?.total ?? 0);
      if (faltaMigrar > 0) {
        await db.runAsync(`INSERT INTO pagamentos (pedido_id, valor, metodo, referencia, tipo, status, comprovativo_nome, comprovativo_uri, data_criacao, data_confirmacao) VALUES (?, ?, ?, ?, ?, 'CONFIRMADO', NULL, NULL, ?, ?)`, pedido.id, faltaMigrar, 'Outro', 'Pagamento anterior à atualização', pedido.valor_pago >= pedido.total ? 'TOTAL' : 'SINAL', agora, agora);
      }
    }
    await db.runAsync('INSERT INTO migracoes (chave, data_execucao) VALUES (?, ?)', chaveMigracao, agora);
  }

  console.log('Banco de dados EJC Print iniciado.');
}
