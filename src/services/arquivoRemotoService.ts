import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import * as Sharing from 'expo-sharing';

function nomeSeguro(nome: string) {
  return nome.replace(/[\\/:*?"<>|\r\n]/g, '_') || 'documento';
}

function descarregarWeb(dados: Blob, nome: string) {
  const url = URL.createObjectURL(dados);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeSeguro(nome);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function abrirArquivoPedido(uri: string, nome: string, mimeType: string, token?: string | null) {
  if (Platform.OS === 'web' && !uri.startsWith('http')) {
    descarregarWeb(new Blob([await (await fetch(uri)).blob()], { type: mimeType }), nome);
    return;
  }

  let uriLocal = uri;
  if (uri.startsWith('http')) {
    if (!token) throw new Error('Inicie sessão como administrador para abrir este ficheiro.');
    const resposta = await expoFetch(uri, { headers: { Authorization: `Bearer ${token}` } });
    if (!resposta.ok) throw new Error(`Não foi possível carregar o ficheiro (API ${resposta.status}).`);
    if (Platform.OS === 'web') {
      descarregarWeb(await resposta.blob(), nome);
      return;
    }
    const arquivo = new File(Paths.cache, `${Date.now()}-${nomeSeguro(nome)}`);
    arquivo.write(new Uint8Array(await resposta.arrayBuffer()));
    uriLocal = arquivo.uri;
  }

  if (Platform.OS === 'web') {
    descarregarWeb(await (await fetch(uriLocal)).blob(), nome);
    return;
  }

  if (!new File(uriLocal).exists) throw new Error('O ficheiro não está disponível neste dispositivo.');
  if (!(await Sharing.isAvailableAsync())) throw new Error('O compartilhamento de ficheiros não está disponível neste dispositivo.');
  await Sharing.shareAsync(uriLocal, { dialogTitle: `Abrir ${nomeSeguro(nome)}`, mimeType });
}
