import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateStockItemDto } from './dto/create-stock-item.dto';
import { AdjustStockDto, ConfigureBindingCapacityDto, ConfigureInkStockDto, InitialStockCostDto, PurchaseStockDto, SetStockUnitCostDto, WasteStockDto } from './dto/stock-operation.dto';

const PAPER_SERVICES = new Set([
  'Impressão P/B',
  'Fotocópia P/B',
  'Colorida simples',
  'Colorida com imagens',
]);

const PRINT_COST_DEFAULTS = {
  paperCostPerSheet: 0.7,
  blackInkBottleCost: 200,
  blackInkYieldPages: 4500,
  colorInkSetCost: 600,
  colorInkYieldPages: 7500,
  wasteReserveRate: 0.1,
} as const;

function calculatePrintCosts(input: {
  service: string;
  pageCount: number;
  copyCount: number;
  sheetsRequired: number;
  paperCostPerSheet: number;
  inkBottleCost?: number;
}) {
  const paperCost = input.sheetsRequired * input.paperCostPerSheet;
  const printedPages = input.pageCount * input.copyCount;
  const inkCostPerPage = input.service === 'Impressão P/B' || input.service === 'Fotocópia P/B'
    ? (input.inkBottleCost ?? PRINT_COST_DEFAULTS.blackInkBottleCost) / PRINT_COST_DEFAULTS.blackInkYieldPages
    : input.service === 'Colorida simples' || input.service === 'Colorida com imagens'
      ? (input.inkBottleCost ?? PRINT_COST_DEFAULTS.blackInkBottleCost) * 3 / PRINT_COST_DEFAULTS.colorInkYieldPages
      : 0;
  const inkCost = printedPages * inkCostPerPage;
  const wasteReserve = (paperCost + inkCost) * PRINT_COST_DEFAULTS.wasteReserveRate;
  return {
    paper: paperCost * (1 + PRINT_COST_DEFAULTS.wasteReserveRate),
    ink: inkCost * (1 + PRINT_COST_DEFAULTS.wasteReserveRate),
    inkCostPerPage: inkCostPerPage * (1 + PRINT_COST_DEFAULTS.wasteReserveRate),
    wasteReserve,
    total: paperCost + inkCost + wasteReserve,
  };
}

function estimateInkBottleConsumption(service: string, printedPages: number) {
  const bottlesPerPage = service === 'Impressão P/B' || service === 'Fotocópia P/B'
    ? 1 / PRINT_COST_DEFAULTS.blackInkYieldPages
    : service === 'Colorida simples' || service === 'Colorida com imagens'
      ? 3 / PRINT_COST_DEFAULTS.colorInkYieldPages
      : 0;
  return Math.round(
    printedPages * bottlesPerPage * (1 + PRINT_COST_DEFAULTS.wasteReserveRate) * 1_000_000,
  ) / 1_000_000;
}

