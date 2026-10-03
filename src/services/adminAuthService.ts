import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const SESSION_KEY = 'ejc-print.admin-session';

type SessaoArmazenada = {
  accessToken: string;
  expiresAt: string;
};

async function guardarSessao(chave: string, valor: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(chave, valor);
    }
    return;
  }
  await SecureStore.setItemAsync(chave, valor);
}

async function lerSessao(chave: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(chave);
    }
    return null;
  }
  return await SecureStore.getItemAsync(chave);
}

async function removerSessao(chave: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(chave);
    }
    return;
  }
  await SecureStore.deleteItemAsync(chave);
}

function urlApi() {
  const url = process.env.EXPO_PUBLIC_API_URL?.trim();
  return url ? url.replace(/\/$/, '') : null;
}

async function mensagemDaResposta(resposta: Response) {
  try {
    const corpo = (await resposta.json()) as { message?: string | string[] };
    if (Array.isArray(corpo.message)) return corpo.message[0] ?? 'Não foi possível iniciar a sessão.';
    return corpo.message ?? 'Não foi possível iniciar a sessão.';
  } catch {
    return 'Não foi possível iniciar a sessão.';
  }
}

export async function iniciarSessaoAdministrador(email: string, password: string) {
  const api = urlApi();
  if (!api) throw new Error('Configure EXPO_PUBLIC_API_URL para autenticar o administrador.');

  const resposta = await fetch(`${api}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  if (!resposta.ok) throw new Error(await mensagemDaResposta(resposta));

  const sessao = (await resposta.json()) as SessaoArmazenada;
  if (!sessao.accessToken || !sessao.expiresAt) throw new Error('O servidor não retornou uma sessão válida.');
  await guardarSessao(SESSION_KEY, JSON.stringify(sessao));
}

async function enviarAuth(body: Record<string, string>) {
  const api = urlApi();
  if (!api) throw new Error('Configure EXPO_PUBLIC_API_URL para recuperar a palavra-passe.');
  const resposta = await fetch(`${api}/auth/${body.code ? 'reset-password' : 'forgot-password'}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resposta.ok) throw new Error(await mensagemDaResposta(resposta));
  return resposta.json() as Promise<{ message: string }>;
}

export function solicitarRecuperacaoAdministrador(email: string) {
  return enviarAuth({ email: email.trim() });
}

export function redefinirPasswordAdministrador(email: string, code: string, password: string) {
  return enviarAuth({ email: email.trim(), code: code.trim(), password });
}

export async function obterTokenAdministrador() {
  const armazenada = await lerSessao(SESSION_KEY);
  if (!armazenada) return null;

  try {
    const sessao = JSON.parse(armazenada) as SessaoArmazenada;
    if (!sessao.accessToken || new Date(sessao.expiresAt).getTime() <= Date.now()) {
      await removerSessao(SESSION_KEY);
      return null;
    }
    return sessao.accessToken;
  } catch {
    await removerSessao(SESSION_KEY);
    return null;
  }
}

export async function terminarSessaoAdministrador() {
  await removerSessao(SESSION_KEY);
}
