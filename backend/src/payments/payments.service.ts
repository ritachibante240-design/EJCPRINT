import { BadRequestException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
@Injectable()
export class PaymentsService {
  private proofHashBackfill: Promise<void> | null = null;

  constructor(private readonly prisma: PrismaService) {}
  async create(input: { externalReference: string; orderId: string; amountCents: number; method: string; type: string; reference?: string }, proof?: Express.Multer.File) {
    if (input.method.trim() !== 'Dinheiro' && !proof) throw new BadRequestException('O comprovativo é obrigatório para este método de pagamento.');
    const reference = input.externalReference.trim();
    if (!reference) throw new BadRequestException('Referência do pagamento inválida.');
    const existing = await this.prisma.payment.findUnique({
      where: { externalReference: reference },
      select: { id: true, status: true, confirmedAt: true, rejectionReason: true },
    });
    if (existing) return existing;

    const proofSha256 = proof
      ? createHash('sha256').update(proof.buffer).digest('hex')
      : null;
    if (proofSha256) await this.ensureLegacyProofHashes();

    const storedProof = proof ? await this.storeProof(proof) : null;
    try {
      const result = await this.prisma.$transaction(async (transaction) => {
        const retry = await transaction.payment.findUnique({
          where: { externalReference: reference },
          select: { id: true, status: true, confirmedAt: true, rejectionReason: true },
        });
        if (retry) return { payment: retry, proofWasUsed: false };

        if (proofSha256) {
          const duplicate = await transaction.payment.findUnique({
            where: { proofSha256 },
            select: { id: true },
          });
          if (duplicate) {
            throw new BadRequestException('Este comprovativo já foi enviado noutro pagamento. Anexe um comprovativo diferente.');
          }
        }

        const order = await transaction.order.findUnique({
          where: { id: input.orderId },
          include: { payments: { where: { status: 'CONFIRMED' } } },
        });
        if (!order) throw new NotFoundException('Pedido não encontrado.');

        const hasPending = await transaction.payment.findFirst({
          where: { orderId: order.id, status: 'PENDING' },
        });
        if (hasPending) throw new BadRequestException('Já existe um pagamento aguardando análise.');

        const paidCents = order.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
        if (input.amountCents > order.totalCents - paidCents) {
          throw new BadRequestException('Valor superior ao saldo pendente do pedido.');
        }

        const payment = await transaction.payment.create({
          data: {
            externalReference: reference,
            orderId: order.id,
            amountCents: input.amountCents,
            method: input.method.trim(),
            type: input.type.trim(),
            reference: input.reference?.trim() || null,
            proofSha256,
            proofStorageKey: storedProof?.storageKey,
            proofOriginalName: storedProof?.originalName,
            proofMimeType: storedProof?.mimeType,
            proofSizeBytes: storedProof?.sizeBytes,
          },
          select: { id: true, status: true, confirmedAt: true, rejectionReason: true },
        });
        return { payment, proofWasUsed: Boolean(storedProof) };
      });

      if (storedProof && !result.proofWasUsed) {
        await unlink(join(this.storageDirectory(), storedProof.storageKey)).catch(() => undefined);
      }
      return result.payment;
    } catch (error) {
      if (storedProof) {
        await unlink(join(this.storageDirectory(), storedProof.storageKey)).catch(() => undefined);
      }
      if (this.isProofHashUniqueViolation(error)) {
        throw new BadRequestException('Este comprovativo já foi enviado noutro pagamento. Anexe um comprovativo diferente.');
      }
      throw error;
    }
  }

  pending() { return this.prisma.payment.findMany({ where: { status: 'PENDING' }, include: { order: true }, orderBy: { createdAt: 'asc' } }); }
  async findOne(id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id }, include: { order: true } });
    if (!payment) throw new NotFoundException('Pagamento não encontrado.');
    return payment;
  }

  async proof(id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment?.proofStorageKey) throw new NotFoundException('Comprovativo não encontrado.');
    const path = join(this.storageDirectory(), payment.proofStorageKey);
    return { file: new StreamableFile(createReadStream(path)), mimeType: payment.proofMimeType ?? 'application/octet-stream', name: payment.proofOriginalName ?? basename(path) };
  }

  private async storeProof(proof: Express.Multer.File) {
    const extension = extname(proof.originalname).toLowerCase() || '.bin';
    const storageKey = `${randomUUID()}${extension}`;
    await mkdir(this.storageDirectory(), { recursive: true });
    try {
      await writeFile(join(this.storageDirectory(), storageKey), proof.buffer, { flag: 'wx' });
    } catch (error) {
      await unlink(join(this.storageDirectory(), storageKey)).catch(() => undefined);
      throw error;
    }
    return {
      storageKey,
      originalName: basename(proof.originalname),
      mimeType: proof.mimetype,
      sizeBytes: proof.size,
    };
  }

  private async ensureLegacyProofHashes() {
    if (!this.proofHashBackfill) {
      this.proofHashBackfill = this.backfillLegacyProofHashes().catch((error) => {
        this.proofHashBackfill = null;
        throw error;
      });
    }
    await this.proofHashBackfill;
  }

  private async backfillLegacyProofHashes() {
    const payments = await this.prisma.payment.findMany({
      where: { proofStorageKey: { not: null }, proofSha256: null },
      select: { id: true, proofStorageKey: true },
    });
    for (const payment of payments) {
      if (!payment.proofStorageKey) continue;
      let buffer: Buffer;
      try {
        buffer = await readFile(join(this.storageDirectory(), payment.proofStorageKey));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw error;
      }
      const proofSha256 = createHash('sha256').update(buffer).digest('hex');
      try {
        await this.prisma.payment.update({ where: { id: payment.id }, data: { proofSha256 } });
      } catch (error) {
        if (!this.isProofHashUniqueViolation(error)) throw error;
      }
    }
  }

  private isProofHashUniqueViolation(error: unknown) {
    const prismaError = error as { code?: string; meta?: { target?: string | string[] } };
    if (prismaError.code !== 'P2002') return false;
    const target = Array.isArray(prismaError.meta?.target)
      ? prismaError.meta.target.join(' ')
      : String(prismaError.meta?.target ?? '');
    return target.includes('proofSha256');
  }

  private storageDirectory() {
    const configured = process.env.PAYMENT_PROOFS_DIR?.trim();
    return configured
      ? resolve(configured)
      : join(process.cwd(), 'storage', 'payment-proofs');
  }

  async approve(id: string) {
    return this.prisma.$transaction(async (transaction) => {
      const payment = await transaction.payment.findUnique({ where: { id }, include: { order: true } });
      if (!payment) throw new NotFoundException('Pagamento não encontrado.');
      if (payment.status === 'CONFIRMED') return payment;
      if (payment.status !== 'PENDING') throw new BadRequestException('Este pagamento já foi rejeitado.');

      const confirmed = await transaction.payment.aggregate({
        where: { orderId: payment.orderId, status: 'CONFIRMED' },
        _sum: { amountCents: true },
      });
      const paidCents = confirmed._sum.amountCents ?? 0;
      if (payment.amountCents > payment.order.totalCents - paidCents) {
        throw new BadRequestException('A aprovação excederia o total do pedido.');
      }

      return transaction.payment.update({ where: { id }, data: { status: 'CONFIRMED', confirmedAt: new Date() } });
    });
  }

  async reject(id: string, reason: string) {
    const motivo = reason.trim();
    if (!motivo) throw new BadRequestException('Informe o motivo.');
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException('Pagamento não encontrado.');
    if (payment.status === 'REJECTED') return payment;
    if (payment.status !== 'PENDING') throw new BadRequestException('Um pagamento confirmado não pode ser reprovado.');
    return this.prisma.payment.update({ where: { id }, data: { status: 'REJECTED', rejectionReason: motivo } });
  }
}
