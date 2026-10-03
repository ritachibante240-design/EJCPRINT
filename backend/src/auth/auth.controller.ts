import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { AdminAuthGuard } from './admin-auth.guard';

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

  @Post('login')
  loginUser(@Body() body: AdminLoginDto) {
    return this.auth.login(body.email, body.password);
  }

  @Post('admin/login')
  login(@Body() body: AdminLoginDto) {
    return this.auth.loginAdmin(body.email, body.password);
  }

  @Post('forgot-password')
  forgotPassword(@Body() body: ForgotPasswordDto) { return this.auth.requestPasswordReset(body.email); }

  @Post('reset-password')
  resetPassword(@Body() body: ResetPasswordDto) { return this.auth.resetPassword(body.email, body.code, body.password); }

  @UseGuards(AdminAuthGuard)
  @Post('admin/users')
  createAdminUser(@Body() body: CreateAdminUserDto) {
    return this.auth.createAdminUser(body.name, body.email, body.password);
  }
}
