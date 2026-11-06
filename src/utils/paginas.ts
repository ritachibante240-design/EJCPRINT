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

async function lerBytes(fonte: { uri: string; file?: Blob | null }): Promise<Uint8Array | null> {
  if (Platform.OS === 'web') {
    return fonte.file ? new Uint8Array(await fonte.file.arrayBuffer()) : null;
  }
  const base64 = await FileSystemLegacy.readAsStringAsync(fonte.uri, {
    encoding: FileSystemLegacy.EncodingType.Base64,
  });
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/** Lê um ficheiro de dentro de um ZIP (um .docx é um ZIP). Devolve o texto ou null. */
async function lerFicheiroDoZip(zip: Uint8Array, nomeProcurado: string): Promise<string | null> {
  const vista = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  // Fim do diretório central (assinatura 0x06054b50), procurado a partir do fim.
  let fim = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i -= 1) {
    if (vista.getUint32(i, true) === 0x06054b50) {
      fim = i;
      break;
    }
  }
  if (fim < 0) return null;
  const totalEntradas = vista.getUint16(fim + 10, true);
  let posicao = vista.getUint32(fim + 16, true);
  for (let n = 0; n < totalEntradas && posicao + 46 <= zip.length; n += 1) {
    if (vista.getUint32(posicao, true) !== 0x02014b50) return null;
    const metodo = vista.getUint16(posicao + 10, true);
    const tamanhoComprimido = vista.getUint32(posicao + 20, true);
    const tamanhoNome = vista.getUint16(posicao + 28, true);
    const tamanhoExtra = vista.getUint16(posicao + 30, true);
    const tamanhoComentario = vista.getUint16(posicao + 32, true);
    const inicioLocal = vista.getUint32(posicao + 42, true);
    const nome = String.fromCharCode(...zip.subarray(posicao + 46, posicao + 46 + tamanhoNome));
    if (nome === nomeProcurado) {
      const inicioDados =
        inicioLocal + 30 + vista.getUint16(inicioLocal + 26, true) + vista.getUint16(inicioLocal + 28, true);
      const dados = zip.subarray(inicioDados, inicioDados + tamanhoComprimido);
      if (metodo === 0) return String.fromCharCode(...dados);
      if (metodo !== 8) return null;
      const pako = await import('pako');
      return pako.inflateRaw(dados, { to: 'string' });
    }
    posicao += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario;
  }
  return null;
}

/**
 * Num .docx, o Word guarda o número de páginas em docProps/app.xml quando grava o ficheiro.
 * É uma boa estimativa (a papelaria confirma). Ficheiros .doc antigos ou exportados por
 * programas que não guardam este número devolvem null.
 */
export async function contarPaginasWord(fonte: { uri: string; file?: Blob | null }): Promise<number | null> {
  try {
    const bytes = await lerBytes(fonte);
    if (!bytes || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return null; // não é ZIP (ex.: .doc antigo)
    const xml = await lerFicheiroDoZip(bytes, 'docProps/app.xml');
    const total = Number(/<Pages>\s*(\d+)\s*<\/Pages>/.exec(xml ?? '')?.[1]);
    return Number.isSafeInteger(total) && total > 0 ? total : null;
  } catch (erro) {
    console.warn('[paginas] Não foi possível ler as páginas do ficheiro Word:', erro);
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
