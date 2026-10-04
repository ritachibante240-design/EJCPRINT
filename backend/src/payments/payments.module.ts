import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ProofStorageService } from './proof-storage.service';
import { AuthModule } from '../auth/auth.module';
@Module({ imports: [AuthModule], controllers: [PaymentsController], providers: [PaymentsService, ProofStorageService] })
export class PaymentsModule {}
