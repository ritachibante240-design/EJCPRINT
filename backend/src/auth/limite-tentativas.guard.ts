import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

type PedidoComCabecalhos = {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
};

function primeiroValor(valor: string | string[] | undefined) {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  return texto?.split(',')[0]?.trim() || undefined;
}

/**
 * Limita tentativas por IP real do visitante.
 *
 * Na Render, os pedidos passam pela Cloudflare e pelo proxy da Render. O cabeçalho
 * X-Forwarded-For pode ser falsificado pelo cliente (a Render só acrescenta valores),
 * por isso usamos os cabeçalhos que a Cloudflare define e que o cliente não controla:
 * True-Client-Ip e Cf-Connecting-Ip. Fora da Render (desenvolvimento), usa o IP da ligação.
 */
@Injectable()
export class LimiteTentativasGuard extends ThrottlerGuard {
  protected async getTracker(pedido: PedidoComCabecalhos): Promise<string> {
    return (
      primeiroValor(pedido.headers['true-client-ip']) ??
      primeiroValor(pedido.headers['cf-connecting-ip']) ??
      pedido.ip ??
      pedido.socket?.remoteAddress ??
      'desconhecido'
    );
  }
}
