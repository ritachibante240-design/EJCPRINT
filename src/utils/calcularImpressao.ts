export type CalculoImpressao = {
  paginasPorCopia: number;
  numeroCopias: number;
  totalPaginasImpressas: number;
  folhasPorCopia: number;
  totalFolhas: number;
};

export function calcularImpressao(
  numeroPaginas: number,
  numeroCopias: number,
  frenteVerso: boolean
): CalculoImpressao {
  if (
    !Number.isSafeInteger(numeroPaginas) ||
    numeroPaginas <= 0
  ) {
    throw new Error(
      'O número de páginas deve ser um número inteiro maior que zero.'
    );
  }

  if (
    !Number.isSafeInteger(numeroCopias) ||
    numeroCopias <= 0
  ) {
    throw new Error(
      'O número de cópias deve ser um número inteiro maior que zero.'
    );
  }

  const folhasPorCopia = frenteVerso
    ? Math.ceil(numeroPaginas / 2)
    : numeroPaginas;
  const totalPaginasImpressas =
    numeroPaginas * numeroCopias;
  const totalFolhas = folhasPorCopia * numeroCopias;

  if (
    !Number.isSafeInteger(totalPaginasImpressas) ||
    !Number.isSafeInteger(totalFolhas)
  ) {
    throw new Error(
      'O total de páginas ou folhas excede o valor permitido.'
    );
  }

  return {
    paginasPorCopia: numeroPaginas,
    numeroCopias,
    totalPaginasImpressas,
    folhasPorCopia,
    totalFolhas,
  };
}