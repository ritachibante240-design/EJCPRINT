import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { db } from '../database/database';

export function descarregarBackupWeb(dados: Uint8Array, nome: string) {
  const blob = new Blob([dados as any], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function criarBackup() {
  try {
    const data = new Date();

    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    const hora = String(data.getHours()).padStart(2, '0');
    const minuto = String(data.getMinutes()).padStart(2, '0');

    const nomeBackup =
      `EJCPrint_Backup_${ano}-${mes}-${dia}_${hora}-${minuto}.db`;

    // Na Web, descarrega diretamente o ficheiro de backup .db no navegador
    if (Platform.OS === 'web') {
      const dados = await db.serializeAsync();
      descarregarBackupWeb(dados, nomeBackup);

      return {
        sucesso: true,
        nome: nomeBackup,
        caminho: nomeBackup,
      };
    }

    const destino = new File(Paths.cache, nomeBackup);

    // Serializa a base aberta pelo expo-sqlite. Isto evita depender de um
    // caminho físico que varia entre Android, iOS e Expo Go.
    const dados = await db.serializeAsync();
    destino.write(dados);

    const podePartilhar =
      await Sharing.isAvailableAsync();

    if (!podePartilhar) {
      throw new Error(
        'O compartilhamento de ficheiros não está disponível neste dispositivo.'
      );
    }

    await Sharing.shareAsync(destino.uri, {
      mimeType: 'application/octet-stream',
      dialogTitle: 'Guardar backup da EJC Print',
      UTI: 'public.database',
    });

    return {
      sucesso: true,
      nome: nomeBackup,
      caminho: destino.uri,
    };
  } catch (error) {
    console.error(
      'Erro ao criar backup:',
      error
    );

    const mensagem = error instanceof Error ? error.message : '';
    if (/closed|close|database/i.test(mensagem)) {
      throw new Error(
        'A base de dados está fechada após a restauração. Feche completamente e abra novamente a aplicação antes de criar outro backup.'
      );
    }

    throw error;
  }
}
