import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AppNavigator from './src/navigation/AppNavigator';
import { iniciarBancoDados } from './src/database/database';
import { AppAlertProvider } from './src/components/AppAlert';
import WebContainer from './src/components/WebContainer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { sincronizarTudoPendentes } from './src/services/sincronizacaoSeguraService';
import {
  assumirBaseLocal,
  reservarBaseLocal,
  separadorFoiCedido,
} from './src/database/webTabLock';

export default function App() {
  const [bancoPronto, setBancoPronto] = useState(false);
  const [erroBanco, setErroBanco] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [abertaNoutraJanela, setAbertaNoutraJanela] = useState(false);
  const [aAssumir, setAAssumir] = useState(false);

  useEffect(() => {
    let cancelado = false;

    (async () => {
      // Na web, só um separador pode usar a base local de cada vez.
      if (Platform.OS === 'web') {
        const disponivel = !separadorFoiCedido() && (await reservarBaseLocal());
        if (!disponivel) {
          if (!cancelado) setAbertaNoutraJanela(true);
          return false;
        }
      }
      await iniciarBancoDados();
      return true;
    })()
      .then((iniciado) => {
        if (!iniciado) return;
        void sincronizarTudoPendentes(3, 1200).catch(() => undefined);
        if (!cancelado) {
          setBancoPronto(true);
          setErroBanco(null);
        }
      })
      .catch((erro: unknown) => {
        console.error('Erro ao iniciar banco:', erro);
        if (!cancelado) {
          setErroBanco(
            erro instanceof Error
              ? erro.message
              : 'Não foi possível iniciar o banco de dados.'
          );
        }
      });

    return () => {
      cancelado = true;
    };
  }, [tentativa]);

  async function usarNestaJanela() {
    setAAssumir(true);
    setErroBanco(null);
    try {
      await assumirBaseLocal();
      setAbertaNoutraJanela(false);
      setTentativa((valorAtual) => valorAtual + 1);
    } catch (erro) {
      setErroBanco(erro instanceof Error ? erro.message : 'Não foi possível usar esta janela.');
    } finally {
      setAAssumir(false);
    }
  }

  function tentarNovamente() {
    if (Platform.OS === 'web') {
      // Depois de uma falha, o motor SQLite do navegador fica inutilizável nesta página.
      window.location.reload();
      return;
    }
    setErroBanco(null);
    setTentativa((valorAtual) => valorAtual + 1);
  }

  if (abertaNoutraJanela && !bancoPronto) {
    return (
      <SafeAreaProvider>
      <WebContainer>
        <View style={styles.container}>
          <Text style={styles.errorTitle}>
            A EJC Print está aberta noutra janela
          </Text>
          <Text style={styles.errorMessage}>
            Para proteger os seus dados, a aplicação só pode estar ativa numa janela de cada vez.
            Pode continuar na outra janela ou usar esta.
          </Text>
          {erroBanco && <Text style={styles.errorMessage}>{erroBanco}</Text>}
          <Pressable
            style={[styles.retryButton, aAssumir && styles.retryButtonDisabled]}
            onPress={() => void usarNestaJanela()}
            disabled={aAssumir}
          >
            <Text style={styles.retryText}>
              {aAssumir ? 'A mudar para esta janela...' : 'Usar nesta janela'}
            </Text>
          </Pressable>
        </View>
      </WebContainer>
      </SafeAreaProvider>
    );
  }

  if (!bancoPronto) {
    return (
      <SafeAreaProvider>
      <WebContainer>
        <View style={styles.container}>
          {erroBanco ? (
            <>
              <Text style={styles.errorTitle}>
                Falha ao iniciar a base de dados
              </Text>
              <Text style={styles.errorMessage}>
                {erroBanco}
              </Text>
              <Pressable
                style={styles.retryButton}
                onPress={tentarNovamente}
              >
                <Text style={styles.retryText}>Tentar novamente</Text>
              </Pressable>
            </>
          ) : (
            <>
              <ActivityIndicator size="large" />
              <Text style={styles.loadingText}>
                A preparar a base de dados...
              </Text>
            </>
          )}
        </View>
      </WebContainer>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <WebContainer>
        <AppAlertProvider><AppNavigator /></AppAlertProvider>
      </WebContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F7FA',
    padding: 24,
  },
  loadingText: {
    color: '#627D98',
    marginTop: 12,
  },
  errorTitle: {
    color: '#102A43',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  errorMessage: {
    color: '#627D98',
    marginTop: 8,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#102A43',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 18,
  },
  retryButtonDisabled: {
    opacity: 0.6,
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});
