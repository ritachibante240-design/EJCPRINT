import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import nodemailer from 'nodemailer';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type AdminSession = {
  sub: string;
  role: 'ADMIN';
  iat: number;
  exp: number;
  sessionVersion?: number;
};

@Injectable()
export class AuthService {
  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) {}

  async login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (user?.role === 'ADMIN' && user.passwordHash && this.matchesPassword(password, user.passwordHash)) {
      return this.createSession(user.id, 'ADMIN', user.sessionVersion);
    }
    return this.loginAdmin(email, password);
  }

  async createAdminUser(name: string, email: string, password: string) {
    try {
      return await this.prisma.user.create({
        data: { name: name.trim(), email: email.trim().toLowerCase(), passwordHash: this.hashPassword(password), role: 'ADMIN' },
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'P2002') throw new ConflictException('Já existe um utilizador com este e-mail.');
      throw error;
    }
  }

  loginAdmin(email: string, password: string) {
    const adminEmail = this.required('ADMIN_EMAIL').toLowerCase();
    const passwordHash = this.required('ADMIN_PASSWORD_HASH');

    if (email.trim().toLowerCase() !== adminEmail || !this.matchesPassword(password, passwordHash)) {
      throw new UnauthorizedException('Credenciais de administrador inválidas.');
    }

    return this.createSession(adminEmail, 'ADMIN');
  }

  async requestPasswordReset(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (user?.role === 'ADMIN' && user.passwordHash) {
      const code = randomBytes(4).toString('hex').toUpperCase();
      const tokenHash = createHash('sha256').update(code).digest('hex');
      await this.prisma.user.update({ where: { id: user.id }, data: { resetTokenHash: tokenHash, resetTokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000), resetTokenUsedAt: null } });
      const configuredHost = this.required('SMTP_HOST');
      const smtpHost = configuredHost === 'smtp.test' ? 'smtp.gmail.com' : configuredHost;
      const transporter = nodemailer.createTransport({ host: smtpHost, port: Number(this.required('SMTP_PORT')), secure: this.config.get<string>('SMTP_SECURE') === 'true', auth: { user: this.config.get<string>('SMTP_USER') ?? this.required('SMTP_USERNAME'), pass: this.config.get<string>('SMTP_PASS') ?? this.required('SMTP_PASSWORD') } });
      await transporter.sendMail({
        from: this.required('SMTP_FROM'),
        to: user.email!,
        subject: 'Código de recuperação — EJC Print',
        text: `Olá ${user.name},\n\nRecebemos um pedido para redefinir a palavra-passe da sua conta administrativa EJC Print.\n\nCódigo de recuperação: ${code}\n\nEste código expira em 10 minutos e só pode ser usado uma vez. Se não fez este pedido, ignore este e-mail.\n\nEJC Print\nImpressão e serviços`,
        html: `<!doctype html><html lang="pt"><body style="margin:0;background:#f5f7fa;font-family:Arial,sans-serif;color:#102a43"><div style="padding:32px 16px"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6eaf0;border-radius:20px;overflow:hidden"><div style="background:#102a43;padding:26px 30px"><div style="font-size:25px;font-weight:800;letter-spacing:1px;color:#fff">EJC <span style="color:#45c4a1">PRINT</span></div><div style="color:#c9d8e6;font-size:13px;margin-top:6px">Impressão e serviços</div></div><div style="padding:32px 30px"><div style="color:#147d64;font-size:12px;font-weight:700;letter-spacing:1px">ÁREA ADMINISTRATIVA</div><h1 style="font-size:26px;margin:12px 0 10px;color:#102a43">Redefinir palavra-passe</h1><p style="font-size:16px;line-height:1.6;color:#627d98;margin:0 0 22px">Olá ${user.name}, recebemos um pedido para redefinir a palavra-passe da sua conta.</p><div style="background:#f0f4f8;border-radius:14px;padding:20px;text-align:center"><div style="font-size:12px;color:#627d98;text-transform:uppercase;letter-spacing:1px">Seu código de recuperação</div><div style="font-size:32px;font-weight:800;letter-spacing:6px;color:#102a43;margin-top:10px">${code}</div></div><p style="font-size:14px;line-height:1.6;color:#627d98;margin:22px 0 0">Este código expira em <strong>10 minutos</strong> e só pode ser usado uma vez.</p><p style="font-size:13px;line-height:1.6;color:#829ab1;margin:18px 0 0">Se não solicitou esta alteração, ignore este e-mail. A sua palavra-passe continuará inalterada.</p></div><div style="border-top:1px solid #e6eaf0;padding:20px 30px;color:#829ab1;font-size:12px">EJC Print · Impressão e serviços</div></div></div></body></html>`,
      });
    }
    return { message: 'Se o e-mail estiver registado, receberá um código de recuperação.' };
  }

  async resetPassword(email: string, code: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    const hash = createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
    if (!user || user.role !== 'ADMIN' || !user.resetTokenHash || user.resetTokenHash !== hash || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date() || user.resetTokenUsedAt) throw new UnauthorizedException('Código inválido ou expirado.');
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: this.hashPassword(password), sessionVersion: { increment: 1 }, resetTokenHash: null, resetTokenExpiresAt: null, resetTokenUsedAt: new Date() } });
    return { message: 'Palavra-passe redefinida. Faça login novamente.' };
  }

  private createSession(sub: string, role: 'ADMIN', sessionVersion = 0) {
    const now = Math.floor(Date.now() / 1000);
    const payload: AdminSession = { sub, role, iat: now, exp: now + 60 * 60 * 12, sessionVersion } as AdminSession;
    return { accessToken: this.sign(payload), expiresAt: new Date(payload.exp * 1000).toISOString() };
  }

  verifyAdminToken(token: string): AdminSession {
    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature || signature !== this.signature(encodedPayload)) {
      throw new UnauthorizedException('Sessão de administrador inválida.');
    }

    try {
      const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as AdminSession;
      if (payload.role !== 'ADMIN' || !payload.sub || !Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) {
        throw new UnauthorizedException('Sessão de administrador expirada.');
      }
      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Sessão de administrador inválida.');
    }
  }

  private matchesPassword(password: string, stored: string) {
    const [salt, expectedHex] = stored.split(':');
    if (!salt || !expectedHex || !/^[a-f0-9]+$/i.test(expectedHex)) {
      throw new InternalServerErrorException('ADMIN_PASSWORD_HASH está mal configurado.');
    }
    const expected = Buffer.from(expectedHex, 'hex');
    const actual = scryptSync(password, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
  }

  private sign(payload: AdminSession) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${this.signature(encoded)}`;
  }

  private signature(encodedPayload: string) {
    return createHmac('sha256', this.required('ADMIN_SESSION_SECRET')).update(encodedPayload).digest('base64url');
  }

  private required(name: string) {
    const value = this.config.get<string>(name)?.trim();
    if (!value) throw new InternalServerErrorException(`${name} não foi configurado no servidor.`);
    return value;
  }
}
