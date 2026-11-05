/*
 * Corre `prisma migrate deploy` com novas tentativas.
 *
 * A base de dados da Aiven às vezes demora a responder (por exemplo, depois de
 * estar parada). Sem isto, a primeira falha de ligação (P1001) fazia o arranque
 * na Render falhar e o serviço ficava em ciclo de reinícios.
 *
 * Só volta a tentar em erros de ligação. Erros reais de migração falham logo.
 */
const { spawnSync } = require('node:child_process');

const TENTATIVAS = Number(process.env.DB_CONNECT_RETRIES ?? 12);
const ATRASO_INICIAL_MS = 5_000;
const ATRASO_MAXIMO_MS = 20_000;
const ERROS_DE_LIGACAO = /P1001|P1002|P1008|P1017|Can't reach database server|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND/i;

function esperar(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa += 1) {
  const resultado = spawnSync(
    'npx',
    ['--no-install', 'prisma', 'migrate', 'deploy', '--schema', 'prisma/mysql/schema.prisma'],
    { encoding: 'utf8', shell: process.platform === 'win32' },
  );

  if (resultado.stdout) process.stdout.write(resultado.stdout);
  if (resultado.stderr) process.stderr.write(resultado.stderr);

  if (resultado.status === 0) process.exit(0);

  const saida = `${resultado.stdout ?? ''}\n${resultado.stderr ?? ''}\n${resultado.error?.message ?? ''}`;
  if (!ERROS_DE_LIGACAO.test(saida)) {
    console.error('[migrate] Falha na migração que não é de ligação. A parar.');
    process.exit(resultado.status ?? 1);
  }

  if (tentativa === TENTATIVAS) {
    console.error(`[migrate] A base de dados continua inacessível após ${TENTATIVAS} tentativas.`);
    process.exit(resultado.status ?? 1);
  }

  const atraso = Math.min(ATRASO_INICIAL_MS * tentativa, ATRASO_MAXIMO_MS);
  console.warn(`[migrate] Base de dados inacessível (tentativa ${tentativa}/${TENTATIVAS}). Nova tentativa em ${atraso / 1000}s...`);
  esperar(atraso);
}
