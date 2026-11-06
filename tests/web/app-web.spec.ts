import { expect, type BrowserContext, type Page, type Route, test } from '@playwright/test';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

// Testes da versão web da EJC Print. A API é sempre simulada (page.route):
// nenhum pedido chega à Render nem à base de dados real.

const API = '**/ejcprint-1.onrender.com/**';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};

// Ficheiros de teste gerados na hora (não precisam de estar no repositório).
const PASTA_FICHEIROS = path.join('tests', 'web', '.ficheiros');
const DOCUMENTO = path.join(PASTA_FICHEIROS, 'documento-5mb.pdf');
const COMPROVATIVO = path.join(PASTA_FICHEIROS, 'comprovativo.png');

test.beforeAll(() => {
  if (!existsSync(PASTA_FICHEIROS)) mkdirSync(PASTA_FICHEIROS, { recursive: true });
  if (!existsSync(DOCUMENTO)) {
    writeFileSync(DOCUMENTO, Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(5 * 1024 * 1024, 48), Buffer.from('\n%%EOF')]));
  }
  if (!existsSync(COMPROVATIVO)) {
    // PNG 1x1 válido
    writeFileSync(
      COMPROVATIVO,
      Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
    );
  }
});

type Resposta = { status?: number; corpo?: unknown; atrasoMs?: number } | 'falha-de-rede' | 'sem-resposta';
type Simulador = (metodo: string, caminho: string, route: Route) => Resposta | undefined;

