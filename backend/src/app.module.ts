import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.module';
import { PaymentsModule } from './payments/payments.module';
import { AuthModule } from './auth/auth.module';
import { InventoryModule } from './inventory/inventory.module';
import { PrivacyController } from './privacy/privacy.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Limite de tentativas nas rotas de autenticação (aplicado em auth.controller.ts).
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 5 }],
      errorMessage: (_contexto, detalhe) => {
        const minutos = Math.max(1, Math.ceil(detalhe.timeToBlockExpire / 60));
        return `Demasiadas tentativas. Aguarde ${minutos} minuto${minutos === 1 ? '' : 's'} e tente novamente.`;
      },
    }),
    PrismaModule,
    AuthModule,
    OrdersModule,
    PaymentsModule,
    InventoryModule,
  ],
  controllers: [PrivacyController],
})
export class AppModule {}