function bindingSheetsPerCopy(order: {
  pageCount: number;
  copyCount: number;
  doubleSided: boolean;
  sheetsRequired: number;
}) {
  if (!Number.isSafeInteger(order.pageCount) || order.pageCount < 1 ||
      !Number.isSafeInteger(order.copyCount) || order.copyCount < 1) {
    throw new BadRequestException('O número de páginas ou exemplares do pedido é inválido.');
  }
  const sheetsPerCopy = order.doubleSided ? Math.ceil(order.pageCount / 2) : order.pageCount;
  if (sheetsPerCopy * order.copyCount !== order.sheetsRequired) {
    throw new BadRequestException('O cálculo de folhas físicas do pedido está inconsistente. Atualize o pedido antes de encadernar.');
  }
  return sheetsPerCopy;
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  private registarAuditoria(
    transaction: Prisma.TransactionClient,
    actor: string | undefined,
    action: string,
    entityType: string,
    entityId: string,
    summary: string,
  ) {
    return transaction.adminAuditLog.create({
      data: {
        actor: actor?.trim() || 'Administrador',
        action,
        entityType,
        entityId,
        summary,
      },
    });
  }

  listItems() {
    return this.prisma.stockItem.findMany({ orderBy: { name: 'asc' } });
  }

  async createItem(input: CreateStockItemDto, actor?: string) {
    const name = input.name.trim();
    const normalizedName = name.toLowerCase();
    const category = input.category.trim();
    const unit = input.unit.trim();
    if (!name || !category || !unit) throw new BadRequestException('Nome, categoria e unidade são obrigatórios.');
    if (!input.externalReference.trim()) throw new BadRequestException('Referência da operação inválida.');
    if (normalizedName === 'papel' || normalizedName === 'resma') {
      throw new BadRequestException('Use o cadastro único “Papel A4” para controlar folhas de papel.');
    }

    const paper = normalizedName === 'papel a4' || normalizedName === 'a4';
    const ink = ['tinta-epson l3252', 'tinta epson l3252'].includes(normalizedName);
    const itemName = paper ? 'Papel A4' : name;
    const itemCategory = paper ? 'Papel' : ink ? 'Tinta' : category;
    const itemUnit = paper ? 'folhas' : ink ? 'frascos' : unit;
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
        await this.registarAuditoria(
          transaction,
          actor,
          'STOCK_ITEM_CREATED',
          'STOCK',
          item.id,
          `Material ${item.name} cadastrado com ${item.quantity} ${item.unit}; mínimo ${item.minimumQuantity} ${item.unit}.`,
        );
        return item;
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if (this.isUniqueViolation(error)) throw new ConflictException('Já existe um material com esse nome no stock.');
      throw error;
    }
  }

  async purchase(stockItemId: string, input: PurchaseStockDto, actor?: string) {
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
      const updatedItem = await transaction.stockItem.findUniqueOrThrow({ where: { id: item.id } });
      await this.registarAuditoria(
        transaction,
        actor,
        'STOCK_PURCHASE_RECORDED',
        'STOCK',
        item.id,
        `Compra de ${input.quantity} ${item.unit} de ${item.name}, no valor de ${input.amountCents / 100} MT.`,
      );
      return updatedItem;
    });
  }

  async adjust(stockItemId: string, input: AdjustStockDto, actor?: string) {
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
      const updatedItem = await transaction.stockItem.update({ where: { id: item.id }, data: { quantity: nextQuantity } });
      await this.registarAuditoria(
        transaction,
        actor,
        'STOCK_ADJUSTED',
        'STOCK',
        item.id,
        `${item.name}: quantidade alterada de ${item.quantity} para ${nextQuantity} ${item.unit}. Motivo: ${input.reason?.trim() || 'Ajuste de inventário'}.`,
      );
      return updatedItem;
    });
  }

  async setInitialCost(stockItemId: string, input: InitialStockCostDto, actor?: string) {
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
      const updatedItem = await transaction.stockItem.update({ where: { id: item.id }, data: { averageUnitCost } });
      await this.registarAuditoria(
        transaction,
        actor,
        'STOCK_INITIAL_COST_SET',
        'STOCK',
        item.id,
        `Custo médio inicial de ${item.name} definido para ${averageUnitCost.toFixed(4)} MT/${item.unit}.`,
      );
      return updatedItem;
    });
  }

  async setUnitCost(stockItemId: string, input: SetStockUnitCostDto, actor?: string) {
    const externalReference = input.externalReference.trim();
    if (!externalReference || !Number.isSafeInteger(input.unitCostCents)) {
      throw new BadRequestException('O custo unitário informado é inválido.');
    }
    return this.prisma.$transaction(async (transaction) => {
      const previous = await transaction.stockMovement.findUnique({
        where: { externalReference },
        include: { stockItem: true },
      });
      if (previous) return previous.stockItem;

      const item = await transaction.stockItem.findUnique({ where: { id: stockItemId } });
      if (!item) throw new NotFoundException('Material não encontrado.');
      const nextUnitCost = input.unitCostCents / 100;

      await transaction.stockMovement.create({
        data: {
          externalReference,
          stockItemId: item.id,
          type: 'CORRECAO_CUSTO',
          quantity: 0,
          unitCost: nextUnitCost,
          reason: `Custo unitário alterado de ${item.averageUnitCost.toFixed(2)} para ${nextUnitCost.toFixed(2)} MT/${item.unit}.`,
        },
      });
      const updatedItem = await transaction.stockItem.update({
        where: { id: item.id },
        data: { averageUnitCost: nextUnitCost },
      });
      await this.registarAuditoria(
        transaction,
        actor,
        'STOCK_UNIT_COST_UPDATED',
        'STOCK',
        item.id,
        `Custo unitário de ${item.name} alterado de ${item.averageUnitCost.toFixed(2)} para ${nextUnitCost.toFixed(2)} MT/${item.unit}.`,
      );
      return updatedItem;
    });
  }

  async configureBindingCapacity(stockItemId: string, input: ConfigureBindingCapacityDto, actor?: string) {
    if (input.minimumSheets > input.maximumSheets) {
      throw new BadRequestException('O mínimo de folhas não pode ser maior que o máximo.');
    }
    return this.prisma.$transaction(async (transaction) => {
      const item = await transaction.stockItem.findUnique({ where: { id: stockItemId } });
      if (!item) throw new NotFoundException('Material não encontrado.');
      if (
        item.category.trim().toLocaleLowerCase() !== 'encadernação' ||
        !item.normalizedName.startsWith('espiral ')
      ) {
        throw new BadRequestException('A capacidade só pode ser configurada para materiais “Espiral …” da categoria Encadernação.');
      }
      if (!['unidade', 'unidades'].includes(item.unit.trim().toLocaleLowerCase())) {
        throw new BadRequestException('A espiral deve estar controlada em unidades para poder ser usada na encadernação.');
      }

      const updated = await transaction.stockItem.update({
        where: { id: item.id },
        data: {
          bindingMinSheets: input.minimumSheets,
          bindingMaxSheets: input.maximumSheets,
        },
      });
      await this.registarAuditoria(
        transaction,
        actor,
        'STOCK_BINDING_CAPACITY_CONFIGURED',
        'STOCK',
        item.id,
        `Capacidade confirmada de ${item.name}: ${input.minimumSheets}–${input.maximumSheets} folhas físicas por exemplar, conforme embalagem/fornecedor.`,
      );
      return updated;
    });
  }

  async configureInkStock(stockItemId: string, input: ConfigureInkStockDto, actor?: string) {
    const externalReference = input.externalReference.trim();
    if (!externalReference || !Number.isSafeInteger(input.unitCostCents)) {
      throw new BadRequestException('Os dados de configuração da tinta são inválidos.');
    }
    this.validateQuantityUnit('frascos', input.quantity);
    this.validateQuantityUnit('frascos', input.minimumQuantity);

    return this.prisma.$transaction(async (transaction) => {
      const previous = await transaction.stockMovement.findUnique({
        where: { externalReference },
        include: { stockItem: true },
      });
      if (previous) return previous.stockItem;

      const item = await transaction.stockItem.findUnique({ where: { id: stockItemId } });
      if (!item) throw new NotFoundException('Material não encontrado.');
      if (!['tinta-epson l3252', 'tinta epson l3252'].includes(item.normalizedName)) {
        throw new BadRequestException('Esta configuração só pode ser usada no material Tinta Epson L3252.');
      }

      const unitCost = input.unitCostCents / 100;
      const quantityDifference = Math.abs(input.quantity - item.quantity);
      await transaction.stockMovement.create({
        data: {
          externalReference,
          stockItemId: item.id,
          type: 'CORRECAO_TINTA',
          quantity: quantityDifference,
          unitCost,
          reason: `Configuração física da tinta: ${item.quantity} ${item.unit} / ${item.averageUnitCost.toFixed(2)} MT por ${item.unit} → ${input.quantity} frascos / ${unitCost.toFixed(2)} MT por frasco.`,
        },
      });
      const updatedItem = await transaction.stockItem.update({
        where: { id: item.id },
        data: {
          unit: 'frascos',
          quantity: input.quantity,
          minimumQuantity: input.minimumQuantity,
          averageUnitCost: unitCost,
        },
      });
      await this.registarAuditoria(
        transaction,
        actor,
        'STOCK_INK_RECONCILED',
        'STOCK',
        item.id,
        `Tinta Epson L3252 configurada: stock ${item.quantity} ${item.unit} → ${input.quantity} frascos; custo ${item.averageUnitCost.toFixed(2)} → ${unitCost.toFixed(2)} MT/frasco; mínimo definido em ${input.minimumQuantity} frascos.`,
      );
      return updatedItem;
    });
  }

  async applyPrintCostDefaults(externalReference: string, actor?: string) {
    const reference = externalReference.trim();
    if (!reference) throw new BadRequestException('Referência da operação inválida.');

    return this.prisma.$transaction(async (transaction) => {
      const paper = await transaction.stockItem.findFirst({
        where: { normalizedName: { in: ['papel a4', 'a4'] } },
      });
      const ink = await transaction.stockItem.findFirst({
        where: { normalizedName: { in: ['tinta-epson l3252', 'tinta epson l3252'] } },
      });
      if (!paper) throw new NotFoundException('Material Papel A4 não está cadastrado no stock.');
      if (!ink) throw new NotFoundException('Material Tinta Epson L3252 não está cadastrado no stock.');
      if (paper.unit.trim().toLowerCase() !== 'folhas') {
        throw new BadRequestException('O Papel A4 precisa estar controlado em folhas para aplicar o custo por folha.');
      }
      if (!['pacotes', 'frascos'].includes(ink.unit.trim().toLowerCase())) {
        throw new BadRequestException('A Tinta Epson L3252 precisa estar controlada em pacotes ou frascos.');
      }
      if (ink.quantity > 0 && ink.unit.trim().toLowerCase() !== 'frascos') {
        throw new BadRequestException('Converta o stock de tinta para frascos antes de aplicar a correção de custo.');
      }

      const materials = [
        { item: paper, newUnitCost: PRINT_COST_DEFAULTS.paperCostPerSheet, key: 'paper' },
        { item: ink, newUnitCost: PRINT_COST_DEFAULTS.blackInkBottleCost, key: 'ink' },
      ];
      const result = [];
      let appliedNewDefaults = false;
      for (const { item, newUnitCost, key } of materials) {
        const movementReference = `${reference}:${key}`;
        const previous = await transaction.stockMovement.findUnique({
          where: { externalReference: movementReference },
          include: { stockItem: true },
        });
        if (previous) {
          result.push(previous.stockItem);
          continue;
        }

        await transaction.stockMovement.create({
          data: {
            externalReference: movementReference,
            stockItemId: item.id,
            type: 'CORRECAO_CUSTO',
            quantity: 0,
            amountCents: Math.round((newUnitCost - item.averageUnitCost) * item.quantity * 100),
            unitCost: newUnitCost,
            reason: `Atualização do custo de referência para trabalhos futuros (${item.averageUnitCost.toFixed(4)} → ${newUnitCost.toFixed(4)} MT/${item.unit})`,
          },
        });
        appliedNewDefaults = true;
        result.push(await transaction.stockItem.update({
          where: { id: item.id },
          data: {
            averageUnitCost: newUnitCost,
            ...(key === 'ink' ? { unit: 'frascos' } : {}),
          },
        }));
      }
      if (appliedNewDefaults) {
        await this.registarAuditoria(
          transaction,
          actor,
          'PRINT_COST_DEFAULTS_APPLIED',
          'STOCK',
          reference,
          'Custos padrão de impressão aplicados ao Papel A4 e à tinta Epson L3252 para novas produções.',
        );
      }
      return result;
    });
  }

  async waste(stockItemId: string, input: WasteStockDto, actor?: string) {
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
      const updatedItem = await transaction.stockItem.update({
        where: { id: item.id },
        data: { quantity: item.quantity - input.quantity },
      });
      await this.registarAuditoria(
        transaction,
        actor,
        'STOCK_WASTE_RECORDED',
        'STOCK',
        item.id,
        `Desperdício de ${input.quantity} ${item.unit} de ${item.name}. Motivo: ${reason}.`,
      );
      return updatedItem;
    });
  }

  listMovements() {
    return this.prisma.stockMovement.findMany({
      include: { stockItem: true, order: { select: { id: true, number: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async bindingOptions(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Pedido não encontrado.');
    if (order.status !== 'PRINTING') {
      throw new BadRequestException('Consulte as espirais disponíveis depois de iniciar a impressão do pedido.');
    }
    if (order.bindingType.trim().toUpperCase() === 'SEM_ENCADERNACAO') {
      throw new BadRequestException('Este pedido não tem encadernação.');
    }
    if (!Number.isSafeInteger(order.copyCount) || order.copyCount < 1) {
      throw new BadRequestException('O número de exemplares do pedido é inválido.');
    }
    const requiredSheets = bindingSheetsPerCopy(order);
    const [strongCover, transparentCover] = await Promise.all([
      this.prisma.stockItem.findUnique({ where: { normalizedName: 'capa forte' } }),
      this.prisma.stockItem.findUnique({ where: { normalizedName: 'capa transparente' } }),
    ]);
    for (const cover of [
      { item: strongCover, label: 'Capa forte' },
      { item: transparentCover, label: 'Capa transparente' },
    ]) {
      if (!cover.item) {
        return {
          requiredSheets,
          copyCount: order.copyCount,
          options: [],
          blockReason: `Cadastre “${cover.label}” em unidades antes de iniciar a encadernação.`,
        };
      }
      if (!['unidade', 'unidades'].includes(cover.item.unit.trim().toLocaleLowerCase())) {
        return {
          requiredSheets,
          copyCount: order.copyCount,
          options: [],
          blockReason: `Configure “${cover.label}” para ser contado em unidades.`,
        };
      }
      if (cover.item.quantity < order.copyCount) {
        return {
          requiredSheets,
          copyCount: order.copyCount,
          options: [],
          blockReason: `Stock insuficiente de ${cover.label}: necessário ${order.copyCount}, disponível ${cover.item.quantity}.`,
        };
      }
    }

    const items = await this.prisma.stockItem.findMany({
      where: {
        bindingMinSheets: { not: null },
        bindingMaxSheets: { not: null },
        quantity: { gte: order.copyCount },
      },
      orderBy: [{ bindingMaxSheets: 'asc' }, { name: 'asc' }],
    });
    const compatible = items.filter((item) =>
      item.category.trim().toLocaleLowerCase() === 'encadernação' &&
      item.normalizedName.startsWith('espiral ') &&
      ['unidade', 'unidades'].includes(item.unit.trim().toLocaleLowerCase()) &&
      item.bindingMinSheets !== null &&
      item.bindingMaxSheets !== null &&
      item.bindingMinSheets <= requiredSheets &&
      item.bindingMaxSheets >= requiredSheets,
    );
    return {
      requiredSheets,
      copyCount: order.copyCount,
      blockReason: null,
      options: compatible.map((item) => ({
        id: item.id,
        name: item.name,
        availableQuantity: item.quantity,
        minimumSheets: item.bindingMinSheets,
        maximumSheets: item.bindingMaxSheets,
      })),
    };
  }

  async startBinding(orderId: string, spiralStockItemId: string, actor?: string) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const order = await transaction.order.findUnique({ where: { id: orderId } });
        if (!order) throw new NotFoundException('Pedido não encontrado.');

        const previous = await transaction.stockMovement.findMany({
          where: { orderId, type: 'CONSUMO_ENCADERNACAO' },
          include: { stockItem: true },
          orderBy: { createdAt: 'asc' },
        });
        if (previous.length > 0) {
          const spiral = previous.find((movement) => movement.stockItem.normalizedName.startsWith('espiral '));
          return {
            consumed: true,
            alreadyConsumed: true,
            spiralName: spiral?.stockItem.name ?? null,
            costCents: previous.reduce((total, movement) => total + (movement.amountCents ?? 0), 0),
            materials: previous.map((movement) => ({
              name: movement.stockItem.name,
              quantity: movement.quantity,
              unit: movement.stockItem.unit,
              amountCents: movement.amountCents ?? 0,
            })),
          };
        }

        if (order.status !== 'PRINTING') {
          throw new BadRequestException('Inicie a encadernação apenas depois de iniciar a impressão do pedido.');
        }
        if (order.bindingType.trim().toUpperCase() === 'SEM_ENCADERNACAO') {
          throw new BadRequestException('Este pedido não tem encadernação.');
        }

        if (!Number.isSafeInteger(order.copyCount) || order.copyCount < 1) {
          throw new BadRequestException('O número de exemplares do pedido é inválido.');
        }
        const requiredSheets = bindingSheetsPerCopy(order);
        const spiral = await transaction.stockItem.findUnique({
          where: { id: spiralStockItemId },
        });
        if (!spiral) throw new NotFoundException('A espiral selecionada não existe no stock.');
        if (
          spiral.category.trim().toLocaleLowerCase() !== 'encadernação' ||
          !spiral.normalizedName.startsWith('espiral ')
        ) {
          throw new BadRequestException(
            'O material selecionado não está identificado como espiral de encadernação.',
          );
        }
        if (!['unidade', 'unidades'].includes(spiral.unit.trim().toLocaleLowerCase())) {
          throw new BadRequestException('A espiral selecionada não está controlada em unidades.');
        }
        if (
          spiral.bindingMinSheets === null ||
          spiral.bindingMaxSheets === null ||
          spiral.bindingMinSheets > requiredSheets ||
          spiral.bindingMaxSheets < requiredSheets
        ) {
          throw new BadRequestException(
            `A capacidade confirmada de “${spiral.name}” não cobre as ${requiredSheets} folhas físicas por exemplar deste pedido. Escolha uma opção compatível.`,
          );
        }
        if (spiral.quantity < order.copyCount) {
          throw new BadRequestException(
            `Stock insuficiente de ${spiral.name}. Necessário: ${order.copyCount} unidade(s); disponível: ${spiral.quantity}.`,
          );
        }

        const requiredItems: {
          normalizedName: string | null;
          label: string;
          quantity: number;
          item: Prisma.StockItemGetPayload<Record<string, never>> | null;
        }[] = [
          {
            normalizedName: 'capa forte',
            label: 'Capa forte',
            quantity: order.copyCount,
            item: null,
          },
          {
            normalizedName: 'capa transparente',
            label: 'Capa transparente',
            quantity: order.copyCount,
            item: null,
          },
          {
            normalizedName: null,
            label: spiral.name,
            quantity: order.copyCount,
            item: spiral,
          },
        ];
        const items = await Promise.all(requiredItems.map(async (required) => {
          const stockItem = required.item ?? await transaction.stockItem.findUnique({
            where: { normalizedName: required.normalizedName ?? '' },
          });
          if (!stockItem) {
            throw new BadRequestException(
              `Cadastre no stock o material “${required.label}” com a unidade “unidades” antes de iniciar a encadernação.`,
            );
          }
          if (!['unidade', 'unidades'].includes(stockItem.unit.trim().toLowerCase())) {
            throw new BadRequestException(
              `O material “${required.label}” deve estar controlado em unidades, não em ${stockItem.unit}.`,
            );
          }
          if (stockItem.quantity < required.quantity) {
            throw new BadRequestException(
              `Stock insuficiente de ${required.label}. Necessário: ${required.quantity} unidade(s); disponível: ${stockItem.quantity}.`,
            );
          }
          return { ...required, item: stockItem };
        }));
        const operationReference = `binding-${createHash('sha256').update(orderId).digest('hex')}`;

        const materials = [];
        for (const [index, required] of items.entries()) {
          const reference = index === 0
            ? `${operationReference}-anchor`
            : `${operationReference}-${createHash('sha256').update(required.item.id).digest('hex').slice(0, 16)}`;
          const amountCents = Math.round(required.quantity * required.item.averageUnitCost * 100);
          const movement = await transaction.stockMovement.create({
            data: {
              externalReference: reference,
              stockItemId: required.item.id,
              orderId,
              type: 'CONSUMO_ENCADERNACAO',
              quantity: required.quantity,
              unitCost: required.item.averageUnitCost,
              amountCents,
              reason: `Encadernação do pedido ${order.number} (${spiral.name}; capacidade confirmada ${spiral.bindingMinSheets}–${spiral.bindingMaxSheets} folhas físicas por exemplar; ${order.copyCount} exemplar(es)).`,
            },
          });
          const update = await transaction.stockItem.updateMany({
            where: { id: required.item.id, quantity: { gte: required.quantity } },
            data: { quantity: { decrement: required.quantity } },
          });
          if (update.count !== 1) {
            throw new BadRequestException(
              `Stock insuficiente de ${required.label}. Atualize o stock e tente novamente.`,
            );
          }
          materials.push({
            name: required.item.name,
            quantity: movement.quantity,
            unit: required.item.unit,
            amountCents,
          });
        }

        const costCents = materials.reduce((total, material) => total + material.amountCents, 0);
        await this.registarAuditoria(
          transaction,
          actor,
          'ORDER_BINDING_STARTED',
          'ORDER',
          order.id,
          `Pedido ${order.number}: encadernação iniciada com ${spiral.name}, capacidade confirmada ${spiral.bindingMinSheets}–${spiral.bindingMaxSheets} folhas físicas por exemplar, para ${order.copyCount} exemplar(es); custo interno ${costCents / 100} MT.`,
        );
        return {
          consumed: true,
          alreadyConsumed: false,
          spiralName: spiral.name,
          costCents,
          materials,
        };
      }, { maxWait: 10_000, timeout: 20_000 });
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      const previous = await this.prisma.stockMovement.findMany({
        where: { orderId, type: 'CONSUMO_ENCADERNACAO' },
        include: { stockItem: true },
        orderBy: { createdAt: 'asc' },
      });
      if (previous.length === 0) throw error;
      const spiral = previous.find((movement) => movement.stockItem.normalizedName.startsWith('espiral '));
      return {
        consumed: true,
        alreadyConsumed: true,
        spiralName: spiral?.stockItem.name ?? null,
        costCents: previous.reduce((total, movement) => total + (movement.amountCents ?? 0), 0),
        materials: previous.map((movement) => ({
          name: movement.stockItem.name,
          quantity: movement.quantity,
          unit: movement.stockItem.unit,
          amountCents: movement.amountCents ?? 0,
        })),
      };
    }
  }

  listExpenses() {
    return this.prisma.expense.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  }

  listAuditLogs(skip = 0, take = 100) {
    if (!Number.isSafeInteger(skip) || skip < 0 || !Number.isSafeInteger(take) || take < 1 || take > 100) {
      throw new BadRequestException('A paginação do histórico é inválida.');
    }
    return this.prisma.adminAuditLog.findMany({
      skip,
      take,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async createExpense(input: CreateExpenseDto, actor?: string) {
    const externalReference = input.externalReference.trim();
    const description = input.description.trim();
    const category = input.category.trim();
    if (!externalReference || !description || !category || !Number.isSafeInteger(input.amountCents)) {
      throw new BadRequestException('Os dados da despesa são inválidos.');
    }
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const previous = await transaction.expense.findUnique({ where: { externalReference } });
        if (previous) return previous;
        const expense = await transaction.expense.create({
          data: {
            externalReference,
            description,
            category,
            type: input.type,
            amountCents: input.amountCents,
          },
        });
        await this.registarAuditoria(
          transaction,
          actor,
          'EXPENSE_RECORDED',
          'EXPENSE',
          expense.id,
          `Despesa ${description} registada na categoria ${category}, no valor de ${input.amountCents / 100} MT.`,
        );
        return expense;
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
          service: true,
          pageCount: true,
          copyCount: true,
          sheetsRequired: true,
          totalCents: true,
          status: true,
          stockMovements: {
            where: { type: { in: ['CONSUMO_PEDIDO', 'CONSUMO_ENCADERNACAO'] } },
            select: { type: true, quantity: true, unitCost: true, inkUnitCost: true, amountCents: true },
          },
          payments: { where: { status: 'CONFIRMED', ...(dateFilter ? { confirmedAt: dateFilter } : {}) }, select: { amountCents: true } },
        },
      }),
      this.prisma.expense.findMany({
        where: dateFilter ? { createdAt: dateFilter } : {},
        select: { amountCents: true, type: true },
      }),
    ]);
    const valorPedidosCents = orders.reduce((sum, order) => sum + (order.status === 'CANCELLED' ? 0 : order.totalCents), 0);
    const recebidoCents = orders.reduce((sum, order) => sum + order.payments.reduce((paid, payment) => paid + payment.amountCents, 0), 0);
    const porReceberCents = orders.reduce((sum, order) => {
      const received = order.payments.reduce((paid, payment) => paid + payment.amountCents, 0);
      return sum + (order.status === 'CANCELLED' ? 0 : Math.max(order.totalCents - received, 0));
    }, 0);
    const saidasCents = expenses.reduce((sum, expense) => sum + expense.amountCents, 0);
    const custosDiretosCents = orders.reduce((sum, order) => {
      if (order.status === 'CANCELLED') return sum;
      const printMaterial = order.stockMovements.find((movement) => movement.type === 'CONSUMO_PEDIDO');
      const printCost = printMaterial && PAPER_SERVICES.has(order.service)
        ? Math.round(calculatePrintCosts({
          service: order.service,
          pageCount: order.pageCount,
          copyCount: order.copyCount,
          sheetsRequired: order.sheetsRequired,
          paperCostPerSheet: printMaterial.unitCost ?? 0,
          inkBottleCost: printMaterial.inkUnitCost ?? PRINT_COST_DEFAULTS.blackInkBottleCost,
        }).total * 100)
        : 0;
      const bindingCost = order.stockMovements
        .filter((movement) => movement.type === 'CONSUMO_ENCADERNACAO')
        .reduce((total, movement) => total + (movement.amountCents ?? 0), 0);
      return sum + printCost + bindingCost;
    }, 0);
    const despesasOperacionaisCents = expenses
      .filter((expense) => expense.type !== 'COMPRA_STOCK')
      .reduce((sum, expense) => sum + expense.amountCents, 0);
    return {
      valorPedidosCents,
      valorTotalInclCancelledCents: orders.reduce((sum, order) => sum + order.totalCents, 0),
      recebidoCents,
      porReceberCents,
      saidasCents,
      saldoMovimentosCents: recebidoCents - saidasCents,
      custosDiretosCents,
      despesasOperacionaisCents,
      lucroOperacionalEstimadoCents: valorPedidosCents - custosDiretosCents - despesasOperacionaisCents,
      totalPedidos: orders.length,
      entregues: orders.filter((order) => order.status === 'DELIVERED').length,
      cancelados: orders.filter((order) => order.status === 'CANCELLED').length,
      emProducao: orders.filter((order) => order.status === 'PREPARING' || order.status === 'PRINTING').length,
    };
  }

  async startPrint(orderId: string, externalReference: string, actor?: string) {
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
      if (previous) {
        return {
          order,
          stockItem: previous.stockItem,
          movement: previous,
          costs: calculatePrintCosts({
            service: order.service,
            pageCount: order.pageCount,
            copyCount: order.copyCount,
            sheetsRequired: order.sheetsRequired,
            paperCostPerSheet: previous.unitCost ?? previous.stockItem.averageUnitCost,
            inkBottleCost: previous.inkUnitCost ?? PRINT_COST_DEFAULTS.blackInkBottleCost,
          }),
        };
      }
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
        await this.registarAuditoria(
          transaction,
          actor,
          'ORDER_PRINTING_STARTED',
          'ORDER',
          order.id,
          `Pedido ${order.number}: ${order.status} → PRINTING.`,
        );
        return {
          order: updatedOrder,
          stockItem: null,
          movement: null,
          costs: calculatePrintCosts({
            service: order.service,
            pageCount: order.pageCount,
            copyCount: order.copyCount,
            sheetsRequired: 0,
            paperCostPerSheet: 0,
          }),
        };
      }

      const paper = await transaction.stockItem.findUnique({ where: { normalizedName: 'papel a4' } })
        ?? await transaction.stockItem.findUnique({ where: { normalizedName: 'a4' } });
      const ink = await transaction.stockItem.findFirst({
        where: { normalizedName: { in: ['tinta-epson l3252', 'tinta epson l3252'] } },
      });
      if (!paper) throw new BadRequestException('Papel A4 não está cadastrado no stock.');
      if (!ink) throw new BadRequestException('A Tinta Epson L3252 não está cadastrada no stock.');
      if (!Number.isInteger(order.sheetsRequired) || order.sheetsRequired <= 0) {
        throw new BadRequestException('Este pedido não possui um cálculo válido de folhas.');
      }
      if (paper.quantity < order.sheetsRequired) {
        throw new BadRequestException(`Stock insuficiente. Necessário: ${order.sheetsRequired} folhas. Disponível: ${paper.quantity} folhas.`);
      }
      if (!['frasco', 'frascos'].includes(ink.unit.trim().toLowerCase())) {
        throw new BadRequestException('Configure a Tinta Epson L3252 para ser controlada em frascos antes de iniciar a impressão.');
      }

      const printedPages = order.pageCount * order.copyCount;
      const inkQuantity = estimateInkBottleConsumption(order.service, printedPages);
      if (inkQuantity > 0 && ink.quantity < inkQuantity) {
        throw new BadRequestException(
          `Stock de tinta insuficiente. Esta impressão necessita de aproximadamente ${inkQuantity.toFixed(6)} frasco(s), mas existem ${ink.quantity.toFixed(6)}.`,
        );
      }

      const movement = await transaction.stockMovement.create({
        data: {
          externalReference: reference,
          stockItemId: paper.id,
          orderId,
          type: 'CONSUMO_PEDIDO',
          quantity: order.sheetsRequired,
          unitCost: paper.averageUnitCost,
          inkUnitCost: ink?.averageUnitCost ?? PRINT_COST_DEFAULTS.blackInkBottleCost,
          reason: `Impressão do pedido ${order.number}`,
        },
      });
      if (inkQuantity > 0) {
        const inkMovementReference = `ink-consumption-${createHash('sha256').update(orderId).digest('hex')}`;
        await transaction.stockMovement.create({
          data: {
            externalReference: inkMovementReference,
            stockItemId: ink.id,
            orderId,
            type: 'CONSUMO_TINTA',
            quantity: inkQuantity,
            unitCost: ink.averageUnitCost,
            amountCents: Math.round(inkQuantity * ink.averageUnitCost * 100),
            reason: `Consumo estimado de tinta na impressão do pedido ${order.number} (${printedPages} página(s), incluindo 10% de reserva).`,
          },
        });
        await transaction.stockItem.update({
          where: { id: ink.id },
          data: { quantity: { decrement: inkQuantity } },
        });
      }
      const stockItem = await transaction.stockItem.update({
        where: { id: paper.id },
        data: { quantity: { decrement: order.sheetsRequired } },
      });
      const updatedOrder = await transaction.order.update({ where: { id: orderId }, data: { status: 'PRINTING' } });
      const costs = calculatePrintCosts({
        service: order.service,
        pageCount: order.pageCount,
        copyCount: order.copyCount,
        sheetsRequired: order.sheetsRequired,
        paperCostPerSheet: paper.averageUnitCost,
        inkBottleCost: ink?.averageUnitCost ?? PRINT_COST_DEFAULTS.blackInkBottleCost,
      });
      await this.registarAuditoria(
        transaction,
        actor,
        'ORDER_PRINTING_STARTED',
        'ORDER',
        order.id,
        `Pedido ${order.number}: ${order.status} → PRINTING; consumo ${order.sheetsRequired} folhas e aproximadamente ${inkQuantity.toFixed(6)} frasco(s) de tinta; custo direto estimado de ${costs.total.toFixed(2)} MT.`,
      );
      return {
        order: updatedOrder,
        stockItem,
        movement,
        costs,
      };
    }, { maxWait: 10_000, timeout: 20_000 });
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
