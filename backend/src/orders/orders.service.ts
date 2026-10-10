import { BadRequestException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { basename, extname } from 'node:path';
import { CreateOrderDto } from './dto/create-order.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import type { OrderStatus } from './order-status';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService, private readonly storage: ObjectStorageService) {}

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
        instructions: input.instructions?.trim() || null,
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
      include: {
        documents: true,
        payments: { select: { id: true, externalReference: true, amountCents: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async customerStatus(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        payments: {
          select: {
            id: true,
            externalReference: true,
            amountCents: true,
            method: true,
            type: true,
            status: true,
            reference: true,
            proofOriginalName: true,
            rejectionReason: true,
            createdAt: true,
            confirmedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    return order;
  }

  async uploadDocument(orderId: string, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Selecione o documento do pedido.');
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
    if (!order) throw new NotFoundException('Pedido não encontrado.');

    const existing = await this.prisma.document.findFirst({ where: { orderId }, orderBy: { createdAt: 'asc' } });
    if (existing) return existing;

    const originalName = basename(file.originalname);
    const storageKey = `${randomUUID()}${extname(originalName).toLowerCase()}`;
    await this.storage.put(storageKey, file.buffer, file.mimetype);
    try {
      return await this.prisma.document.create({
        data: { orderId, originalName, storageKey, mimeType: file.mimetype, sizeBytes: file.size },
      });
    } catch (error) {
      await this.storage.delete(storageKey).catch(() => undefined);
      throw error;
    }
  }

  async document(orderId: string) {
    const document = await this.prisma.document.findFirst({ where: { orderId }, orderBy: { createdAt: 'asc' } });
    if (!document) throw new NotFoundException('Documento não encontrado.');
    const file = await this.storage.get(document.storageKey);
    return { file: new StreamableFile(file), mimeType: document.mimeType ?? 'application/octet-stream', name: document.originalName };
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
    return this.prisma.$transaction(async (transaction) => {
      const order = await transaction.order.findUnique({
        where: { id },
        include: { payments: { where: { status: 'CONFIRMED' }, select: { amountCents: true } } },
      });
      if (!order) throw new NotFoundException('Pedido não encontrado.');
      if (order.status === status) return order;

      const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
        RECEIVED: ['PREPARING', 'CANCELLED'],
        PREPARING: ['CANCELLED'],
        PRINTING: ['READY_FOR_PICKUP'],
        READY_FOR_PICKUP: ['DELIVERED'],
        DELIVERED: [],
        CANCELLED: [],
      };
      if (!allowedTransitions[order.status].includes(status)) {
        throw new BadRequestException(
          `Não é possível alterar um pedido de "${order.status}" para "${status}".`,
        );
      }

      const confirmedCents = order.payments.reduce((total, payment) => total + payment.amountCents, 0);
      if (status === 'PREPARING' && confirmedCents < order.totalCents * 0.5) {
        throw new BadRequestException('O sinal de 50% do pedido ainda não está confirmado.');
      }
      if (status === 'DELIVERED' && confirmedCents < order.totalCents) {
        throw new BadRequestException('O pagamento total do pedido ainda não está confirmado.');
      }

      return transaction.order.update({ where: { id }, data: { status } });
    });
  }

  private newOrderNumber() {
    return `EJC-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  }
}
