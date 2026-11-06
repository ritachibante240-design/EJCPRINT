import { Platform } from 'react-native';
import * as FileSystemLegacy from 'expo-file-system/legacy';

/**
 * Conta as páginas de um PDF no próprio dispositivo (o ficheiro não sai do telemóvel/navegador).
 * Devolve null quando não for possível ler (PDF protegido, danificado ou outro formato):
 * nesse caso o cliente escreve o número e a papelaria confirma.
 */
export async function contarPaginasPdf(fonte: { uri: string; file?: Blob | null }): Promise<number | null> {
  try {
    let bytes: Uint8Array | string;
    if (Platform.OS === 'web') {
      if (!fonte.file) return null;
      bytes = new Uint8Array(await fonte.file.arrayBuffer());
    } else {
      bytes = await FileSystemLegacy.readAsStringAsync(fonte.uri, {
        encoding: FileSystemLegacy.EncodingType.Base64,
      });
    }
    // Usa o pacote já compilado do pdf-lib: a versão "es" dele falha no Metro por causa do tslib.
    const { PDFDocument } = (await import('pdf-lib/dist/pdf-lib.min.js')) as typeof import('pdf-lib');
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const total = pdf.getPageCount();
    return Number.isSafeInteger(total) && total > 0 ? total : null;
  } catch (erro) {
    console.warn('[paginas] Não foi possível contar as páginas do PDF:', erro);
    return null;
  }
}

export function ehPdf(nome: string | undefined | null, mimeType?: string | null): boolean {
  return mimeType === 'application/pdf' || /\.pdf$/i.test(nome ?? '');
}

export function ehWord(nome: string | undefined | null, mimeType?: string | null): boolean {
  return (
    mimeType === 'application/msword' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    /\.docx?$/i.test(nome ?? '')
  );
}

export type ResultadoListaPaginas = { paginas: number[]; erro?: undefined } | { paginas?: undefined; erro: string };

/**
 * Lê uma lista como "1, 5, 8-10" e devolve as páginas (sem repetições, por ordem).
 * Todas têm de estar entre `inicio` e `fim` (as páginas que vão ser impressas).
 */
export function interpretarListaPaginas(texto: string, inicio: number, fim: number): ResultadoListaPaginas {
  const partes = texto.split(/[,;\s]+/).map((parte) => parte.trim()).filter(Boolean);
  if (partes.length === 0) return { erro: 'Indique as páginas a cores, por exemplo: 1, 5, 8-10.' };
  const paginas = new Set<number>();
  for (const parte of partes) {
    const intervalo = /^(\d+)\s*-\s*(\d+)$/.exec(parte);
    const unica = /^\d+$/.test(parte) ? Number(parte) : null;
    const de = intervalo ? Number(intervalo[1]) : unica;
    const ate = intervalo ? Number(intervalo[2]) : unica;
    if (de === null || ate === null || !Number.isSafeInteger(de) || !Number.isSafeInteger(ate) || ate < de) {
      return { erro: `"${parte}" não é uma página válida. Use, por exemplo: 1, 5, 8-10.` };
    }
    if (de < inicio || ate > fim) {
      return { erro: `A página ${de < inicio ? de : ate} está fora das páginas a imprimir (${inicio} a ${fim}).` };
    }
    for (let pagina = de; pagina <= ate; pagina += 1) paginas.add(pagina);
  }
  return { paginas: [...paginas].sort((a, b) => a - b) };
}

/** [1, 5, 8, 9, 10] → "1, 5, 8-10" */
export function formatarListaPaginas(paginas: number[]): string {
  const blocos: string[] = [];
  let i = 0;
  while (i < paginas.length) {
    let j = i;
    while (j + 1 < paginas.length && paginas[j + 1] === paginas[j] + 1) j += 1;
    blocos.push(j > i ? `${paginas[i]}-${paginas[j]}` : String(paginas[i]));
    i = j + 1;
  }
  return blocos.join(', ');
}

/** Número de WhatsApp em formato internacional (Moçambique por omissão), ou null. */
export function numeroWhatsApp(contacto: string | null | undefined): string | null {
  const digitos = (contacto ?? '').replace(/\D/g, '');
  if (/^8\d{8}$/.test(digitos)) return `258${digitos}`;
  if (/^2588\d{8}$/.test(digitos)) return digitos;
  if (/^00\d{8,15}$/.test(digitos)) return digitos.slice(2);
  if (/^\d{10,15}$/.test(digitos)) return digitos;
  return null;
}
