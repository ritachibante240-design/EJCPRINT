import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AdminAuthGuard, AdminAuthenticatedRequest } from '../auth/admin-auth.guard';
import { AdjustStockDto, ApplyPrintCostDefaultsDto, ConfigureInkStockDto, InitialStockCostDto, PurchaseStockDto, SetStockUnitCostDto, StartPrintDto, WasteStockDto } from './dto/stock-operation.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateStockItemDto } from './dto/create-stock-item.dto';
import { InventoryService } from './inventory.service';

@UseGuards(AdminAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('items')
  listItems() {
    return this.inventory.listItems();
  }

  @Post('items')
  createItem(@Body() body: CreateStockItemDto, @Req() request: AdminAuthenticatedRequest) {
    return this.inventory.createItem(body, request.adminActor);
  }

  @Post('items/:id/purchases')
  purchase(@Param('id') id: string, @Body() body: PurchaseStockDto, @Req() request: AdminAuthenticatedRequest) {
    return this.inventory.purchase(id, body, request.adminActor);
  }

  @Post('items/:id/adjustments')
  adjust(@Param('id') id: string, @Body() body: AdjustStockDto, @Req() request: AdminAuthenticatedRequest) {
    return this.inventory.adjust(id, body, request.adminActor);
  }

  @Post('items/:id/initial-cost')
  setInitialCost(@Param('id') id: string, @Body() body: InitialStockCostDto, @Req() request: AdminAuthenticatedRequest) {
    return this.inventory.setInitialCost(id, body, request.adminActor);
  }

  @Post('items/:id/unit-cost')
  setUnitCost(@Param('id') id: string, @Body() body: SetStockUnitCostDto, @Req() request: AdminAuthenticatedRequest) {
    return this.inventory.setUnitCost(id, body, request.adminActor);
  }

  @Post('items/:id/ink-stock')
  configureInkStock(@Param('id') id: string, @Body() body: ConfigureInkStockDto, @Req() request: AdminAuthenticatedRequest) {
    return this.inventory.configureInkStock(id, body, request.adminActor);
  }

  @Post('cost-calculator/apply-defaults')
  applyPrintCostDefaults(@Body() body: ApplyPrintCostDefaultsDto, @Req() request: AdminAuthenticatedRequest) {
    return this.inventory.applyPrintCostDefaults(body.externalReference, request.adminActor);
  }

  @Post('items/:id/waste')
  waste(@Param('id') id: string, @Body() body: WasteStockDto, @Req() request: AdminAuthenticatedRequest) {
    return this.inventory.waste(id, body, request.adminActor);
  }

  @Get('movements')
  listMovements() {
    return this.inventory.listMovements();
  }

  @Get('expenses')
  listExpenses() {
    return this.inventory.listExpenses();
  }

  @Get('audit')
  audit(@Query('skip') skip?: string, @Query('take') take?: string) {
    const offset = skip === undefined ? 0 : Number(skip);
    const pageSize = take === undefined ? 100 : Number(take);
    return this.inventory.listAuditLogs(offset, pageSize);
  }

  @Post('expenses')
  createExpense(@Body() body: CreateExpenseDto, @Req() request: AdminAuthenticatedRequest) {
    return this.inventory.createExpense(body, request.adminActor);
  }

  @Get('expenses/summary')
  expenseSummary() {
    return this.inventory.expenseSummary();
  }

  @Get('cash/summary')
  cashSummary() {
    return this.inventory.cashSummary();
  }

  @Get('cash/movements')
  cashMovements() {
    return this.inventory.cashMovements();
  }

  @Get('reports')
  report(@Query('period') period: string) {
    return this.inventory.report(period);
  }

  @Post('orders/:id/start-print')
  startPrint(@Param('id') id: string, @Body() body: StartPrintDto, @Req() request: AdminAuthenticatedRequest) {
    return this.inventory.startPrint(id, body.externalReference, request.adminActor);
  }
}
