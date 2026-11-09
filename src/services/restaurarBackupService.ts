import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

import { getDb } from '../database/database';
import { descarregarBackupWeb } from './backupService';

// Tabelas que um backup verdadeiro da EJC Print tem de conter. Serve para recusar
// ficheiros .db de outra aplicação antes de substituir os dados.
const TABELAS_ESSENCIAIS = ['pedidos', 'pagamentos', 'stock'] as const;

function carimboDeTempo(data = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${data.getFullYear()}-${p(data.getMonth() + 1)}-${p(data.getDate())}_${p(data.getHours())}-${p(
    data.getMinutes(),
  )}-${p(data.getSeconds())}`;
}

/** Confirma que o ficheiro selecionado é mesmo uma base de dados da EJC Print. */
async function validarBancoEjc(banco: SQLite.SQLiteDatabase) {
  const existentes = await banco.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table'",
  );
  const nomes = new Set(existentes.map((linha) => linha.name));
  const emFalta = TABELAS_ESSENCIAIS.filter((tabela) => !nomes.has(tabela));
  if (emFalta.length > 0) {
    throw new Error('O ficheiro selecionado não é um backup válido da EJC Print.');
  }
}

/**
 * Seleciona um backup .db e substitui os dados atuais do dispositivo por esse backup.
 *
 * Antes de substituir, guarda sempre uma cópia de emergência dos dados atuais, para que
 * a operação seja reversível mesmo que o utilizador escolha o ficheiro errado:
 * - no telemóvel, num ficheiro na área da aplicação;
 * - na web, descarregando um ficheiro .db para o computador.
 */
export async function selecionarERestaurarBackup() {
  const resultado = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: Platform.OS !== 'android',
    multiple: false,
    base64: false,
  });
  if (resultado.canceled) {
    return { cancelado: true as const, nome: null };
  }

  const arquivo = resultado.assets[0];
  const nomeArquivo = arquivo.name;
  if (!nomeArquivo.toLowerCase().endsWith('.db')) {
    throw new Error('Selecione um ficheiro de backup .db da EJC Print.');
  }

  let conteudoBackup: Uint8Array;
  if (Platform.OS === 'web') {
    conteudoBackup = arquivo.file ? new Uint8Array(await arquivo.file.arrayBuffer()) : new Uint8Array();
  } else {
    const arquivoCache = new File(Paths.cache, `backup-selecionado-${Date.now()}.db`);
    try {
      await FileSystemLegacy.copyAsync({ from: arquivo.uri, to: arquivoCache.uri });
      if (!arquivoCache.exists || arquivoCache.size === 0) {
        throw new Error('Não foi possível copiar o backup selecionado para o armazenamento do aplicativo.');
      }
      conteudoBackup = await arquivoCache.bytes();
    } finally {
      if (arquivoCache.exists) arquivoCache.delete();
    }
  }

  if (conteudoBackup.length === 0) {
    throw new Error('O ficheiro de backup não foi encontrado ou está vazio.');
  }

  const identificador = carimboDeTempo();
  const bancoAtual = await getDb();

  if (Platform.OS === 'web') {
    let bancoImportado: SQLite.SQLiteDatabase;
    try {
      bancoImportado = await SQLite.deserializeDatabaseAsync(conteudoBackup);
    } catch {
      throw new Error('O ficheiro selecionado não é uma base de dados válida.');
    }
    // Cópia de emergência em memória, para repor se a restauração falhar a meio.
    const bancoEmergencia = await SQLite.deserializeDatabaseAsync(await bancoAtual.serializeAsync());
    const nomeEmergencia = `EJCPrint_Antes_Restauracao_${identificador}.db`;
    try {
      await validarBancoEjc(bancoImportado);

      // Descarrega os dados atuais ANTES de substituir: assim a restauração é reversível
      // mesmo na web (o utilizador pode voltar a este ficheiro se escolher o backup errado).
      descarregarBackupWeb(await bancoAtual.serializeAsync(), nomeEmergencia);

      try {
        await SQLite.backupDatabaseAsync({
          sourceDatabase: bancoImportado,
          sourceDatabaseName: 'main',
          destDatabase: bancoAtual,
          destDatabaseName: 'main',
        });
      } catch (erro) {
        try {
          await SQLite.backupDatabaseAsync({
            sourceDatabase: bancoEmergencia,
            sourceDatabaseName: 'main',
            destDatabase: bancoAtual,
            destDatabaseName: 'main',
          });
        } catch {
          throw new Error('A restauração falhou e não foi possível recuperar automaticamente a base anterior.');
        }
        throw erro;
      }
    } finally {
      await bancoImportado.closeAsync();
      await bancoEmergencia.closeAsync();
    }

    return {
      cancelado: false as const,
      nome: nomeArquivo,
      backupEmergencia: nomeEmergencia,
      reiniciarAplicacao: true as const,
    };
  }

  const nomeImportado = `EJCPrint_Importacao_${identificador}.db`;
  const nomeEmergencia = `EJCPrint_Antes_Restauracao_${identificador}.db`;
  const arquivoImportado = new File(Paths.cache, nomeImportado);
  arquivoImportado.write(conteudoBackup);

  let bancoImportado: SQLite.SQLiteDatabase;
  try {
    bancoImportado = await SQLite.openDatabaseAsync(nomeImportado, { useNewConnection: true }, Paths.cache.uri);
  } catch {
    if (arquivoImportado.exists) arquivoImportado.delete();
    throw new Error('O ficheiro selecionado não é uma base de dados válida.');
  }
  let bancoEmergencia: SQLite.SQLiteDatabase | null = null;
  try {
    await validarBancoEjc(bancoImportado);

    bancoEmergencia = await SQLite.openDatabaseAsync(nomeEmergencia, { useNewConnection: true }, Paths.document.uri);
    await SQLite.backupDatabaseAsync({
      sourceDatabase: bancoAtual,
      sourceDatabaseName: 'main',
      destDatabase: bancoEmergencia,
      destDatabaseName: 'main',
    });

    try {
      await SQLite.backupDatabaseAsync({
        sourceDatabase: bancoImportado,
        sourceDatabaseName: 'main',
        destDatabase: bancoAtual,
        destDatabaseName: 'main',
      });
    } catch (erro) {
      try {
        await SQLite.backupDatabaseAsync({
          sourceDatabase: bancoEmergencia,
          sourceDatabaseName: 'main',
          destDatabase: bancoAtual,
          destDatabaseName: 'main',
        });
      } catch {
        throw new Error(
          `A restauração falhou e não foi possível recuperar automaticamente a base anterior. A cópia de emergência foi mantida em ${bancoEmergencia.databasePath}.`,
        );
      }
      throw erro;
    }
  } finally {
    await bancoImportado.closeAsync();
    await bancoEmergencia?.closeAsync();
    if (arquivoImportado.exists) arquivoImportado.delete();
  }

  return {
    cancelado: false as const,
    nome: nomeArquivo,
    backupEmergencia: bancoEmergencia?.databasePath ?? nomeEmergencia,
    reiniciarAplicacao: true as const,
  };
}
