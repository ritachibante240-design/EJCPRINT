export type EtapaPedido = { estadoInterno: string; titulo: string };

export function obterEtapasPedido(servico: string): EtapaPedido[] {
  const etapaProducao = servico === 'Digitalização' ? 'Em digitalização' : servico === 'Fotocópia P/B' ? 'Em produção' : 'Em impressão';
  return [
    { estadoInterno: 'Pedido recebido', titulo: 'Pedido recebido' },
    { estadoInterno: 'Em preparação', titulo: 'Em preparação' },
    { estadoInterno: 'Em impressão', titulo: etapaProducao },
    { estadoInterno: 'Pronto para levantamento', titulo: 'Pronto para levantamento' },
    { estadoInterno: 'Entregue', titulo: 'Entregue' },
  ];
}

export function obterNomeEstado(estado: string, servico: string): string {
  if (estado === 'Cancelado') return 'Cancelado';
  return obterEtapasPedido(servico).find((etapa) => etapa.estadoInterno === estado)?.titulo ?? estado;
}

export function obterProximaAcao(estado: string, servico: string): string {
  if (estado === 'Pedido recebido') return 'Iniciar preparação';
  if (estado === 'Em preparação') return servico === 'Digitalização' ? 'Iniciar digitalização' : servico === 'Fotocópia P/B' ? 'Iniciar produção' : 'Iniciar impressão';
  if (estado === 'Em impressão') return 'Marcar como pronto';
  if (estado === 'Pronto para levantamento') return 'Marcar como entregue';
  return '';
}
