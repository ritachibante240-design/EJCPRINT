import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateStockItemDto } from './dto/create-stock-item.dto';
import { AdjustStockDto, InitialStockCostDto, PurchaseStockDto, WasteStockDto } from './dto/stock-operation.dto';

const PAPER_SERVICES = new Set([
  'Impressão P/B',
  'Fotocópia P/B',
  'Colorida simples',
  'Colorida com imagens',
]);

const INK_COST_PER_PAGE: Record<string, number> = {
  'Impressão P/B': 0.044,
  'Colorida simples': 0,
  'Colorida com imagens': 0,
};

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  listItems() {
    return this.prisma.stockItem.findMany({ orderBy: { name: 'asc' } });
  }

  async createItem(input: CreateStockItemDto) {
    const name = input.name.trim();
    const normalizedName = name.toLowerCase();
    const category = input.category.trim();
    const unit = input.unit.trim();
    if (!name || !category || !unit) throw new BadRequestException('Nome, categoria e unidade são obrigatórios.');
    if (!input.externalReference.trim()) throw new BadRequestException('Referência da operação inválida.');
    if (normalizedName === 'papel' || normalizedName === 'resma') {
      throw new BadRequestException('Use o cadastro único “Papel A4” para controlar folhas de papel.');
    }

    const paper = normalizedName === 'papel a4';
    const itemName = paper ? 'Papel A4' : name;
    const itemCategory = paper ? 'Papel' : category;
    const itemUnit = paper ? 'folhas' : unit;
    this.validateQuantityUnit(itemUnit, input.quantity);
    this.validateQuantityUnit(itemUnit, input.minimumQuantity);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const previous = await transaction.stockMovement.findUnique({
          where: { externalReference: input.externalReference.trim() },
          include: { stockItem: true },
        });
        if (previous) return previous.stockItem;

        const existing = await transaction.stockItem.findUnique({
          where: { normalizedName: itemName.toLowerCase() },
        });
        if (existing) throw new ConflictException('Já existe um material com esse nome no stock.');

        const item = await transaction.stockItem.create({
          data: {
            name: itemName,
            normalizedName: itemName.toLowerCase(),
            category: itemCategory,
            unit: itemUnit,
            quantity: input.quantity,
            minimumQuantity: input.minimumQuantity,
          },
        });
        await transaction.stockMovement.create({
          data: {
            externalReference: input.externalReference.trim(),
            stockItemId: item.id,
            type: 'SALDO_INICIAL',
            quantity: input.quantity,
            reason: 'Cadastro inicial do material',
          },
        });
        return item;
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if (this.isUniqueViolation(error)) throw new ConflictException('Já existe um material com esse nome no stock.');
      throw error;
    }
  }

  async purchase(stockItemId: string, input: PurchaseStockDto) {
    const externalReference = input.externalReference.trim();
    if (!externalReference) throw new BadRequestException('Referência da operação inválida.');
    if (input.quantity <= 0 || !Number.isSafeInteger(input.amountCents)) {
      throw new BadRequestException('Quantidade e valor da compra devem ser maiores que zero.');
    }

    return this.prisma.$transaction(async (transaction) => {
      const previous = await transaction.stockMovement.findUnique({
        where: { externalReference },
        include: { stockItem: true },
      });
      if (previous) return previous.stockItem;

      const item = await transaction.stockItem.findUnique({ where: { id: stockItemId } });
      if (!item) throw new NotFoundException('Material não encontrado.');
      this.validateQuantityUnit(item.unit, input.quantity);

      const quantity = item.quantity + input.quantity;
      const averageUnitCost = (
        item.quantity * item.averageUnitCost + input.amountCents / 100
      ) / quantity;
      const description = `Compra de ${item.name}`;
      const movement = await transaction.stockMovement.create({
        data: {
          externalReference,
          stockItemId: item.id,
          type: 'ENTRADA_COMPRA',
          quantity: input.quantity,
          amountCents: input.amountCents,
          unitCost: input.amountCents / 100 / input.quantity,
          reason: description,
        },
      });
      await transaction.stockItem.update({
        where: { id: item.id },
        data: { quantity, averageUnitCost },
      });
      await transaction.expense.create({
        data: {
          externalReference: `${externalReference}:expense`,
          description,
          category: item.category,
          type: 'COMPRA_STOCK',
          amountCents: input.amountCents,
          stockMovementId: movement.id,
        },
      });
      return transaction.stockItem.findUniqueOrThrow({ where: { id: item.id } });
    });
  }

  async adjust(stockItemId: string, input: AdjustStockDto) {
    const externalReference = input.externalReference.trim();
    if (!externalReference) throw new BadRequestException('Referência da operação inválida.');
    return this.prisma.$transaction(async (transaction) => {
      const previous = await transaction.stockMovement.findUnique({
        where: { externalReference },
        include: { stockItem: true },
      });
      if (previous) return previous.stockItem;

      const item = await transaction.stockItem.findUnique({ where: { id: stockItemId } });
      if (!item) throw new NotFoundException('Material não encontrado.');
      this.validateQuantityUnit(item.unit, input.quantity);

      let nextQuantity: number;
      let movementType: string;
      let movementQuantity: number;
      if (input.direction === 'ADD') {
        if (input.quantity <= 0) throw new BadRequestException('A quantidade deve ser maior que zero.');
        nextQuantity = item.quantity + input.quantity;
        movementType = 'AJUSTE_POSITIVO';
        movementQuantity = input.quantity;
      } else if (input.direction === 'REMOVE') {
        if (input.quantity <= 0) throw new BadRequestException('A quantidade deve ser maior que zero.');
        if (item.quantity < input.quantity) throw new BadRequestException('Stock insuficiente.');
        nextQuantity = item.quantity - input.quantity;
        movementType = 'SAIDA_MANUAL';
        movementQuantity = input.quantity;
      } else {
        if (input.quantity === item.quantity) throw new BadRequestException('A quantidade informada é igual ao stock atual.');
        nextQuantity = input.quantity;
        movementType = input.quantity > item.quantity ? 'AJUSTE_POSITIVO' : 'AJUSTE_NEGATIVO';
        movementQuantity = Math.abs(input.quantity - item.quantity);
      }

      await transaction.stockMovement.create({
        data: {
          externalReference,
          stockItemId: item.id,
          type: movementType,
          quantity: movementQuantity,
          reason: input.reason?.trim() || 'Ajuste de inventário',
        },
      });
      return transaction.stockItem.update({ where: { id: item.id }, data: { quantity: nextQuantity } });
    });
  }

  async setInitialCost(stockItemId: string, input: InitialStockCostDto) {
    const externalReference = input.externalReference.trim();
    if (!externalReference || !Number.isSafeInteger(input.amountCents)) {
      throw new BadRequestException('O valor do custo inicial é inválido.');
    }
    return this.prisma.$transaction(async (transaction) => {
      const previous = await transaction.stockMovement.findUnique({
        where: { externalReference },
        include: { stockItem: true },
      });
      if (previous) return previous.stockItem;

      const item = await transaction.stockItem.findUnique({ where: { id: stockItemId } });
      if (!item) throw new NotFoundException('Material não encontrado.');
      if (item.quantity <= 0) throw new BadRequestException('Este material não possui stock disponível.');
      if (item.averageUnitCost > 0) throw new BadRequestException('O custo deste material já foi definido.');
      const averageUnitCost = input.amountCents / 100 / item.quantity;

      await transaction.stockMovement.create({
        data: {
          externalReference,
          stockItemId: item.id,
          type: 'CUSTO_INICIAL',
          quantity: 0,
          amountCents: input.amountCents,
          unitCost: averageUnitCost,
          reason: 'Definição do custo inicial do stock',
        },
      });
      return transaction.stockItem.update({ where: { id: item.id }, data: { averageUnitCost } });
    });
  }

  async waste(stockItemId: string, input: WasteStockDto) {
    const externalReference = input.externalReference.trim();
    const reason = input.reason?.trim() ?? '';
    if (!externalReference) throw new BadRequestException('Referência da operação inválida.');
    if (!reason) throw new BadRequestException('Informe o motivo do desperdício.');
    if (input.quantity <= 0) throw new BadRequestException('A quantidade deve ser maior que zero.');

    return this.prisma.$transaction(async (transaction) => {
      const previous = await transaction.stockMovement.findUnique({
        where: { externalReference },
        include: { stockItem: true },
      });
      if (previous) return previous.stockItem;

      const item = await transaction.stockItem.findUnique({ where: { id: stockItemId } });
      if (!item) throw new NotFoundException('Material não encontrado.');
      this.validateQuantityUnit(item.unit, input.quantity);
      if (item.quantity < input.quantity) {
        throw new BadRequestException(`Stock insuficiente. Disponível: ${item.quantity} ${item.unit}.`);
      }
      if (input.orderId) {
        const order = await transaction.order.findUnique({ where: { id: input.orderId }, select: { id: true } });
        if (!order) throw new NotFoundException('Pedido associado à perda não encontrado.');
      }

      await transaction.stockMovement.create({
        data: {
          externalReference,
          stockItemId: item.id,
          orderId: input.orderId,
          type: 'DESPERDICIO',
          quantity: input.quantity,
          reason,
        },
      });
      return transaction.stockItem.update({
        where: { id: item.id },
        data: { quantity: item.quantity - input.quantity },
      });
    });
  }

  listMovements() {
    return this.prisma.stockMovement.findMany({
      include: { stockItem: true, order: { select: { id: true, number: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  listExpenses() {
    return this.prisma.expense.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  }

  async createExpense(input: CreateExpenseDto) {
    const externalReference = input.externalReference.trim();
    const description = input.description.trim();
    const category = input.category.trim();
    if (!externalReference || !description || !category || !Number.isSafeInteger(input.amountCents)) {
      throw new BadRequestException('Os dados da despesa são inválidos.');
    }
    const previous = await this.prisma.expense.findUnique({ where: { externalReference } });
    if (previous) return previous;
    try {
      return await this.prisma.expense.create({
        data: {
          externalReference,
          description,
          category,
          type: input.type,
          amountCents: input.amountCents,
        },
      });
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      const duplicate = await this.prisma.expense.findUnique({ where: { externalReference } });
      if (duplicate) return duplicate;
      throw error;
    }
  }

  async expenseSummary() {
    const expenses = await this.prisma.expense.findMany({ select: { type: true, amountCents: true } });
    const summary = { comprasStockCents: 0, despesasOperacionaisCents: 0, outrosCents: 0, totalSaidasCents: 0 };
    for (const expense of expenses) {
      summary.totalSaidasCents += expense.amountCents;
      if (expense.type === 'COMPRA_STOCK') summary.comprasStockCents += expense.amountCents;
      else if (expense.type === 'DESPESA_OPERACIONAL') summary.despesasOperacionaisCents += expense.amountCents;
      else if (expense.type === 'OUTRO') summary.outrosCents += expense.amountCents;
    }
    return summary;
  }

  async cashSummary() {
    const [payments, orders, expenseSummary] = await Promise.all([
      this.prisma.payment.aggregate({ where: { status: 'CONFIRMED' }, _sum: { amountCents: true } }),
      this.prisma.order.findMany({
        where: { status: { not: 'CANCELLED' } },
        select: {
          totalCents: true,
          payments: { where: { status: 'CONFIRMED' }, select: { amountCents: true } },
        },
      }),
      this.expenseSummary(),
    ]);
    const entradasCents = payments._sum.amountCents ?? 0;
    const porReceberCents = orders.reduce((sum, order) => {
      const received = order.payments.reduce((paid, payment) => paid + payment.amountCents, 0);
      return sum + Math.max(order.totalCents - received, 0);
    }, 0);
    return {
      entradasCents,
      saidasCents: expenseSummary.totalSaidasCents,
      saldoCents: entradasCents - expenseSummary.totalSaidasCents,
      porReceberCents,
    };
  }

  async cashMovements() {
    const [payments, expenses] = await Promise.all([
      this.prisma.payment.findMany({
        where: { status: 'CONFIRMED' },
        include: { order: { select: { number: true, customerName: true } } },
        orderBy: [{ confirmedAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.listExpenses(),
    ]);
    return [
      ...payments.map((payment) => ({
        id: `entrada-${payment.id}`,
        tipo: 'ENTRADA' as const,
        descricao: payment.order.number,
        detalhe: `${payment.type} • ${payment.method} • ${payment.order.customerName}`,
        amountCents: payment.amountCents,
        date: payment.confirmedAt ?? payment.createdAt,
      })),
      ...expenses.map((expense) => ({
        id: `saida-${expense.id}`,
        tipo: 'SAIDA' as const,
        descricao: expense.description,
        detalhe: expense.type === 'COMPRA_STOCK'
          ? `Compra de material • ${expense.category}`
          : expense.type === 'DESPESA_OPERACIONAL'
            ? `Despesa • ${expense.category}`
            : `Outra saída • ${expense.category}`,
        amountCents: expense.amountCents,
        date: expense.createdAt,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  async report(period: string) {
    if (!['HOJE', 'MES', 'GERAL'].includes(period)) throw new BadRequestException('Período de relatório inválido.');
    const start = period === 'GERAL'
      ? undefined
      : period === 'HOJE'
        ? new Date(new Date().setHours(0, 0, 0, 0))
        : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const dateFilter = start ? { gte: start } : undefined;
    const [orders, expenses] = await Promise.all([
      this.prisma.order.findMany({
        where: dateFilter ? { createdAt: dateFilter } : {},
        select: {
          totalCents: true,
          status: true,
          payments: { where: { status: 'CONFIRMED', ...(dateFilter ? { confirmedAt: dateFilter } : {}) }, select: { amountCents: true } },
        },
      }),
      this.prisma.expense.findMany({
        where: dateFilter ? { createdAt: dateFilter } : {},
        select: { amountCents: true },
      }),
    ]);
    const valorPedidosCents = orders.reduce((sum, order) => sum + (order.status === 'CANCELLED' ? 0 : order.totalCents), 0);
    const recebidoCents = orders.reduce((sum, order) => sum + order.payments.reduce((paid, payment) => paid + payment.amountCents, 0), 0);
    const porReceberCents = orders.reduce((sum, order) => {
      const received = order.payments.reduce((paid, payment) => paid + payment.amountCents, 0);
      return sum + (order.status === 'CANCELLED' ? 0 : Math.max(order.totalCents - received, 0));
    }, 0);
    const saidasCents = expenses.reduce((sum, expense) => sum + expense.amountCents, 0);
    return {
      valorPedidosCents,
      recebidoCents,
      porReceberCents,
      saidasCents,
      saldoMovimentosCents: recebidoCents - saidasCents,
      totalPedidos: orders.length,
      entregues: orders.filter((order) => order.status === 'DELIVERED').length,
      cancelados: orders.filter((order) => order.status === 'CANCELLED').length,
    };
  }

  async startPrint(orderId: string, externalReference: string) {
    const reference = externalReference.trim();
    if (!reference) throw new BadRequestException('Referência da operação inválida.');
    return this.prisma.$transaction(async (transaction) => {
      const order = await transaction.order.findUnique({
        where: { id: orderId },
        include: { payments: { where: { status: 'CONFIRMED' } } },
      });
      if (!order) throw new NotFoundException('Pedido não encontrado.');

      const previous = await transaction.stockMovement.findFirst({
        where: { orderId, type: 'CONSUMO_PEDIDO' },
        include: { stockItem: true },
      });
      if (previous) return { order, stockItem: previous.stockItem, movement: previous };
      if (order.status === 'PRINTING' && !PAPER_SERVICES.has(order.service)) {
        return { order, stockItem: null, movement: null };
      }
      if (order.status !== 'PREPARING') throw new BadRequestException('O pedido não está em preparação.');

      const paidCents = order.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
      if (paidCents < order.totalCents * 0.5) {
        throw new BadRequestException('O sinal de 50% do pedido ainda não está confirmado.');
      }

      if (!PAPER_SERVICES.has(order.service)) {
        const updatedOrder = await transaction.order.update({ where: { id: orderId }, data: { status: 'PRINTING' } });
        return { order: updatedOrder, stockItem: null, movement: null };
      }

      const paper = await transaction.stockItem.findUnique({ where: { normalizedName: 'papel a4' } });
      if (!paper) throw new BadRequestException('Papel A4 não está cadastrado no stock.');
      if (!Number.isInteger(order.sheetsRequired) || order.sheetsRequired <= 0) {
        throw new BadRequestException('Este pedido não possui um cálculo válido de folhas.');
      }
      if (paper.quantity < order.sheetsRequired) {
        throw new BadRequestException(`Stock insuficiente. Necessário: ${order.sheetsRequired} folhas. Disponível: ${paper.quantity} folhas.`);
      }

      const movement = await transaction.stockMovement.create({
        data: {
          externalReference: reference,
          stockItemId: paper.id,
          orderId,
          type: 'CONSUMO_PEDIDO',
          quantity: order.sheetsRequired,
          unitCost: paper.averageUnitCost,
          reason: `Impressão do pedido ${order.number}`,
        },
      });
      const stockItem = await transaction.stockItem.update({
        where: { id: paper.id },
        data: { quantity: { decrement: order.sheetsRequired } },
      });
      const updatedOrder = await transaction.order.update({ where: { id: orderId }, data: { status: 'PRINTING' } });
      return { order: updatedOrder, stockItem, movement };
    });
  }

  private validateQuantityUnit(unit: string, quantity: number) {
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new BadRequestException('As quantidades de stock devem ser válidas.');
    }
    if (unit.trim().toLowerCase() === 'folhas' && !Number.isSafeInteger(quantity)) {
      throw new BadRequestException('As quantidades de folhas devem ser números inteiros.');
    }
  }

  private isUniqueViolation(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
