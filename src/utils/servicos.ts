// Serviços digitais: o resultado é um ficheiro entregue ao cliente, não papel impresso.
//
// - Digitalização: passar um documento em papel pelo scanner (precisa do original).
// - Digitação: preparar/escrever um documento a partir de um tema e instruções.

export const SERVICO_DIGITALIZACAO = 'Digitalização';
export const SERVICO_DIGITACAO = 'Digitação';

export type FormatoEntrega = 'PDF' | 'IMAGEM' | 'WORD';
export type FormaEntrega = 'WHATSAPP' | 'PAPELARIA';

type Opcao<T> = { valor: T; titulo: string; descricao: string };

export function ehServicoDigital(servico: string): boolean {
  return servico === SERVICO_DIGITALIZACAO || servico === SERVICO_DIGITACAO;
}

export function formatosDoServico(servico: string): Opcao<FormatoEntrega>[] {
  if (servico === SERVICO_DIGITACAO) {
    return [
      { valor: 'PDF', titulo: 'PDF', descricao: 'Documento pronto a usar (não editável)' },
      { valor: 'WORD', titulo: 'Word (DOCX)', descricao: 'Documento que pode editar depois' },
    ];
  }
  return [
    { valor: 'PDF', titulo: 'PDF', descricao: 'Todas as páginas num só ficheiro (ideal para documentos)' },
    { valor: 'IMAGEM', titulo: 'Imagem (JPG)', descricao: 'Uma imagem por página (ideal para BI, certificados, fotos)' },
  ];
}

export const FORMAS_ENTREGA: Opcao<FormaEntrega>[] = [
  { valor: 'WHATSAPP', titulo: 'WhatsApp', descricao: 'Enviamos o ficheiro para o contacto indicado no pedido' },
  { valor: 'PAPELARIA', titulo: 'Levantar na papelaria', descricao: 'Traga uma pen ou cartão de memória' },
];

const NOMES_FORMATO: Record<FormatoEntrega, string> = { PDF: 'PDF', IMAGEM: 'Imagem (JPG)', WORD: 'Word (DOCX)' };

/** Ex.: "Entregar em: PDF · por WhatsApp (840000000)". Devolve null se não houver dados. */
export function descreverEntrega(
  formato: string | null | undefined,
  forma: string | null | undefined,
  contacto?: string | null,
): string | null {
  if (!formato && !forma) return null;
  const partes: string[] = [];
  if (formato) partes.push(`Entregar em: ${NOMES_FORMATO[formato as FormatoEntrega] ?? formato}`);
  if (forma === 'WHATSAPP') partes.push(`por WhatsApp${contacto ? ` (${contacto})` : ''}`);
  if (forma === 'PAPELARIA') partes.push('levantar na papelaria');
  return partes.join(' · ');
}
