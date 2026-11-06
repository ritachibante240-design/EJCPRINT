// Serviços que precisam do documento original em papel, entregue na papelaria.
//
// - Fotocópia: é sempre feita a partir do original.
// - Digitalização (scanner): precisa sempre do original.
// - Digitação: o documento é escrito a partir de um tema e instruções; não há papel.
// Pedidos antigos de "Digitalização" com instruções eram, na prática, digitações:
// para esses continua a não ser pedido o original.

export const AVISO_ORIGINAL =
  'Traga o documento original à papelaria. Este pedido serve para reservar e adiantar o pagamento.';

export const AVISO_ORIGINAL_DIGITALIZACAO =
  'Se vai digitalizar um documento em papel, traga o original à papelaria. ' +
  'Se o documento for preparado a partir do tema e das instruções, não precisa de o trazer.';

export function precisaDoOriginal(servico: string, instrucoes?: string | null): boolean {
  if (servico === 'Fotocópia P/B') return true;
  if (servico === 'Digitalização') return !instrucoes?.trim();
  return false;
}

/** O pedido ainda não começou a ser produzido e depende de o cliente trazer o original. */
export function aguardaOriginal(pedido: { servico: string; estado: string; instrucoes?: string | null }): boolean {
  return (
    precisaDoOriginal(pedido.servico, pedido.instrucoes) &&
    (pedido.estado === 'Pedido recebido' || pedido.estado === 'Em preparação')
  );
}
