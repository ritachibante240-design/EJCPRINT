import { Module } from '@nestjs/common';
import { AdminAuthGuard } from './admin-auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({ controllers: [AuthController], providers: [AuthService, AdminAuthGuard], exports: [AuthService, AdminAuthGuard] })
export class AuthModule {}
