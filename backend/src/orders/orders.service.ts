import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { PrismaService } from '../prisma/prisma.service';
import type { OrderStatus } from './order-status';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateOrderDto) {
    const existingOrder = await this.prisma.order.findUnique({
      where: { externalReference: input.externalReference },
    });
    if (existingOrder) return existingOrder;

    const printedPages = input.pageCount * input.copyCount;
    const sheetsRequired = input.doubleSided
      ? Math.ceil(input.pageCount / 2) * input.copyCount
      : printedPages;
    const unitPriceCents = Math.round(input.unitPrice * 100);
    const bindingPriceCents = Math.round((input.bindingPrice ?? 0) * 100);
    const totalCents = unitPriceCents * printedPages + bindingPriceCents;

    const order = await this.prisma.order.create({
      data: {
        number: this.newOrderNumber(),
        externalReference: input.externalReference,
        customerName: input.customerName.trim(),
        customerPhone: input.customerPhone.trim(),
        service: input.service.trim(),
        unitPriceCents,
        pageCount: input.pageCount,
        copyCount: input.copyCount,
        doubleSided: input.doubleSided,
        sheetsRequired,
        bindingType: input.bindingType ?? 'SEM_ENCADERNACAO',
        bindingPriceCents,
        totalCents,
      },
    });

    return order;
  }

  list() {
    return this.prisma.order.findMany({
      include: { documents: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { documents: true },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    return order;
  }

  async updateStatus(id: string, status: OrderStatus) {
    await this.findOne(id);
    return this.prisma.order.update({ where: { id }, data: { status } });
  }

  private newOrderNumber() {
    return `EJC-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  }
}
