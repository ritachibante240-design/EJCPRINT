// Controlo de separadores na versão web.
//
// No navegador, a base SQLite local fica num ficheiro (OPFS) que só pode estar
// aberto num separador de cada vez. Se a app for aberta numa segunda janela, a
// abertura falha com "Invalid VFS state" / "NoModificationAllowedError".
//
// Para isso nunca acontecer:
//  - antes de abrir a base, cada separador tenta obter um bloqueio exclusivo
//    (Web Locks API) que mantém enquanto estiver aberto;
//  - se outro separador já o tiver, a app mostra "aberta noutra janela" com o
//    botão "Usar aqui";
//  - "Usar aqui" pede ao outro separador (via BroadcastChannel) que liberte a base.
//    Esse separador recarrega-se em modo "cedido" (sem abrir a base), o que
//    termina o worker do SQLite e liberta o ficheiro, e este separador fica com ela.

const NOME_BLOQUEIO = 'ejcprint-base-local';
const NOME_CANAL = 'ejcprint-separadores';
const CHAVE_CEDIDO = 'ejcprint-separador-cedido';

type MensagemCanal = { tipo: 'libertar' };

function webLocksDisponivel() {
  return typeof navigator !== 'undefined' && !!navigator.locks && typeof navigator.locks.request === 'function';
}

function criarCanal(): BroadcastChannel | null {
  return typeof BroadcastChannel === 'function' ? new BroadcastChannel(NOME_CANAL) : null;
}

let canal: BroadcastChannel | null = null;
let bloqueioObtido = false;

function manterBloqueio(): Promise<void> {
  // O bloqueio fica ativo até a página ser fechada ou recarregada.
  return new Promise<void>(() => undefined);
}

function ouvirPedidosParaLibertar() {
  canal ??= criarCanal();
  if (!canal) return;
  canal.onmessage = (evento: MessageEvent<MensagemCanal>) => {
    if (evento.data?.tipo !== 'libertar' || !bloqueioObtido) return;
    try {
      sessionStorage.setItem(CHAVE_CEDIDO, '1');
    } catch {
      // Sem sessionStorage o separador volta a pedir a base ao recarregar; o outro já a terá.
    }
    window.location.reload();
  };
}

/** Indica se este separador entregou a app a outra janela e não deve abrir a base. */
export function separadorFoiCedido(): boolean {
  try {
    return sessionStorage.getItem(CHAVE_CEDIDO) === '1';
  } catch {
    return false;
  }
}

/**
 * Tenta reservar a base local para este separador sem esperar.
 * Devolve false se outra janela da EJC Print já estiver a usá-la.
 */
export async function reservarBaseLocal(): Promise<boolean> {
  if (!webLocksDisponivel()) return true;
  if (bloqueioObtido) return true;

  const obtido = await new Promise<boolean>((resolver) => {
    navigator.locks
      .request(NOME_BLOQUEIO, { mode: 'exclusive', ifAvailable: true }, async (bloqueio) => {
        if (!bloqueio) {
          resolver(false);
          return;
        }
        resolver(true);
        await manterBloqueio();
      })
      .catch(() => resolver(true));
  });

  if (obtido) {
    bloqueioObtido = true;
    ouvirPedidosParaLibertar();
  }
  return obtido;
}

/**
 * Pede à outra janela que entregue a base e espera até a conseguir reservar.
 * Usado pelo botão "Usar aqui".
 */
export async function assumirBaseLocal(): Promise<void> {
  try {
    sessionStorage.removeItem(CHAVE_CEDIDO);
  } catch {
    // ignorar
  }
  if (!webLocksDisponivel()) return;

  canal ??= criarCanal();
  canal?.postMessage({ tipo: 'libertar' } satisfies MensagemCanal);

  await new Promise<void>((resolver, rejeitar) => {
    const cancelamento = new AbortController();
    const limite = setTimeout(() => {
      cancelamento.abort();
      rejeitar(new Error('A outra janela não respondeu. Feche-a e tente novamente.'));
    }, 15_000);
    navigator.locks
      .request(NOME_BLOQUEIO, { mode: 'exclusive', signal: cancelamento.signal }, async () => {
        clearTimeout(limite);
        resolver();
        await manterBloqueio();
      })
      .catch((erro) => {
        clearTimeout(limite);
        rejeitar(erro);
      });
  });

  bloqueioObtido = true;
  ouvirPedidosParaLibertar();
  // O outro separador liberta o bloqueio ao descarregar a página; damos um instante
  // para o worker do SQLite dele terminar e soltar o ficheiro.
  await new Promise((resolver) => setTimeout(resolver, 400));
}
