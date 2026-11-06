import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { origemPermitida } from './cors-origins';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Só a app (Vercel), o localhost e a app do telemóvel podem chamar a API.
  app.enableCors({
    origin: (origem: string | undefined, responder: (erro: Error | null, permitir?: boolean) => void) => {
      responder(null, origemPermitida(origem));
    },
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
