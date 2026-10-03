export function formatarDinheiro(valor: number | null | undefined): string {
  const numero = Number(valor ?? 0);
  return `${numero.toLocaleString('pt-PT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} MT`;
}

export function formatarData(data: string | null | undefined): string {
  if (!data) return '—';
  const date = new Date(data);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-PT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

export function formatarDataHora(data: string | null | undefined): string {
  if (!data) return '—';
  const date = new Date(data);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-PT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