/** Simula a API. O simulador devolve a resposta para cada pedido; por omissão, 200 com []. */
async function simularApi(contexto: BrowserContext, simulador: Simulador = () => undefined) {
  const registo: string[] = [];
  await contexto.route(API, async (route) => {
    const pedido = route.request();
    const metodo = pedido.method();
    const caminho = new URL(pedido.url()).pathname;
    if (metodo === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const linha = `${metodo} ${caminho}`;
    if (caminho === '/api/auth/login') {
      return route.fulfill({
        status: 200,
        headers: CORS,
        contentType: 'application/json',
        body: JSON.stringify({ accessToken: 'token-de-teste', expiresAt: new Date(Date.now() + 3600e3).toISOString() }),
      });
    }
    const resposta = simulador(metodo, caminho, route) ?? { status: 200, corpo: [] };
    // Só conta como recebido o que o "servidor" chegou a receber.
    registo.push(resposta === 'falha-de-rede' ? `${linha} (falha de rede simulada)` : linha);
    if (resposta === 'falha-de-rede') return route.abort('failed');
    if (resposta === 'sem-resposta') return; // servidor preso
    if (resposta.atrasoMs) await new Promise((ok) => setTimeout(ok, resposta.atrasoMs));
    return route.fulfill({
      status: resposta.status ?? 200,
      headers: CORS,
      contentType: 'application/json',
      body: JSON.stringify(resposta.corpo ?? []),
    });
  });
  return registo;
}

async function criarPedidoCliente(page: Page, nome = 'Cliente de Teste') {
  await page.goto('/');
  await page.getByText('Continuar como cliente').first().click();
  await page.getByText('Fazer pedido').click();
  await page.getByText('Impressão P/B').first().click();
  await page.getByText('Continuar', { exact: true }).first().click();
  const [escolha] = await Promise.all([page.waitForEvent('filechooser'), page.getByText('Adicionar documento').click()]);
  await escolha.setFiles(DOCUMENTO);
  await expect(page.getByText('documento-5mb.pdf')).toBeVisible();
  await page.getByPlaceholder('quantidade de páginas').fill('10');
  await page.getByText('Continuar', { exact: true }).last().click();
  await page.getByPlaceholder('Nome Completo').fill(nome);
  await page.getByPlaceholder('WhatsApp / contacto').fill('840000000');
  return page.getByText('Confirmar pedido').last();
}

async function entrarComoAdmin(page: Page) {
  await page.goto('/');
  await page.getByText('Entrar no painel').first().click();
  await page.getByPlaceholder('E-mail do administrador').fill('admin@teste.co');
  await page.getByPlaceholder('Palavra-passe').fill('palavra-passe-de-teste');
  await page.getByText('Entrar', { exact: true }).click();
  await expect(page.getByText('Pedidos', { exact: true }).first()).toBeVisible();
}

test('a app abre e a base de dados local fica pronta', async ({ context, page }) => {
  await simularApi(context);
  await page.goto('/');
  await expect(page.getByText('Como deseja entrar?')).toBeVisible({ timeout: 30_000 });
});

test('um segundo separador mostra "aberta noutra janela" e pode assumir a app', async ({ context, page }) => {
  await simularApi(context);
  await page.goto('/');
  await expect(page.getByText('Como deseja entrar?')).toBeVisible({ timeout: 30_000 });

  const segunda = await context.newPage();
  await segunda.goto('/');
  await expect(segunda.getByText('A EJC Print está aberta noutra janela')).toBeVisible();
  await segunda.getByText('Usar nesta janela').click();
  await expect(segunda.getByText('Como deseja entrar?')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('A EJC Print está aberta noutra janela')).toBeVisible();
});

test('cliques repetidos e falhas de rede criam um único pedido com o documento', async ({ context, page }) => {
  let falhas = 2;
  let tamanhoDocumento = 0;
  const registo = await simularApi(context, (metodo, caminho, route) => {
    if (falhas > 0 && caminho.startsWith('/api/orders')) {
      falhas -= 1;
      return 'falha-de-rede';
    }
    if (metodo === 'POST' && caminho === '/api/orders') {
      return { status: 201, corpo: { id: 'remoto-1', number: 'EJC-2026-TESTE01' }, atrasoMs: 1500 };
    }
    if (caminho.endsWith('/document')) {
      tamanhoDocumento = route.request().postDataBuffer()?.length ?? 0;
      return { status: 201, corpo: { id: 'doc-1' } };
    }
    return undefined;
  });

  const botao = await criarPedidoCliente(page);
  const caixa = await botao.boundingBox();
  if (!caixa) throw new Error('Botão "Confirmar pedido" não encontrado.');
  const x = caixa.x + caixa.width / 2;
  const y = caixa.y + caixa.height / 2;
  await page.mouse.click(x, y);
  await page.mouse.click(x, y);
  await page.mouse.click(x, y);
  await expect(page.getByText('Pedido criado')).toBeVisible();

  await expect.poll(() => registo.filter((linha) => linha.endsWith('/document')).length, { timeout: 60_000 }).toBe(1);
  expect(registo.filter((linha) => linha === 'POST /api/orders').length).toBe(1);
  expect(tamanhoDocumento).toBeGreaterThan(5 * 1024 * 1024);
});

test('o pagamento é enviado logo, mesmo com um pedido antigo preso', async ({ context, page }) => {
  let pedidos = 0;
  let pagamentoEnviado = false;
  await simularApi(context, (metodo, caminho) => {
    if (metodo === 'POST' && caminho === '/api/orders') {
      pedidos += 1;
      return { status: 201, corpo: { id: `remoto-${pedidos}` } };
    }
    if (caminho === '/api/orders/remoto-1/document') return 'sem-resposta'; // pedido antigo preso
    if (caminho.endsWith('/document')) return { status: 201, corpo: { id: 'doc' } };
    if (metodo === 'POST' && caminho === '/api/payments') {
      pagamentoEnviado = true;
      return { status: 201, corpo: { id: 'pag-1', status: 'PENDING' } };
    }
    return undefined;
  });

  await (await criarPedidoCliente(page, 'Pedido antigo')).click();
  await page.getByText('Agora não').click();
  await (await criarPedidoCliente(page, 'Pedido novo')).click();
  await page.getByText('Pagar 50%').click();
  const [imagem] = await Promise.all([page.waitForEvent('filechooser'), page.getByText('Escolher imagem').click()]);
  await imagem.setFiles(COMPROVATIVO);
  await page.getByText(/Enviar comprovativo/).click();
  await expect.poll(() => pagamentoEnviado, { timeout: 15_000 }).toBe(true);
});

test('um documento recusado (413) é marcado e não é reenviado sempre', async ({ context, page }) => {
  let envios = 0;
  await simularApi(context, (metodo, caminho) => {
    if (metodo === 'POST' && caminho === '/api/orders') return { status: 201, corpo: { id: 'remoto-1' } };
    if (caminho.endsWith('/document')) {
      envios += 1;
      return { status: 413, corpo: { statusCode: 413, message: 'File too large' } };
    }
    return undefined;
  });

  await (await criarPedidoCliente(page)).click();
  await expect(page.getByText('Pedido criado')).toBeVisible();
  await page.waitForTimeout(3000);
  for (let i = 0; i < 3; i += 1) {
    await page.reload();
    await page.waitForTimeout(3000);
  }
  expect(envios).toBe(1);

  await entrarComoAdmin(page);
  await page.getByText('Pedidos', { exact: true }).first().click();
  await expect(page.getByText(/Não enviado ao servidor: O documento excede/)).toBeVisible();
});

test('a lista de pedidos aparece logo, mesmo com o servidor sem responder', async ({ context, page }) => {
  await simularApi(context, () => 'sem-resposta');
  await entrarComoAdmin(page);
  await page.getByText('Pedidos', { exact: true }).first().click();
  await expect(page.getByText('A carregar pedidos...')).toBeHidden({ timeout: 5_000 });
  await expect(page.getByText('A atualizar pedidos do servidor...')).toBeVisible();
});

test('mudar o estado de um pedido não fica preso à espera da sincronização', async ({ context, page }) => {
  await simularApi(context, (metodo, caminho) => {
    if (metodo === 'POST' && caminho === '/api/orders') return { status: 201, corpo: { id: 'remoto-1' } };
    if (caminho.endsWith('/document')) return { status: 201, corpo: { id: 'doc-1' } };
    if (metodo === 'POST' && caminho === '/api/payments') return { status: 201, corpo: { id: 'pag-1', status: 'PENDING' } };
    if (metodo === 'GET' && caminho === '/api/payments/pag-1') return { corpo: { id: 'pag-1', status: 'PENDING' } };
    if (metodo === 'PATCH' && caminho === '/api/payments/pag-1/approve') {
      return { corpo: { id: 'pag-1', status: 'CONFIRMED', confirmedAt: new Date().toISOString() } };
    }
    if (metodo === 'GET' && caminho === '/api/orders/remoto-1') return { corpo: { id: 'remoto-1', status: 'RECEIVED' } };
    if (metodo === 'PATCH' && caminho === '/api/orders/remoto-1/status') {
      return { corpo: { id: 'remoto-1', status: 'PREPARING' }, atrasoMs: 2000 };
    }
    return 'sem-resposta'; // sincronização geral presa
  });

  await (await criarPedidoCliente(page)).click();
  await page.getByText('Pagar 100%').click();
  const [imagem] = await Promise.all([page.waitForEvent('filechooser'), page.getByText('Escolher imagem').click()]);
  await imagem.setFiles(COMPROVATIVO);
  await page.getByText(/Enviar comprovativo/).click();
  await page.waitForTimeout(2000);

  await entrarComoAdmin(page);
  await page.getByText('Caixa', { exact: true }).first().click();
  await page.getByText('Receber pagamento').click();
  await page.getByText('Confirmar', { exact: true }).first().click();
  await expect(page.getByText('Pagamento aprovado')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('link', { name: /back/i }).first().click();
  await page.getByText('Pedidos', { exact: true }).first().click();
  await page.getByText('Ver detalhes').first().click();
  await page.getByText('Iniciar preparação').first().click();
  await page.getByText('Confirmar', { exact: true }).last().click();
  await expect(page.getByText(/Pedido atualizado para/)).toBeVisible({ timeout: 15_000 });
});

test('um pedido que já não existe no servidor não gera alerta no acompanhamento', async ({ context, page }) => {
  await simularApi(context, (metodo, caminho) => {
    if (metodo === 'POST' && caminho === '/api/orders') return { status: 201, corpo: { id: 'remoto-apagado' } };
    if (caminho.endsWith('/document')) return { status: 201, corpo: { id: 'doc-1' } };
    if (caminho === '/api/orders/remoto-apagado/customer-status') {
      return { status: 404, corpo: { statusCode: 404, message: 'Pedido não encontrado.' } };
    }
    return undefined;
  });

  await (await criarPedidoCliente(page)).click();
  await page.getByText('Agora não').click();
  await page.goto('/');
  await page.getByText('Continuar como cliente').first().click();
  await page.getByText('Pedidos', { exact: true }).last().click();
  await expect(page.getByText('Meus pedidos').first()).toBeVisible();
  await page.waitForTimeout(6000);
  await expect(page.getByText('Pedidos não atualizados')).toBeHidden();
});

test('o cliente vê o número oficial do servidor depois de criar o pedido', async ({ context, page }) => {
  await simularApi(context, (metodo, caminho) => {
    if (metodo === 'POST' && caminho === '/api/orders') return { status: 201, corpo: { id: 'remoto-1', number: 'EJC-2026-OFICIAL' } };
    if (caminho.endsWith('/document')) return { status: 201, corpo: { id: 'doc-1' } };
    return undefined;
  });

  await (await criarPedidoCliente(page)).click();
  await page.getByText('Agora não').click();
  await page.waitForTimeout(3000);
  await page.goto('/');
  await page.getByText('Continuar como cliente').first().click();
  await page.getByText('Pedidos', { exact: true }).last().click();
  await expect(page.getByText('EJC-2026-OFICIAL')).toBeVisible();
});

test('no painel web, pedidos que já não existem no servidor saem do navegador', async ({ context, page }) => {
  const pedidoDoServidor = {
    id: 'remoto-novo',
    number: 'EJC-2026-NOVO',
    externalReference: 'pedido-do-servidor',
    customerName: 'Cliente do Servidor',
    customerPhone: '841111111',
    service: 'Impressão P/B',
    instructions: null,
    unitPriceCents: 300,
    pageCount: 2,
    copyCount: 1,
    doubleSided: false,
    sheetsRequired: 2,
    bindingType: 'SEM_ENCADERNACAO',
    bindingPriceCents: 0,
    totalCents: 600,
    status: 'RECEIVED',
    createdAt: new Date().toISOString(),
    documents: [],
    payments: [],
    stockMovements: [],
  };
  await simularApi(context, (metodo, caminho) => {
    if (metodo === 'POST' && caminho === '/api/orders') return { status: 201, corpo: { id: 'remoto-apagado' } };
    if (caminho.endsWith('/document')) return { status: 201, corpo: { id: 'doc-1' } };
    if (metodo === 'GET' && caminho === '/api/orders') return { corpo: [pedidoDoServidor] };
    return undefined;
  });

  await (await criarPedidoCliente(page, 'Pedido Apagado no Servidor')).click();
  await page.getByText('Agora não').click();
  await page.waitForTimeout(3000);

  await entrarComoAdmin(page);
  await page.getByText('Pedidos', { exact: true }).first().click();
  await expect(page.getByText('Cliente do Servidor')).toBeVisible();
  await expect(page.getByText('Pedido Apagado no Servidor')).toBeHidden();
});
