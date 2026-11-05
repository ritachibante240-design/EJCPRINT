import { INestApplication, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const TENTATIVAS = Number(process.env.DB_CONNECT_RETRIES ?? 12);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    // A Aiven pode demorar a responder; em vez de derrubar o servidor à primeira
    // falha, tentamos várias vezes com espera crescente (até ~3 minutos no total).
    for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa += 1) {
      try {
        await this.$connect();
        if (tentativa > 1) this.logger.log(`Ligado à base de dados na tentativa ${tentativa}.`);
        return;
      } catch (erro) {
        if (tentativa === TENTATIVAS) throw erro;
        const atraso = Math.min(5_000 * tentativa, 20_000);
        this.logger.warn(
          `Base de dados inacessível (tentativa ${tentativa}/${TENTATIVAS}). Nova tentativa em ${atraso / 1000}s.`,
        );
        await new Promise((resolver) => setTimeout(resolver, atraso));
      }
    }
  }

  async enableShutdownHooks(app: INestApplication) {
    process.once('beforeExit', async () => {
      await app.close();
    });
  }
}
