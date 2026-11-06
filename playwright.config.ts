import { defineConfig } from '@playwright/test';

// Testes automáticos da versão web (npm run test:web).
// Geram o site em dist-test/, servem-no em http://localhost:4173 e simulam a API
// (nenhum pedido chega à Render nem à base de dados real).
export default defineConfig({
  testDir: './tests/web',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1280, height: 900 },
    // No Windows usa o Microsoft Edge já instalado; noutros ambientes pode indicar-se
    // o caminho de um Chrome/Chromium em CHROME_PATH.
    ...(process.env.CHROME_PATH
      ? { launchOptions: { executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] } }
      : { channel: process.env.PW_CHANNEL ?? 'msedge' }),
  },
  webServer: {
    command: 'node tests/web/preparar-e-servir.mjs',
    url: 'http://localhost:4173',
    timeout: 600_000,
    reuseExistingServer: !process.env.CI,
  },
});
