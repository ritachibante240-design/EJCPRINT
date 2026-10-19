import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { InventoryService } from '../src/inventory/inventory.service';

describe('InventoryService binding options', () => {
  afterEach(() => vi.restoreAllMocks());

  it('offers only spirals whose confirmed capacity covers duplex sheets and available copies', async () => {
    const prisma = new PrismaService();
    const order = {
      id: 'order-1',
      status: 'PRINTING',
      bindingType: 'ESPIRAL_MEDIA',
      pageCount: 41,
      copyCount: 2,
      doubleSided: true,
      sheetsRequired: 42,
    };
    const strongCover = { unit: 'unidades', quantity: 2 };
    const transparentCover = { unit: 'unidades', quantity: 2 };
    const compatibleSpiral = {
      id: 'spiral-compatible',
      name: 'Espiral 8 mm',
      normalizedName: 'espiral 8 mm',
      category: 'Encadernação',
      unit: 'unidades',
      quantity: 2,
      bindingMinSheets: 20,
      bindingMaxSheets: 25,
    };
    const tooSmallSpiral = {
      ...compatibleSpiral,
      id: 'spiral-too-small',
      name: 'Espiral 6 mm',
      normalizedName: 'espiral 6 mm',
      bindingMinSheets: 1,
      bindingMaxSheets: 20,
    };
    const unconfiguredSpiral = {
      ...compatibleSpiral,
      id: 'spiral-unconfigured',
      bindingMinSheets: null,
      bindingMaxSheets: null,
    };
    vi.spyOn(prisma.order, 'findUnique').mockResolvedValue(order as never);
    vi.spyOn(prisma.stockItem, 'findUnique')
      .mockResolvedValueOnce(strongCover as never)
      .mockResolvedValueOnce(transparentCover as never);
    vi.spyOn(prisma.stockItem, 'findMany').mockResolvedValue([
      compatibleSpiral,
      tooSmallSpiral,
      unconfiguredSpiral,
    ] as never);

    const result = await new InventoryService(prisma).bindingOptions('order-1');

    expect(result.requiredSheets).toBe(21);
    expect(result.options).toEqual([{
      id: 'spiral-compatible',
      name: 'Espiral 8 mm',
      availableQuantity: 2,
      minimumSheets: 20,
      maximumSheets: 25,
    }]);
    expect(result.blockReason).toBeNull();
  });

  it('blocks spiral choices when cover stock is insufficient', async () => {
    const prisma = new PrismaService();
    vi.spyOn(prisma.order, 'findUnique').mockResolvedValue({
      id: 'order-1',
      status: 'PRINTING',
      bindingType: 'ESPIRAL_MEDIA',
      pageCount: 20,
      copyCount: 2,
      doubleSided: false,
      sheetsRequired: 40,
    } as never);
    vi.spyOn(prisma.stockItem, 'findUnique')
      .mockResolvedValueOnce({ unit: 'unidades', quantity: 2 } as never)
      .mockResolvedValueOnce({ unit: 'unidades', quantity: 1 } as never);
    const findMany = vi.spyOn(prisma.stockItem, 'findMany');

    const result = await new InventoryService(prisma).bindingOptions('order-1');

    expect(result.options).toEqual([]);
    expect(result.blockReason).toContain('Stock insuficiente de Capa transparente');
    expect(findMany).not.toHaveBeenCalled();
  });
});
