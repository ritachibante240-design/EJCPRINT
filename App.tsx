import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AppNavigator from './src/navigation/AppNavigator';
import { iniciarBancoDados } from './src/database/database';
import { AppAlertProvider } from './src/components/AppAlert';
import { sincronizarPedidosPendentes } from './src/services/sincronizacaoPedidoService';
import { sincronizarPagamentosPendentes } from './src/services/sincronizacaoPagamentoService';
import WebContainer from './src/components/WebContainer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function App() {
  const [bancoPronto, setBancoPronto] = useState(false);
  const [erroBanco, setErroBanco] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let cancelado = false;

    iniciarBancoDados()
      .then(() => {
        void sincronizarPedidosPendentes()
          .then(sincronizarPagamentosPendentes)
          .catch(() => undefined);
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
                onPress={() => {
                  setErroBanco(null);
                  setTentativa((valorAtual) => valorAtual + 1);
                }}
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
  retryText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});
