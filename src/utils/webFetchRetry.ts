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
// Leituras (GET) sem resposta desistem ao fim deste tempo e voltam a tentar,
// em vez de deixarem o ecrã à espera indefinidamente.
const LIMITE_POR_TENTATIVA_GET_MS = 20_000;

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

    if (init?.signal?.aborted) return fetchOriginal(input, init);
    const metodo = (init?.method ?? 'GET').toUpperCase();
    for (let tentativa = 0; ; tentativa += 1) {
      const ultimaTentativa = tentativa >= ATRASOS_MS.length;
      // Limite de tempo por tentativa só para leituras: envios grandes (documentos)
      // podem demorar mais numa ligação lenta e não devem ser cortados.
      const limite = metodo === 'GET' ? new AbortController() : null;
      const temporizador = limite ? setTimeout(() => limite.abort(), LIMITE_POR_TENTATIVA_GET_MS) : null;
      const cancelarLimite = () => limite?.abort();
      init?.signal?.addEventListener('abort', cancelarLimite, { once: true });
      const sinal = limite ? limite.signal : init?.signal;
      try {
        const resposta = await fetchOriginal(input, { ...init, signal: sinal ?? undefined });
        // Respostas 502/503/504 legíveis: repetir apenas pedidos de leitura.
        if (!ultimaTentativa && metodo === 'GET' && ESTADOS_TEMPORARIOS.has(resposta.status)) {
          await esperar(ATRASOS_MS[tentativa], init?.signal);
          continue;
        }
        return resposta;
      } catch (erro) {
        // Repetimos falhas de rede ("Failed to fetch") e leituras que excederam o limite,
        // nunca cancelamentos pedidos por quem chamou.
        if (init?.signal?.aborted) throw erro;
        const excedeuLimite = !!limite?.signal.aborted;
        const falhaDeRede = erro instanceof TypeError || excedeuLimite;
        if (!falhaDeRede) throw erro;
        if (ultimaTentativa) {
          throw excedeuLimite ? new TypeError('O servidor demorou demasiado a responder.') : erro;
        }
        console.warn(`[api] Servidor indisponível, nova tentativa ${tentativa + 1}/${ATRASOS_MS.length}...`);
        await esperar(ATRASOS_MS[tentativa], init?.signal);
      } finally {
        if (temporizador) clearTimeout(temporizador);
        init?.signal?.removeEventListener('abort', cancelarLimite);
      }
    }
  };

  (fetchComNovasTentativas as { __ejcRetry?: boolean }).__ejcRetry = true;
  window.fetch = fetchComNovasTentativas as typeof window.fetch;
}

instalar();

export {};
