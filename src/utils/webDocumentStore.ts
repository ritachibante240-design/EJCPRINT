// Armazenamento de documentos dos pedidos na versão web.
//
// No telemóvel, o documento é copiado para uma pasta e a base SQLite guarda só o caminho.
// No navegador fazemos o mesmo: o ficheiro fica na IndexedDB (que guarda Blobs
// diretamente, sem converter para base64) e a SQLite guarda apenas uma referência
// curta no formato "web-doc:<chave>". Isto evita gravar vários MB de texto na SQLite,
// que era o que tornava a criação de pedidos lenta no PC.

const PREFIXO = 'web-doc:';
const NOME_BD = 'ejcprint-documentos';
const LOJA = 'documentos';

type RegistoDocumento = { blob: Blob; nome: string; criadoEm: string };

export function ehDocumentoWeb(uri: string | null | undefined): uri is string {
  return typeof uri === 'string' && uri.startsWith(PREFIXO);
}

function abrirBd(): Promise<IDBDatabase> {
  return new Promise((resolver, rejeitar) => {
    if (typeof indexedDB === 'undefined') {
      rejeitar(new Error('Este navegador não permite guardar documentos localmente.'));
      return;
    }
    const pedido = indexedDB.open(NOME_BD, 1);
    pedido.onupgradeneeded = () => {
      if (!pedido.result.objectStoreNames.contains(LOJA)) {
        pedido.result.createObjectStore(LOJA);
      }
    };
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rejeitar(pedido.error ?? new Error('Não foi possível abrir o armazenamento de documentos.'));
  });
}

async function executar<T>(
  modo: IDBTransactionMode,
  operacao: (loja: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const bd = await abrirBd();
  try {
    return await new Promise<T>((resolver, rejeitar) => {
      const transacao = bd.transaction(LOJA, modo);
      const pedido = operacao(transacao.objectStore(LOJA));
      let resultado: T;
      pedido.onsuccess = () => {
        resultado = pedido.result;
      };
      transacao.oncomplete = () => resolver(resultado);
      transacao.onerror = () => rejeitar(transacao.error ?? new Error('Falha no armazenamento de documentos.'));
      transacao.onabort = () => rejeitar(transacao.error ?? new Error('Operação de armazenamento cancelada.'));
    });
  } finally {
    bd.close();
  }
}

export async function guardarDocumentoWeb(ficheiro: Blob, nome: string): Promise<string> {
  const chave = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const registo: RegistoDocumento = { blob: ficheiro, nome, criadoEm: new Date().toISOString() };
  await executar('readwrite', (loja) => loja.put(registo, chave));
  return `${PREFIXO}${chave}`;
}

export async function lerDocumentoWeb(uri: string): Promise<{ blob: Blob; nome: string } | null> {
  if (!ehDocumentoWeb(uri)) return null;
  const registo = await executar<RegistoDocumento | undefined>('readonly', (loja) =>
    loja.get(uri.slice(PREFIXO.length)) as IDBRequest<RegistoDocumento | undefined>,
  );
  return registo ? { blob: registo.blob, nome: registo.nome } : null;
}

export async function removerDocumentoWeb(uri: string | null | undefined): Promise<void> {
  if (!ehDocumentoWeb(uri)) return;
  await executar('readwrite', (loja) => loja.delete(uri.slice(PREFIXO.length)));
}
