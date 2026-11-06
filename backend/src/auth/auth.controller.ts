import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { AdminAuthGuard } from './admin-auth.guard';
import { Throttle } from '@nestjs/throttler';
import { LimiteTentativasGuard } from './limite-tentativas.guard';

const UM_MINUTO = 60_000;
const DEZ_MINUTOS = 10 * 60_000;

class AdminLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

class CreateAdminUserDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

class ForgotPasswordDto { @IsEmail() email!: string; }
class ResetPasswordDto { @IsEmail() email!: string; @IsString() code!: string; @IsString() @MinLength(8) password!: string; }

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Máx. 5 tentativas de login por minuto e por IP.
  @UseGuards(LimiteTentativasGuard)
  @Throttle({ default: { limit: 5, ttl: UM_MINUTO } })
  @Post('login')
  loginUser(@Body() body: AdminLoginDto) {
    return this.auth.login(body.email, body.password);
  }

  @UseGuards(LimiteTentativasGuard)
  @Throttle({ default: { limit: 5, ttl: UM_MINUTO } })
  @Post('admin/login')
  login(@Body() body: AdminLoginDto) {
    return this.auth.loginAdmin(body.email, body.password);
  }

  // Máx. 3 pedidos de código em 10 minutos (evita spam de e-mails).
  @UseGuards(LimiteTentativasGuard)
  @Throttle({ default: { limit: 3, ttl: DEZ_MINUTOS } })
  @Post('forgot-password')
  forgotPassword(@Body() body: ForgotPasswordDto) { return this.auth.requestPasswordReset(body.email); }

  // Máx. 5 tentativas de código em 10 minutos (impede adivinhar o código).
  @UseGuards(LimiteTentativasGuard)
  @Throttle({ default: { limit: 5, ttl: DEZ_MINUTOS } })
  @Post('reset-password')
  resetPassword(@Body() body: ResetPasswordDto) { return this.auth.resetPassword(body.email, body.code, body.password); }

  @UseGuards(AdminAuthGuard)
  @Post('admin/users')
  createAdminUser(@Body() body: CreateAdminUserDto) {
    return this.auth.createAdminUser(body.name, body.email, body.password);
  }
}
