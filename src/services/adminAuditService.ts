import { obterTokenAdministrador } from './adminAuthService';

export type AdminAuditLog = {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  createdAt: string;
};

export async function listarHistoricoAdministrador(skip: number, take: number): Promise<AdminAuditLog[]> {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '');
  if (!apiUrl) throw new Error('Configure a URL do backend para consultar o histórico.');

  const token = await obterTokenAdministrador();
  if (!token) throw new Error('Inicie sessão como administrador para consultar o histórico.');

  const query = new URLSearchParams({ skip: String(skip), take: String(take) });
  const response = await fetch(`${apiUrl}/inventory/audit?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && 'message' in body
      && typeof body.message === 'string'
      ? body.message
      : `API respondeu ${response.status} ao consultar o histórico.`;
    throw new Error(message);
  }
  if (!Array.isArray(body)) throw new Error('O servidor devolveu um histórico inválido.');

  return body.map((entry: unknown) => {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      !('id' in entry) ||
      !('actor' in entry) ||
      !('action' in entry) ||
      !('entityType' in entry) ||
      !('entityId' in entry) ||
      !('summary' in entry) ||
      !('createdAt' in entry) ||
      typeof entry.id !== 'string' ||
      typeof entry.actor !== 'string' ||
      typeof entry.action !== 'string' ||
      typeof entry.entityType !== 'string' ||
      typeof entry.entityId !== 'string' ||
      typeof entry.summary !== 'string' ||
      typeof entry.createdAt !== 'string'
    ) {
      throw new Error('O servidor devolveu uma alteração com formato inválido.');
    }
    return {
      id: entry.id,
      actor: entry.actor,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      summary: entry.summary,
      createdAt: entry.createdAt,
    };
  });
}
