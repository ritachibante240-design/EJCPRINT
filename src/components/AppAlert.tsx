import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { colors, fontWeights, spacing } from '../theme';
import { Modal, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { AppToastProvider, showAppToast } from './AppToast';

type AlertButton = { text: string; onPress?: () => void; style?: 'cancel' };
type AlertRequest = { title: string; message?: string; buttons?: AlertButton[] };
type AlertContextValue = { show: (title: string, message?: string, buttons?: AlertButton[]) => void };

const Context = createContext<AlertContextValue | null>(null);
let showGlobal: AlertContextValue['show'] | null = null;

export function showAppAlert(title: string, message?: string, buttons?: AlertButton[]) {
  if (!buttons?.length) {
    const type = /erro|não|inválid|falha|atenção|necessári/i.test(`${title} ${message ?? ''}`) ? 'error' : /sucesso|enviad|criad|regist|confirmad|guardad|definid|restaurad/i.test(`${title} ${message ?? ''}`) ? 'success' : 'info';
    showAppToast(title, message, type);
    return;
  }
  showGlobal?.(title, message, buttons);
}

export function AppAlertProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<AlertRequest | null>(null);
  const show = useCallback((title: string, message?: string, buttons?: AlertButton[]) => setRequest({ title, message, buttons }), []);
  useEffect(() => {
    showGlobal = show;
    return () => {
      if (showGlobal === show) showGlobal = null;
    };
  }, [show]);
  const buttons = request?.buttons?.length ? request.buttons : [{ text: 'OK' }];
  const cartao = (
    <View style={styles.card} accessibilityRole="alert">
      <Text style={styles.title}>{request?.title}</Text>
      {request?.message && <Text style={styles.message}>{request.message}</Text>}
      <View style={styles.actions}>
        {buttons.map((button, index) => (
          <Pressable
            key={`${button.text}-${index}`}
            style={[styles.button, button.style === 'cancel' && styles.cancelButton]}
            onPress={() => {
              setRequest(null);
              button.onPress?.();
            }}
          >
            <Text style={[styles.buttonText, button.style === 'cancel' && styles.cancelText]}>{button.text}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
  return (
    <AppToastProvider>
      <Context.Provider value={{ show }}>
        <>{children}</>
        {Platform.OS === 'web' ? (
          // Na web, um Modal aberto antes (ex.: formulário de compra) ficava por cima da confirmação
          // e bloqueava os cliques. Uma camada fixa com z-index alto fica sempre à frente.
          request && criarPortalWeb(<View style={[styles.overlay, overlayWeb]}>{cartao}</View>)
        ) : (
          <Modal visible={!!request} transparent animationType="fade" onRequestClose={() => setRequest(null)}>
            <View style={styles.overlay}>{cartao}</View>
          </Modal>
        )}
      </Context.Provider>
    </AppToastProvider>
  );
}

/** Coloca a confirmação diretamente no <body>, à frente das janelas (Modal) já abertas. */
function criarPortalWeb(conteudo: React.ReactElement) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createPortal } = require('react-dom') as {
    createPortal: (filhos: React.ReactNode, destino: Element) => React.ReactElement;
  };
  return createPortal(conteudo, document.body);
}

const overlayWeb = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100000 } as unknown as ViewStyle;

export function useAppAlert() { const context = useContext(Context); if (!context) throw new Error('useAppAlert deve ser usado dentro de AppAlertProvider.'); return context; }

const styles = StyleSheet.create({ overlay: { flex: 1, backgroundColor: 'rgba(16,42,67,0.52)', alignItems: 'center', justifyContent: 'center', padding: spacing.xxl }, card: { width: '100%', maxWidth: 520, backgroundColor: colors.surface, borderRadius: 22, padding: 22, shadowColor: colors.brand, shadowOpacity: 0.2, shadowRadius: 18, elevation: 8 }, title: { color: colors.brand, fontSize: 21, fontWeight: fontWeights.extraBold }, message: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 10 }, actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: spacing.sm, marginTop: 22 }, button: { backgroundColor: colors.brand, borderRadius: 11, paddingHorizontal: spacing.lg, paddingVertical: 11 }, cancelButton: { backgroundColor: colors.brandSoft }, buttonText: { color: colors.surface, fontWeight: fontWeights.bold }, cancelText: { color: '#486581' } });
