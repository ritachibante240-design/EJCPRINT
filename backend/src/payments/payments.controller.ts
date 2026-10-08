import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { RejectPaymentDto } from './dto/reject-payment.dto';
@Controller('payments')
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}
  @Post()
  @UseInterceptors(FileInterceptor('proof', {
    storage: memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_request, file, callback) => callback(['image/jpeg', 'image/png', 'application/pdf'].includes(file.mimetype) ? null : new BadRequestException('Formato de comprovativo não suportado.'), ['image/jpeg', 'image/png', 'application/pdf'].includes(file.mimetype)),
  }))
  create(@Body() body: CreatePaymentDto, @UploadedFile() proof?: Express.Multer.File) { return this.service.create(body, proof); }
  @UseGuards(AdminAuthGuard)
  @Post('admin/confirmed')
  createConfirmed(@Body() body: CreatePaymentDto) { return this.service.createConfirmed(body); }
  @UseGuards(AdminAuthGuard)
  @Get('pending') pending() { return this.service.pending(); }
  @UseGuards(AdminAuthGuard)
  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(id); }
  @UseGuards(AdminAuthGuard)
  @Get(':id/proof')
  async proof(@Param('id') id: string, @Res({ passthrough: true }) response: Response): Promise<StreamableFile> {
    const result = await this.service.proof(id);
    response.setHeader('Content-Type', result.mimeType);
    response.setHeader('Content-Disposition', `inline; filename="${result.name.replace(/"/g, '')}"`);
    return result.file;
  }
  @UseGuards(AdminAuthGuard)
  @Patch(':id/approve') approve(@Param('id') id: string) { return this.service.approve(id); }
  @UseGuards(AdminAuthGuard)
  @Patch(':id/reject') reject(@Param('id') id: string, @Body() body: RejectPaymentDto) { return this.service.reject(id, body.reason); }
}
