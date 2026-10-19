import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { PaymentsService } from '../src/payments/payments.service';

describe('PaymentsService', () => {
  afterEach(() => vi.restoreAllMocks());

  function useTransaction(prisma: PrismaService) {
    vi.spyOn(prisma, '$transaction').mockImplementation(
      (async (callback: (transaction: PrismaService) => Promise<unknown>) => callback(prisma)) as never,
    );
  }

  it('confirms a pending payment without exceeding the remaining order balance', async () => {
    const prisma = new PrismaService();
    useTransaction(prisma);
    vi.spyOn(prisma.payment, 'findUnique').mockResolvedValue({
      id: 'payment-1',
      orderId: 'order-1',
      amountCents: 5_000,
      status: 'PENDING',
      order: { number: 'EJC-2026-00000001', totalCents: 10_000 },
    } as never);
    vi.spyOn(prisma.payment, 'aggregate').mockResolvedValue({
      _sum: { amountCents: 4_000 },
    } as never);
    const update = vi.spyOn(prisma.payment, 'update').mockResolvedValue({
      id: 'payment-1',
      amountCents: 5_000,
      status: 'CONFIRMED',
    } as never);
    const audit = vi.spyOn(prisma.adminAuditLog, 'create').mockResolvedValue({} as never);

    const result = await new PaymentsService(prisma, {} as never).approve('payment-1');

    expect(result.status).toBe('CONFIRMED');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: { status: 'CONFIRMED', confirmedAt: expect.any(Date) },
    });
    expect(audit).toHaveBeenCalledOnce();
  });

  it('rejects confirmation that would make confirmed payments exceed the order total', async () => {
    const prisma = new PrismaService();
    useTransaction(prisma);
    vi.spyOn(prisma.payment, 'findUnique').mockResolvedValue({
      id: 'payment-1',
      orderId: 'order-1',
      amountCents: 5_001,
      status: 'PENDING',
      order: { number: 'EJC-2026-00000001', totalCents: 10_000 },
    } as never);
    vi.spyOn(prisma.payment, 'aggregate').mockResolvedValue({
      _sum: { amountCents: 5_000 },
    } as never);
    const update = vi.spyOn(prisma.payment, 'update');

    await expect(new PaymentsService(prisma, {} as never).approve('payment-1'))
      .rejects.toThrow('A aprovação excederia o total do pedido.');
    expect(update).not.toHaveBeenCalled();
  });
});
