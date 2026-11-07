import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrdersService } from '../src/orders/orders.service';

describe('OrdersService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('calculates duplex sheets and total from the server price table, ignoring prices sent by the app', async () => {
    const prisma = new PrismaService();
    const input = {
      externalReference: 'mobile-order-1',
      customerName: ' Cliente ',
      customerPhone: ' 849000000 ',
      service: ' Impressão P/B ',
      unitPrice: 2.5,
      pageCount: 41,
      copyCount: 2,
      doubleSided: true,
      bindingType: 'ESPIRAL_MEDIA',
      bindingPrice: 15,
    };
    const createdOrder = { id: 'order-1', ...input };
    vi.spyOn(prisma.order, 'findUnique').mockResolvedValue(null);
    const create = vi.spyOn(prisma.order, 'create').mockResolvedValue(createdOrder as never);

    const result = await new OrdersService(prisma, {} as never).create(input);

    expect(result).toBe(createdOrder);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        externalReference: 'mobile-order-1',
        customerName: 'Cliente',
        customerPhone: '849000000',
        service: 'Impressão P/B',
        // A app enviou 2,50 MT/página e 15 MT de encadernação; o servidor usa a sua tabela:
        // 41 páginas × 2 cópias × 3 MT + encadernação (21 folhas → 30 MT) × 2 = 306 MT
        unitPriceCents: 300,
        sheetsRequired: 42,
        totalCents: 30_600,
        bindingPriceCents: 6_000,
      }),
    });
  });

  it('does not advance a pedido to preparation before the 50% deposit is confirmed', async () => {
    const prisma = new PrismaService();
    const order = {
      id: 'order-1',
      number: 'EJC-2026-00000001',
      status: 'RECEIVED',
      totalCents: 10_000,
      bindingType: 'SEM_ENCADERNACAO',
      payments: [{ amountCents: 4_999 }],
    };
    vi.spyOn(prisma, '$transaction').mockImplementation(
      (async (callback: (transaction: PrismaService) => Promise<unknown>) => callback(prisma)) as never,
    );
    vi.spyOn(prisma.order, 'findUnique').mockResolvedValue(order as never);
    const update = vi.spyOn(prisma.order, 'update');

    await expect(
      new OrdersService(prisma, {} as never).updateStatus('order-1', 'PREPARING'),
    ).rejects.toThrow('O sinal de 50% do pedido ainda não está confirmado.');
    expect(update).not.toHaveBeenCalled();
  });
});
