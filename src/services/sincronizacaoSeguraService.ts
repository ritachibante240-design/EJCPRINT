import {
  sincronizarPedidosPendentes,
  sincronizarPedidosRecebidos,
} from './sincronizacaoPedidoService';
import {
  sincronizarPagamentosPendentes,
  sincronizarPagamentosRecebidos,
} from './sincronizacaoPagamentoService';

export async function sincronizarTudoPendentes(
  tentativas = 3,
  atrasoMs = 1200,
) {
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
