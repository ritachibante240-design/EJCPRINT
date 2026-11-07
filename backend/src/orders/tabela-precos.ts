import { BadRequestException } from '@nestjs/common';

/**
 * Tabela de preços oficial da EJC Print (em centavos, por página).
 *
 * O preço de um pedido é SEMPRE calculado aqui, no servidor. Os valores enviados pela app
 * (unitPrice, colorUnitPrice, bindingPrice) são ignorados, para que ninguém consiga criar
 * um pedido mais barato enviando um preço falso diretamente ao servidor.
 *
 * Se mudar um preço, mude também em src/screens/cliente/NovoPedidoScreen.tsx (lista `servicos`
 * e `calcularPrecoEncadernacao`), para o cliente ver o mesmo valor que o servidor cobra.
 */
export const PRECO_POR_PAGINA_CENTAVOS: Readonly<Record<string, number>> = {
  'Fotocópia P/B': 200,
  'Impressão P/B': 300,
  'Colorida simples': 500,
  'Colorida com imagens': 1000,
  'Digitalização': 1500,
  'Digitação': 1500,
};

/** Preço das páginas P/B quando só algumas páginas do documento são a cores. */
export const PRECO_PB_CENTAVOS = 300;
const SERVICOS_COLORIDOS = new Set(['Colorida simples', 'Colorida com imagens']);
const SERVICOS_COM_PAGINAS_A_CORES = new Set(['Impressão P/B', ...SERVICOS_COLORIDOS]);
const SERVICOS_DIGITAIS = new Set(['Digitalização', 'Digitação']);
export const TIPOS_ENCADERNACAO = ['SEM_ENCADERNACAO', 'ESPIRAL_MEDIA'] as const;

/** Encadernação por exemplar, conforme o número de folhas físicas de cada exemplar. */
export function precoEncadernacaoPorExemplarCentavos(folhasPorExemplar: number): number | null {
  if (folhasPorExemplar <= 50) return 3000;
  if (folhasPorExemplar <= 100) return 4000;
  if (folhasPorExemplar <= 200) return 5000;
  return null;
}

export type DadosPreco = {
  service: string;
  pageCount: number;
  copyCount: number;
  doubleSided: boolean;
  colorPageCount: number;
  /** Preço pedido pela app para as páginas a cores (5 ou 10 MT); só serve para saber o tipo de cor. */
  colorUnitPrice?: number;
  bindingType: string;
};

export type PrecoCalculado = {
  service: string;
  unitPriceCents: number;
  colorUnitPriceCents: number;
  sheetsRequired: number;
  bindingType: string;
  bindingPriceCents: number;
  totalCents: number;
};

export function calcularPrecoPedido(dados: DadosPreco): PrecoCalculado {
  const service = dados.service.normalize('NFC').trim();
  const precoServico = PRECO_POR_PAGINA_CENTAVOS[service];
  if (precoServico === undefined) {
    throw new BadRequestException(`Serviço desconhecido: "${service}".`);
  }
  const digital = SERVICOS_DIGITAIS.has(service);

  // Páginas a cores dentro de um documento: as restantes pagam o preço P/B.
  let unitPriceCents = precoServico;
  let colorUnitPriceCents = 0;
  if (dados.colorPageCount > 0) {
    if (!SERVICOS_COM_PAGINAS_A_CORES.has(service)) {
      throw new BadRequestException('Este serviço não permite escolher páginas a cores.');
    }
    if (SERVICOS_COLORIDOS.has(service)) {
      colorUnitPriceCents = precoServico;
    } else {
      // Impressão P/B com algumas páginas a cores: simples (5 MT) ou com imagens (10 MT).
      const pedido = Math.round(Number(dados.colorUnitPrice ?? 0) * 100);
      colorUnitPriceCents =
        pedido === PRECO_POR_PAGINA_CENTAVOS['Colorida com imagens']
          ? PRECO_POR_PAGINA_CENTAVOS['Colorida com imagens']
          : PRECO_POR_PAGINA_CENTAVOS['Colorida simples'];
    }
    unitPriceCents = PRECO_PB_CENTAVOS;
  }

  const sheetsPerCopy = digital ? 0 : dados.doubleSided ? Math.ceil(dados.pageCount / 2) : dados.pageCount;
  const sheetsRequired = sheetsPerCopy * dados.copyCount;

  const bindingType = (dados.bindingType || 'SEM_ENCADERNACAO').trim().toUpperCase();
  if (!(TIPOS_ENCADERNACAO as readonly string[]).includes(bindingType)) {
    throw new BadRequestException('Tipo de encadernação desconhecido.');
  }
  let bindingPriceCents = 0;
  if (bindingType !== 'SEM_ENCADERNACAO') {
    if (digital) throw new BadRequestException('Serviços digitais não têm encadernação.');
    const porExemplar = precoEncadernacaoPorExemplarCentavos(sheetsPerCopy);
    if (porExemplar === null) {
      throw new BadRequestException('Encadernação acima de 200 folhas por exemplar precisa de orçamento na papelaria.');
    }
    bindingPriceCents = porExemplar * dados.copyCount;
  }

  const totalCents =
    (unitPriceCents * (dados.pageCount - dados.colorPageCount) + colorUnitPriceCents * dados.colorPageCount) *
      dados.copyCount +
    bindingPriceCents;

  return { service, unitPriceCents, colorUnitPriceCents, sheetsRequired, bindingType, bindingPriceCents, totalCents };
}
