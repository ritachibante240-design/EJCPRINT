import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({ imports: [AuthModule, StorageModule], controllers: [OrdersController], providers: [OrdersService] })
export class OrdersModule {}
