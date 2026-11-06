/**
 * Origens (sites) autorizadas a chamar a API a partir de um navegador.
 *
 * - A app do telemóvel não envia o cabeçalho Origin, por isso continua sempre aceite.
 * - Produção: a versão web publicada na Vercel.
 * - Desenvolvimento: localhost / 127.0.0.1 e IPs da rede local (Expo web).
 * - Origens extra podem ser acrescentadas sem mexer no código com a variável
 *   CORS_ORIGINS (lista separada por vírgulas), por exemplo um domínio próprio.
 */
const ORIGENS_FIXAS = [
  'https://ejcprint-mz.vercel.app',
  'https://dist-five-delta-47.vercel.app',
];

const PADROES = [
  // Deploys da Vercel deste projeto (ex.: https://dist-abc123-chiba-service.vercel.app)
  /^https:\/\/dist-[a-z0-9-]+-chiba-service\.vercel\.app$/,
  // Desenvolvimento local
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  // Expo web aberto pelo IP da rede local (192.168.x.x / 10.x.x.x)
  /^http:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$/,
];

export function origensExtra(valor = process.env.CORS_ORIGINS): string[] {
  return (valor ?? '')
    .split(',')
    .map((origem) => origem.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

export function origemPermitida(origem: string | undefined, extra: string[] = origensExtra()): boolean {
  if (!origem) return true; // app do telemóvel, curl, servidores
  const normalizada = origem.replace(/\/$/, '');
  if (ORIGENS_FIXAS.includes(normalizada) || extra.includes(normalizada)) return true;
  return PADROES.some((padrao) => padrao.test(normalizada));
}
