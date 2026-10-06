import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(@Body() body: CreateOrderDto) {
    return this.ordersService.create(body);
  }

  @Post(':id/document')
  @UseInterceptors(FileInterceptor('document', {
    storage: memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_request, file, callback) => {
      const permitido = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ].includes(file.mimetype);
      callback(permitido ? null : new BadRequestException('Formato de documento não suportado.'), permitido);
    },
  }))
  uploadDocument(@Param('id') id: string, @UploadedFile() file?: Express.Multer.File) {
    return this.ordersService.uploadDocument(id, file);
  }

  @UseGuards(AdminAuthGuard)
  @Get()
  list() {
    return this.ordersService.list();
  }

  @Get(':id/customer-status')
  customerStatus(@Param('id') id: string) {
    return this.ordersService.customerStatus(id);
  }

  @UseGuards(AdminAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @UseGuards(AdminAuthGuard)
  @Get(':id/document')
  async document(@Param('id') id: string, @Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    const result = await this.ordersService.document(id);
    response.setHeader('Content-Type', result.mimeType);
    response.setHeader('Content-Disposition', `attachment; filename="${result.name.replace(/["\\\r\n]/g, '_')}"`);
    return result.file;
  }

  @UseGuards(AdminAuthGuard)
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() body: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(id, body.status);
  }
}
