export type TipoImpressao =
  | 'Impressão P/B'
  | 'Colorida simples'
  | 'Colorida com imagens';

export type ConfiguracaoCustoTinta = {
  tipo: TipoImpressao;
  custoPorPagina: number;
};

export const custosTinta: ConfiguracaoCustoTinta[] = [
  { tipo: 'Impressão P/B', custoPorPagina: 0.044 },
  { tipo: 'Colorida simples', custoPorPagina: 0 },
  { tipo: 'Colorida com imagens', custoPorPagina: 0 },
];

export function obterCustoTintaPorPagina(servico: string): number {
  const configuracao = custosTinta.find(
    (item) => item.tipo === servico
  );

  return configuracao?.custoPorPagina ?? 0;
}
