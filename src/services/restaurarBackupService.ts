import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

import { getDb } from '../database/database';

/**
 * Seleciona um backup .db e copia-o para o local do banco da aplicação.
 *
 * Esta função ainda não está ligada à interface. Antes de a executar será
 * necessário fechar a conexão SQLite e criar um backup de segurança.
 */
export async function selecionarERestaurarBackup() {
  let nomeArquivo: string;
  let conteudoBackup: Uint8Array;

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
  nomeArquivo = arquivo.name;
  if (Platform.OS === 'web') {
    conteudoBackup = arquivo.file
      ? new Uint8Array(await arquivo.file.arrayBuffer())
      : new Uint8Array();
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

  if (!nomeArquivo.toLowerCase().endsWith('.db')) {
    throw new Error('Selecione um ficheiro de backup .db da EJC Print.');
  }

  if (conteudoBackup.length === 0) {
    throw new Error('O ficheiro de backup não foi encontrado ou está vazio.');
  }

  const agora = new Date();
  const identificador = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}_${String(agora.getHours()).padStart(2, '0')}-${String(agora.getMinutes()).padStart(2, '0')}-${String(agora.getSeconds()).padStart(2, '0')}`;

  const bancoAtual = await getDb();
  if (Platform.OS === 'web') {
    const bancoImportado = await SQLite.deserializeDatabaseAsync(conteudoBackup);
    let bancoEmergencia: SQLite.SQLiteDatabase | null = null;
    try {
      const tabelaPedidos = await bancoImportado.getFirstAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pedidos'"
      );
      if (!tabelaPedidos) {
        throw new Error('O ficheiro selecionado não contém uma base de dados EJC Print válida.');
      }

      bancoEmergencia = await SQLite.deserializeDatabaseAsync(
        await bancoAtual.serializeAsync()
      );
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
      await bancoEmergencia?.closeAsync();
    }

    return {
      cancelado: false as const,
      nome: nomeArquivo,
      backupEmergencia: null,
      reiniciarAplicacao: true as const,
    };
  }

  const nomeImportado = `EJCPrint_Importacao_${identificador}.db`;
  const nomeEmergencia = `EJCPrint_Antes_Restauracao_${identificador}.db`;
  const arquivoImportado = new File(Paths.cache, nomeImportado);
  arquivoImportado.write(conteudoBackup);

  const bancoImportado = await SQLite.openDatabaseAsync(
    nomeImportado,
    { useNewConnection: true },
    Paths.cache.uri
  );
  let bancoEmergencia: SQLite.SQLiteDatabase | null = null;
  try {
    const tabelaPedidos = await bancoImportado.getFirstAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pedidos'"
    );
    if (!tabelaPedidos) {
      throw new Error('O ficheiro selecionado não contém uma base de dados EJC Print válida.');
    }

    bancoEmergencia = await SQLite.openDatabaseAsync(
      nomeEmergencia,
      { useNewConnection: true },
      Paths.document.uri
    );
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
          `A restauração falhou e não foi possível recuperar automaticamente a base anterior. A cópia de emergência foi mantida em ${bancoEmergencia.databasePath}.`
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
    backupEmergencia: bancoEmergencia?.databasePath ?? null,
    reiniciarAplicacao: true as const,
  };
}
