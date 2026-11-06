import {
  sincronizarPedidosPendentes,
  sincronizarPedidosRecebidos,
} from './sincronizacaoPedidoService';
import {
  sincronizarPagamentosPendentes,
  sincronizarPagamentosRecebidos,
} from './sincronizacaoPagamentoService';

// Se já houver uma sincronização geral a decorrer, quem chamar a seguir
// partilha o mesmo resultado em vez de lançar outra em paralelo.
let sincronizacaoEmCurso: Promise<void> | null = null;

export function sincronizarTudoPendentes(
  tentativas = 3,
  atrasoMs = 1200,
): Promise<void> {
  if (!sincronizacaoEmCurso) {
    sincronizacaoEmCurso = executarSincronizacao(tentativas, atrasoMs).finally(() => {
      sincronizacaoEmCurso = null;
    });
  }
  return sincronizacaoEmCurso;
}

async function executarSincronizacao(tentativas: number, atrasoMs: number) {
  let ultimoErro: unknown;

  for (let tentativa = 1; tentativa <= tentativas; tentativa += 1) {
    try {
      await sincronizarPedidosPendentes();
      await sincronizarPedidosRecebidos();
      await sincronizarPagamentosPendentes();
      await sincronizarPagamentosRecebidos();
      return;
    } catch (erro) {
      ultimoErro = erro;
      console.warn(
        `Sincronização pendente falhou (tentativa ${tentativa}/${tentativas}).`,
        erro,
      );

      if (tentativa < tentativas) {
        await new Promise((resolver) => setTimeout(resolver, atrasoMs * tentativa));
      }
    }
  }

  throw ultimoErro instanceof Error
    ? ultimoErro
    : new Error('Não foi possível sincronizar os dados pendentes.');
}
