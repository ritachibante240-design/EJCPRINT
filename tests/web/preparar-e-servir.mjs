// Gera a versão web para testes e serve-a em http://localhost:4173.
// Usado pelo Playwright (ver playwright.config.ts).
import { spawnSync } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const PASTA = 'dist-test';
const PORTA = 4173;

if (!process.env.SALTAR_BUILD) {
  const resultado = spawnSync('npx expo export -p web --output-dir ' + PASTA, {
    stdio: 'inherit',
    shell: true,
    // Os testes simulam sempre este endereço; nenhum pedido chega ao servidor real.
    env: { ...process.env, EXPO_PUBLIC_API_URL: 'https://ejcprint-1.onrender.com/api' },
  });
  if (resultado.status !== 0) process.exit(resultado.status ?? 1);
}

const tipos = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.wasm': 'application/wasm',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

http
  .createServer((pedido, resposta) => {
    const caminhoPedido = decodeURIComponent((pedido.url ?? '/').split('?')[0]);
    let ficheiro = path.join(PASTA, caminhoPedido);
    if (!existsSync(ficheiro) || statSync(ficheiro).isDirectory()) ficheiro = path.join(PASTA, 'index.html');
    resposta.writeHead(200, { 'Content-Type': tipos[path.extname(ficheiro)] ?? 'application/octet-stream' });
    createReadStream(ficheiro).pipe(resposta);
  })
  .listen(PORTA, () => console.log(`Versão web de teste em http://localhost:${PORTA}`));
