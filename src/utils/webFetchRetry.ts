// Novas tentativas automáticas para pedidos à API na versão web.
//
// Quando o backend na Render está a acordar (ou à espera da base de dados na Aiven),
// a Render responde com uma página de espera sem cabeçalhos CORS. O navegador
// bloqueia essa resposta e o fetch falha com "Failed to fetch". No telemóvel isto
// não acontece porque não há CORS.
//
// Aqui substituímos o fetch global (só no navegador e só para o endereço da API) por
// uma versão que espera e volta a tentar durante cerca de 1 minuto antes de desistir.
// Tem de ser importado antes de qualquer outro módulo (ver index.ts), porque o
// expo/fetch guarda uma referência ao fetch global quando é carregado.

const ATRASOS_MS = [3_000, 5_000, 8_000, 12_000, 15_000, 20_000];
const ESTADOS_TEMPORARIOS = new Set([502, 503, 504]);

function obterUrlApi() {
  const url = process.env.EXPO_PUBLIC_API_URL?.trim();
  return url ? url.replace(/\/$/, '') : null;
}

function urlDoPedido(input: RequestInfo | URL): string | null {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return null; // Objetos Request não são repetidos (o corpo só pode ser lido uma vez).
}

function esperar(ms: number, sinal?: AbortSignal | null) {
  return new Promise<void>((resolver, rejeitar) => {
    const temporizador = setTimeout(resolver, ms);
    sinal?.addEventListener(
      'abort',
      () => {
        clearTimeout(temporizador);
        rejeitar(sinal.reason ?? new DOMException('Pedido cancelado.', 'AbortError'));
      },
      { once: true },
    );
  });
}

function instalar() {
  const ehNavegador = typeof window !== 'undefined' && typeof document !== 'undefined';
  const apiUrl = obterUrlApi();
  if (!ehNavegador || !apiUrl || typeof window.fetch !== 'function') return;

  const fetchOriginal = window.fetch.bind(window);
  if ((fetchOriginal as { __ejcRetry?: boolean }).__ejcRetry) return;

  const fetchComNovasTentativas = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlDoPedido(input);
    if (!url || !url.startsWith(apiUrl)) return fetchOriginal(input, init);

    const metodo = (init?.method ?? 'GET').toUpperCase();
    for (let tentativa = 0; ; tentativa += 1) {
      const ultimaTentativa = tentativa >= ATRASOS_MS.length;
      try {
        const resposta = await fetchOriginal(input, init);
        // Respostas 502/503/504 legíveis: repetir apenas pedidos de leitura.
        if (!ultimaTentativa && metodo === 'GET' && ESTADOS_TEMPORARIOS.has(resposta.status)) {
          await esperar(ATRASOS_MS[tentativa], init?.signal);
          continue;
        }
        return resposta;
      } catch (erro) {
        // Só repetimos falhas de rede ("Failed to fetch"), nunca cancelamentos.
        const falhaDeRede = erro instanceof TypeError;
        if (!falhaDeRede || ultimaTentativa || init?.signal?.aborted) throw erro;
        console.warn(`[api] Servidor indisponível, nova tentativa ${tentativa + 1}/${ATRASOS_MS.length}...`);
        await esperar(ATRASOS_MS[tentativa], init?.signal);
      }
    }
  };

  (fetchComNovasTentativas as { __ejcRetry?: boolean }).__ejcRetry = true;
  window.fetch = fetchComNovasTentativas as typeof window.fetch;
}

instalar();

export {};
