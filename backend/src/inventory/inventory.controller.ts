import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdjustStockDto, InitialStockCostDto, PurchaseStockDto, StartPrintDto, WasteStockDto } from './dto/stock-operation.dto';
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
  createItem(@Body() body: CreateStockItemDto) {
    return this.inventory.createItem(body);
  }

  @Post('items/:id/purchases')
  purchase(@Param('id') id: string, @Body() body: PurchaseStockDto) {
    return this.inventory.purchase(id, body);
  }

  @Post('items/:id/adjustments')
  adjust(@Param('id') id: string, @Body() body: AdjustStockDto) {
    return this.inventory.adjust(id, body);
  }

  @Post('items/:id/initial-cost')
  setInitialCost(@Param('id') id: string, @Body() body: InitialStockCostDto) {
    return this.inventory.setInitialCost(id, body);
  }

  @Post('items/:id/waste')
  waste(@Param('id') id: string, @Body() body: WasteStockDto) {
    return this.inventory.waste(id, body);
  }

  @Get('movements')
  listMovements() {
    return this.inventory.listMovements();
  }

  @Get('expenses')
  listExpenses() {
    return this.inventory.listExpenses();
  }

  @Post('expenses')
  createExpense(@Body() body: CreateExpenseDto) {
    return this.inventory.createExpense(body);
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
  startPrint(@Param('id') id: string, @Body() body: StartPrintDto) {
    return this.inventory.startPrint(id, body.externalReference);
  }
}
