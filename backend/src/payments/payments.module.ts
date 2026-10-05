import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
@Module({ imports: [AuthModule, StorageModule], controllers: [PaymentsController], providers: [PaymentsService] })
export class PaymentsModule {}
