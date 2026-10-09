export type TipoImpressao =
  | 'Impressão P/B'
  | 'Fotocópia P/B'
  | 'Colorida simples'
  | 'Colorida com imagens';

export type ConfiguracaoCustoTinta = {
  tipo: TipoImpressao;
  custoPorPagina: number;
};

export const custosTinta: ConfiguracaoCustoTinta[] = [
  { tipo: 'Impressão P/B', custoPorPagina: 200 / 4500 },
  { tipo: 'Fotocópia P/B', custoPorPagina: 200 / 4500 },
  { tipo: 'Colorida simples', custoPorPagina: 600 / 7500 },
  { tipo: 'Colorida com imagens', custoPorPagina: 600 / 7500 },
];

export const margemDesperdicioImpressao = 0.1;

export function obterCustoTintaPorPagina(servico: string): number {
  const configuracao = custosTinta.find(
    (item) => item.tipo === servico
  );

  return configuracao?.custoPorPagina ?? 0;
}
