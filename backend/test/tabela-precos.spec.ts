import { describe, expect, it } from 'vitest';
import { calcularPrecoPedido } from '../src/orders/tabela-precos';

const base = { pageCount: 10, copyCount: 1, doubleSided: false, colorPageCount: 0, bindingType: 'SEM_ENCADERNACAO' };

describe('tabela de preços do servidor', () => {
  it('usa o preço oficial de cada serviço', () => {
    expect(calcularPrecoPedido({ ...base, service: 'Fotocópia P/B' }).totalCents).toBe(2000);
    expect(calcularPrecoPedido({ ...base, service: 'Impressão P/B' }).totalCents).toBe(3000);
    expect(calcularPrecoPedido({ ...base, service: 'Colorida simples' }).totalCents).toBe(5000);
    expect(calcularPrecoPedido({ ...base, service: 'Colorida com imagens' }).totalCents).toBe(10000);
    expect(calcularPrecoPedido({ ...base, service: 'Digitalização' }).totalCents).toBe(15000);
    expect(calcularPrecoPedido({ ...base, service: 'Digitação' }).totalCents).toBe(15000);
  });

  it('ignora um preço falso enviado pela app (ex.: 1 MT por página)', () => {
    const preco = calcularPrecoPedido({ ...base, service: 'Colorida com imagens', colorUnitPrice: 1 });
    expect(preco.unitPriceCents).toBe(1000);
    expect(preco.totalCents).toBe(10000);
  });

  it('multiplica pelas cópias e conta as folhas em frente e verso', () => {
    const preco = calcularPrecoPedido({ ...base, service: 'Impressão P/B', pageCount: 5, copyCount: 3, doubleSided: true });
    expect(preco.totalCents).toBe(300 * 5 * 3);
    expect(preco.sheetsRequired).toBe(3 * 3);
  });

  it('páginas a cores: as escolhidas pagam cor e as restantes 3 MT', () => {
    // 4 páginas, 1 a cores simples: 3 × 3 + 1 × 5 = 14 MT
    expect(calcularPrecoPedido({ ...base, service: 'Impressão P/B', pageCount: 4, colorPageCount: 1, colorUnitPrice: 5 }).totalCents).toBe(1400);
    // Um valor de cor falso cai no preço "simples" (nunca abaixo de 5 MT)
    expect(calcularPrecoPedido({ ...base, service: 'Impressão P/B', pageCount: 4, colorPageCount: 1, colorUnitPrice: 0.5 }).colorUnitPriceCents).toBe(500);
    // Colorida com imagens em só 2 de 10 páginas: 8 × 3 + 2 × 10 = 44 MT
    expect(calcularPrecoPedido({ ...base, service: 'Colorida com imagens', colorPageCount: 2 }).totalCents).toBe(4400);
  });

  it('encadernação calculada pelo servidor por exemplar', () => {
    expect(calcularPrecoPedido({ ...base, service: 'Impressão P/B', pageCount: 40, copyCount: 2, bindingType: 'ESPIRAL_MEDIA' }).bindingPriceCents).toBe(6000);
    expect(calcularPrecoPedido({ ...base, service: 'Impressão P/B', pageCount: 80, bindingType: 'ESPIRAL_MEDIA' }).bindingPriceCents).toBe(4000);
    expect(() => calcularPrecoPedido({ ...base, service: 'Impressão P/B', pageCount: 250, bindingType: 'ESPIRAL_MEDIA' })).toThrow();
  });

  it('recusa serviços e encadernações desconhecidos', () => {
    expect(() => calcularPrecoPedido({ ...base, service: 'Grátis' })).toThrow();
    expect(() => calcularPrecoPedido({ ...base, service: 'Impressão P/B', bindingType: 'OURO' })).toThrow();
    expect(() => calcularPrecoPedido({ ...base, service: 'Fotocópia P/B', colorPageCount: 1 })).toThrow();
  });
});
