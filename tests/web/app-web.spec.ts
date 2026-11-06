import { expect, type BrowserContext, type Page, type Route, test } from '@playwright/test';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { deflateRawSync } from 'node:zlib';

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
const PDF_6_PAGINAS = path.join(PASTA_FICHEIROS, 'relatorio-6-paginas.pdf');
const DOCUMENTO_WORD = path.join(PASTA_FICHEIROS, 'carta.docx');
const DOCX_7_PAGINAS = path.join(PASTA_FICHEIROS, 'trabalho-7-paginas.docx');

/** ZIP mínimo (como um .docx) com ficheiros comprimidos; o CRC não é verificado pela app. */
function criarZip(ficheiros: Record<string, string>): Buffer {
  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  let posicao = 0;
  for (const [nome, conteudo] of Object.entries(ficheiros)) {
    const dados = deflateRawSync(Buffer.from(conteudo));
    const nomeBytes = Buffer.from(nome);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(dados.length, 18);
    local.writeUInt32LE(Buffer.byteLength(conteudo), 22);
    local.writeUInt16LE(nomeBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(dados.length, 20);
    central.writeUInt32LE(Buffer.byteLength(conteudo), 24);
    central.writeUInt16LE(nomeBytes.length, 28);
    central.writeUInt32LE(posicao, 42);
    locais.push(local, nomeBytes, dados);
    centrais.push(central, nomeBytes);
    posicao += 30 + nomeBytes.length + dados.length;
  }
  const diretorio = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(Object.keys(ficheiros).length, 8);
  fim.writeUInt16LE(Object.keys(ficheiros).length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(posicao, 16);
  return Buffer.concat([...locais, diretorio, fim]);
}

test.beforeAll(async () => {
  if (!existsSync(PASTA_FICHEIROS)) mkdirSync(PASTA_FICHEIROS, { recursive: true });
  if (!existsSync(PDF_6_PAGINAS)) {
    const pdf = await PDFDocument.create();
    for (let i = 0; i < 6; i += 1) pdf.addPage([595, 842]);
    writeFileSync(PDF_6_PAGINAS, await pdf.save());
  }
  if (!existsSync(DOCX_7_PAGINAS)) {
    writeFileSync(
      DOCX_7_PAGINAS,
      criarZip({
        '[Content_Types].xml': '<?xml version="1.0"?><Types/>',
        'word/document.xml': '<?xml version="1.0"?><w:document/>',
        'docProps/app.xml':
          '<?xml version="1.0" encoding="UTF-8"?><Properties><Pages>7</Pages><Words>1200</Words></Properties>',
      }),
    );
  }
  if (!existsSync(DOCUMENTO_WORD)) writeFileSync(DOCUMENTO_WORD, Buffer.from('PK\x03\x04 documento word de teste'));

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

test('fotocópia: o cliente é avisado para levar o original e o admin vê "Aguarda o original"', async ({ context, page }) => {
  await simularApi(context, (metodo, caminho) => {
    if (metodo === 'POST' && caminho === '/api/orders') return { status: 201, corpo: { id: 'remoto-1' } };
    return undefined;
  });
  const aviso = 'Traga o documento original à papelaria. Este pedido serve para reservar e adiantar o pagamento.';

  await page.goto('/');
  await page.getByText('Continuar como cliente').first().click();
  await page.getByText('Fazer pedido').click();
  await page.getByText('Fotocópia P/B').first().click();
  await expect(page.getByText(aviso)).toBeVisible();
  await page.getByText('Continuar', { exact: true }).first().click();
  await page.getByPlaceholder('quantidade de páginas').fill('4');
  await page.getByText('Continuar', { exact: true }).last().click();
  await expect(page.getByText(aviso)).toBeVisible();
  await page.getByPlaceholder('Nome Completo').fill('Cliente Fotocópia');
  await page.getByPlaceholder('WhatsApp / contacto').fill('840000000');
  await page.getByText('Confirmar pedido').last().click();
  await page.getByText('Agora não').click();

  await page.goto('/');
  await page.getByText('Continuar como cliente').first().click();
  await page.getByText('Pedidos', { exact: true }).last().click();
  await expect(page.getByText(aviso)).toBeVisible();

  await entrarComoAdmin(page);
  await page.getByText('Pedidos', { exact: true }).first().click();
  await expect(page.getByText('Aguarda o original')).toBeVisible();
});

test('fotocópia: o cliente pode enviar o documento em PDF e o pedido passa a Impressão P/B', async ({ context, page }) => {
  await simularApi(context);
  await page.goto('/');
  await page.getByText('Continuar como cliente').first().click();
  await page.getByText('Fazer pedido').click();
  await page.getByText('Fotocópia P/B').first().click();
  await page.getByText('Continuar', { exact: true }).first().click();
  await page.getByText('Não pode ir à papelaria?').click();
  await expect(page.getByText('Pedido alterado para Impressão P/B')).toBeVisible();
  await expect(page.getByText('Adicionar documento')).toBeVisible();
});

test('digitação: o cliente escolhe formato e entrega, o servidor recebe-os e o admin vê "Entregar em"', async ({ context, page }) => {
  let corpoPedido: Record<string, unknown> | undefined;
  await simularApi(context, (metodo, caminho, route) => {
    if (metodo === 'POST' && caminho === '/api/orders') {
      corpoPedido = route.request().postDataJSON() as Record<string, unknown>;
      return { status: 201, corpo: { id: 'remoto-digitacao' } };
    }
    return undefined;
  });

  await page.goto('/');
  await page.getByText('Continuar como cliente').first().click();
  await page.getByText('Fazer pedido').click();
  await page.getByText('Digitação', { exact: true }).first().click();
  await page.getByText('Continuar', { exact: true }).first().click();
  await page.getByPlaceholder('Escreva o tema e as instruções').fill('Digitar a carta manuscrita, letra Arial 12.');
  await page.getByPlaceholder('quantidade de páginas').fill('3');
  await expect(page.getByText('Encadernação (opcional)')).toHaveCount(0);
  await expect(page.getByText('Frente e verso')).toHaveCount(0);
  await page.getByText('Word (DOCX)').click();
  await page.getByText('WhatsApp', { exact: true }).click();
  await page.getByText('Continuar', { exact: true }).last().click();
  await page.getByPlaceholder('Nome Completo').fill('Cliente Digitação');
  await page.getByPlaceholder('WhatsApp / contacto').fill('840000000');
  await page.getByText('Confirmar pedido').last().click();
  await page.getByText('Agora não').click();

  await expect.poll(() => corpoPedido?.deliveryFormat).toBe('WORD');
  expect(corpoPedido?.deliveryMethod).toBe('WHATSAPP');

  await entrarComoAdmin(page);
  await page.getByText('Pedidos', { exact: true }).first().click();
  await expect(page.getByText('Entregar em: Word (DOCX) · por WhatsApp (840000000)')).toBeVisible();
});

test('digitalização: pede o formato e a entrega e esconde cópias e encadernação', async ({ context, page }) => {
  await simularApi(context);
  await page.goto('/');
  await page.getByText('Continuar como cliente').first().click();
  await page.getByText('Fazer pedido').click();
  await page.getByText('Digitalização', { exact: true }).first().click();
  await expect(page.getByText('Traga o documento original', { exact: false }).first()).toBeVisible();
  await page.getByText('Continuar', { exact: true }).first().click();
  await expect(page.getByText('Em que formato quer receber?')).toBeVisible();
  await expect(page.getByText('Imagem (JPG)')).toBeVisible();
  await expect(page.getByText('Levantar na papelaria')).toBeVisible();
  await expect(page.getByText('Encadernação (opcional)')).toHaveCount(0);
  await expect(page.getByText('Frente e verso')).toHaveCount(0);
});

test('PDF: as páginas são contadas sozinhas e o preço junta intervalo e páginas a cores', async ({ context, page }) => {
  let corpoPedido: Record<string, unknown> | undefined;
  await simularApi(context, (metodo, caminho, route) => {
    if (metodo === 'POST' && caminho === '/api/orders') {
      corpoPedido = route.request().postDataJSON() as Record<string, unknown>;
      return { status: 201, corpo: { id: 'remoto-cores' } };
    }
    if (caminho.endsWith('/document')) return { status: 201, corpo: { id: 'doc-cores' } };
    return undefined;
  });
  await page.goto('/');
  await page.getByText('Continuar como cliente').first().click();
  await page.getByText('Fazer pedido').click();
  await page.getByText('Impressão P/B').first().click();
  await page.getByText('Continuar', { exact: true }).first().click();
  const [escolha] = await Promise.all([page.waitForEvent('filechooser'), page.getByText('Adicionar documento').click()]);
  await escolha.setFiles(PDF_6_PAGINAS);
  await expect(page.getByText('6 páginas (contadas automaticamente no PDF)')).toBeVisible();
  await expect(page.getByPlaceholder('quantidade de páginas')).toHaveCount(0);

  // Pré-visualização abre o PDF num separador novo.
  const [previa] = await Promise.all([context.waitForEvent('page'), page.getByText('Pré-visualizar o documento').click()]);
  await previa.waitForURL(/^blob:/);
  await previa.close();

  await page.getByText('Só algumas', { exact: true }).first().click();
  await page.getByPlaceholder('início').fill('2');
  await page.getByPlaceholder('fim').fill('5');
  await page.getByText('Só algumas', { exact: true }).last().click();
  await page.getByPlaceholder('ex.: 1, 5, 8-10').fill('1');
  await expect(page.getByText('A página 1 está fora das páginas a imprimir (2 a 5).')).toBeVisible();
  await page.getByPlaceholder('ex.: 1, 5, 8-10').fill('3');
  await page.getByText('Continuar', { exact: true }).last().click();

  // 3 páginas P/B × 3 MT + 1 página colorida simples × 5 MT = 14 MT
  await expect(page.getByText('Imprimir: páginas 2 a 5 (4 páginas)')).toBeVisible();
  await expect(page.getByText('A cores: 3 (Colorida simples)')).toBeVisible();
  await expect(page.getByText('14.00 MT')).toBeVisible();
  await page.getByPlaceholder('Nome Completo').fill('Cliente Cores');
  await page.getByPlaceholder('WhatsApp / contacto').fill('840000000');
  await page.getByText('Confirmar pedido').last().click();
  await page.getByText('Agora não').click();

  await expect.poll(() => corpoPedido?.pageCount).toBe(4);
  expect(corpoPedido).toMatchObject({ unitPrice: 3, pageRange: '2-5', colorPages: '3', colorPageCount: 1, colorUnitPrice: 5 });

  await entrarComoAdmin(page);
  await page.getByText('Pedidos', { exact: true }).first().click();
  await expect(page.getByText('A cores: 3 (1 × 5 MT) · restantes P/B')).toBeVisible();
});

test('Word: o cliente é avisado e o admin vê "confirmar páginas e formatação"', async ({ context, page }) => {
  await simularApi(context, (metodo, caminho) => {
    if (metodo === 'POST' && caminho === '/api/orders') return { status: 201, corpo: { id: 'remoto-word' } };
    if (caminho.endsWith('/document')) return { status: 201, corpo: { id: 'doc-word' } };
    return undefined;
  });
  await page.goto('/');
  await page.getByText('Continuar como cliente').first().click();
  await page.getByText('Fazer pedido').click();
  await page.getByText('Impressão P/B').first().click();
  await page.getByText('Continuar', { exact: true }).first().click();
  const [escolha] = await Promise.all([page.waitForEvent('filechooser'), page.getByText('Adicionar documento').click()]);
  await escolha.setFiles(DOCUMENTO_WORD);
  await expect(page.getByText('Ficheiro Word:', { exact: false })).toBeVisible();
  await page.getByPlaceholder('quantidade de páginas').fill('2');
  await page.getByText('Continuar', { exact: true }).last().click();
  await page.getByPlaceholder('Nome Completo').fill('Cliente Word');
  await page.getByPlaceholder('WhatsApp / contacto').fill('840000000');
  await page.getByText('Confirmar pedido').last().click();
  await page.getByText('Agora não').click();

  await entrarComoAdmin(page);
  await page.getByText('Pedidos', { exact: true }).first().click();
  await expect(page.getByText('Word: confirmar páginas e formatação')).toBeVisible();
});

test('pedido pronto: o admin avisa o cliente por WhatsApp com a mensagem já escrita', async ({ context, page }) => {
  const pedidoPronto = {
    id: 'remoto-pronto',
    number: 'EJC-2026-PRONTO',
    externalReference: 'pedido-pronto',
    customerName: 'Maria Pronta',
    customerPhone: '84 123 4567',
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
    status: 'READY_FOR_PICKUP',
    createdAt: new Date().toISOString(),
    documents: [],
    payments: [{ id: 'pg-1', externalReference: 'pg-1', amountCents: 300, status: 'CONFIRMED' }],
    stockMovements: [],
  };
  await simularApi(context, (metodo, caminho) => {
    if (metodo === 'GET' && caminho === '/api/orders') return { corpo: [pedidoPronto] };
    return undefined;
  });
  await context.route('https://wa.me/**', (route) => route.fulfill({ status: 200, body: 'ok' }));
  await entrarComoAdmin(page);
  await page.getByText('Pedidos', { exact: true }).first().click();
  const [conversa] = await Promise.all([context.waitForEvent('page'), page.getByText('Avisar por WhatsApp').click()]);
  await conversa.waitForURL(/wa\.me/);
  const url = new URL(conversa.url());
  expect(url.pathname).toBe('/258841234567');
  const mensagem = url.searchParams.get('text') ?? '';
  expect(mensagem).toContain('Olá Maria, o seu pedido EJC-2026-PRONTO (Impressão P/B) na EJC Print está pronto.');
  expect(mensagem).toContain('Falta pagar 3.00 MT.');
});

test('Word: as páginas guardadas no .docx são lidas sozinhas e não há pré-visualização no navegador', async ({ context, page }) => {
  await simularApi(context);
  await page.goto('/');
  await page.getByText('Continuar como cliente').first().click();
  await page.getByText('Fazer pedido').click();
  await page.getByText('Impressão P/B').first().click();
  await page.getByText('Continuar', { exact: true }).first().click();
  const [escolha] = await Promise.all([page.waitForEvent('filechooser'), page.getByText('Adicionar documento').click()]);
  await escolha.setFiles(DOCX_7_PAGINAS);
  await expect(page.getByText('7 páginas (lidas do ficheiro Word; a papelaria confirma)')).toBeVisible();
  await expect(page.getByText('Pré-visualizar o documento')).toHaveCount(0);
  await expect(page.getByText('O navegador não consegue pré-visualizar ficheiros Word.', { exact: false })).toBeVisible();
  await page.getByText('Continuar', { exact: true }).last().click();
  await expect(page.getByText('21.00 MT')).toBeVisible();
});
