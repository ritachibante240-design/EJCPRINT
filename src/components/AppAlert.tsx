import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { colors, fontWeights, spacing } from '../theme';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppToastProvider, showAppToast } from './AppToast';

export type AlertButton = { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' };
export type AlertDetalhe = { label: string; value: string; destaque?: boolean };
export type AlertOptions = {
  /** Tom visual: info (padrão), warning (cuidado), danger (irreversível), success. */
  tone?: 'info' | 'warning' | 'danger' | 'success';
  /** Resumo em linhas "rótulo — valor", como num recibo. */
  details?: AlertDetalhe[];
  /** Nota curta por baixo do resumo (consequências da operação). */
  note?: string;
};
type AlertRequest = { id: number; title: string; message?: string; buttons?: AlertButton[]; options?: AlertOptions };
type AlertContextValue = {
  show: (title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) => void;
};

const Context = createContext<AlertContextValue | null>(null);
let showGlobal: AlertContextValue['show'] | null = null;

/**
 * Sem botões: mostra um aviso rápido (toast).
 * Com botões: mostra uma janela de confirmação. Use `options` para um resumo organizado.
 */
export function showAppAlert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
  if (!buttons?.length) {
    const type = /erro|não|inválid|falha|atenção|necessári/i.test(`${title} ${message ?? ''}`) ? 'error' : /sucesso|enviad|criad|regist|confirmad|guardad|definid|restaurad/i.test(`${title} ${message ?? ''}`) ? 'success' : 'info';
    showAppToast(title, message, type);
    return;
  }
  showGlobal?.(title, message, buttons, options);
}

const TONS = {
  info: { icone: 'help-circle-outline', cor: colors.brand, fundo: colors.brandSoft },
  warning: { icone: 'alert-circle-outline', cor: colors.warning, fundo: colors.warningSoft },
  danger: { icone: 'warning-outline', cor: colors.danger, fundo: colors.dangerSoft },
  success: { icone: 'checkmark-circle-outline', cor: colors.success, fundo: colors.brandSoft },
} as const;

function JanelaConfirmacao({ request, fechar }: { request: AlertRequest; fechar: () => void }) {
  const { width } = useWindowDimensions();
  const estreito = width < 520;
  const usadoRef = useRef(false);
  const buttons = request.buttons?.length ? request.buttons : [{ text: 'OK' }];
  const options = request.options ?? {};
  const destrutivo = buttons.some((botao) => botao.style === 'destructive');
  const tom = TONS[options.tone ?? (destrutivo ? 'danger' : 'info')];
  const cancelar = buttons.find((botao) => botao.style === 'cancel');
  const principal = [...buttons].reverse().find((botao) => botao.style !== 'cancel');

  const escolher = useCallback(
    (botao: AlertButton | undefined) => {
      if (usadoRef.current) return; // evita duplo clique
      usadoRef.current = true;
      fechar();
      botao?.onPress?.();
    },
    [fechar],
  );

  // Teclado no computador: Esc cancela, Enter confirma.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const aoPremir = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape' && cancelar) {
        evento.preventDefault();
        escolher(cancelar);
      } else if (evento.key === 'Enter' && principal && !destrutivo) {
        evento.preventDefault();
        escolher(principal);
      }
    };
    window.addEventListener('keydown', aoPremir);
    return () => window.removeEventListener('keydown', aoPremir);
  }, [cancelar, principal, destrutivo, escolher]);

  const ordenados = estreito ? [...buttons].reverse() : buttons;

  return (
    <View style={styles.overlay}>
      {cancelar && <Pressable accessibilityLabel="Fechar" style={StyleSheet.absoluteFill} onPress={() => escolher(cancelar)} />}
      <View style={styles.card} accessibilityRole="alert" accessibilityViewIsModal>
        <View style={styles.header}>
          <View style={[styles.iconCircle, { backgroundColor: tom.fundo }]}>
            <Ionicons name={tom.icone} size={24} color={tom.cor} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>{request.title}</Text>
            {request.message ? <Text style={styles.message}>{request.message}</Text> : null}
          </View>
        </View>

        {options.details?.length ? (
          <View style={styles.details}>
            {options.details.map((linha, indice) => (
              <View
                key={`${linha.label}-${indice}`}
                style={[styles.detailRow, indice > 0 && styles.detailDivider, linha.destaque && styles.detailRowStrong]}
              >
                <Text style={styles.detailLabel}>{linha.label}</Text>
                <Text style={[styles.detailValue, linha.destaque && styles.detailValueStrong]}>{linha.value}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {options.note ? (
          <View style={styles.note}>
            <Ionicons name="information-circle-outline" size={18} color={colors.muted} />
            <Text style={styles.noteText}>{options.note}</Text>
          </View>
        ) : null}

        <View style={[styles.actions, estreito && styles.actionsStacked]}>
          {ordenados.map((botao, indice) => {
            const ehCancelar = botao.style === 'cancel';
            const ehDestrutivo = botao.style === 'destructive';
            return (
              <Pressable
                key={`${botao.text}-${indice}`}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.button,
                  estreito && styles.buttonFull,
                  ehCancelar && styles.cancelButton,
                  ehDestrutivo && styles.destructiveButton,
                  pressed && styles.pressed,
                ]}
                onPress={() => escolher(botao)}
              >
                <Text style={[styles.buttonText, ehCancelar && styles.cancelText]}>{botao.text}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export function AppAlertProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<AlertRequest | null>(null);
  const contadorRef = useRef(0);
  const show = useCallback((title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) => {
    contadorRef.current += 1;
    setRequest({ id: contadorRef.current, title, message, buttons, options });
  }, []);
  const fechar = useCallback(() => setRequest(null), []);
  useEffect(() => {
    showGlobal = show;
    return () => {
      if (showGlobal === show) showGlobal = null;
    };
  }, [show]);
  // A chave muda a cada pedido: cada janela começa "nova" (sem cliques já usados).
  const janela = request ? <JanelaConfirmacao key={request.id} request={request} fechar={fechar} /> : null;
  return (
    <AppToastProvider>
      <Context.Provider value={{ show }}>
        <>{children}</>
        {Platform.OS === 'web' ? (
          // Na web, um Modal aberto antes (ex.: formulário de compra) ficava por cima da confirmação
          // e bloqueava os cliques. Uma camada fixa no <body> fica sempre à frente.
          janela && criarPortalWeb(<View style={overlayWeb}>{janela}</View>)
        ) : (
          <Modal visible={!!request} transparent animationType="fade" onRequestClose={fechar}>
            {janela}
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

export function useAppAlert() {
  const context = useContext(Context);
  if (!context) throw new Error('useAppAlert deve ser usado dentro de AppAlertProvider.');
  return context;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(16,42,67,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  header: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  iconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  title: { color: colors.brand, fontSize: 19, fontWeight: fontWeights.extraBold, lineHeight: 26 },
  message: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 6 },
  details: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: '#FAFBFC',
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 10 },
  detailDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  detailRowStrong: { paddingVertical: 12 },
  detailLabel: { color: colors.muted, fontSize: 14, flexShrink: 0 },
  detailValue: { color: colors.text, fontSize: 14, fontWeight: fontWeights.semibold, textAlign: 'right', flexShrink: 1 },
  detailValueStrong: { color: colors.brand, fontSize: 17, fontWeight: fontWeights.extraBold },
  note: { flexDirection: 'row', gap: 8, marginTop: 14, alignItems: 'flex-start' },
  noteText: { flex: 1, color: colors.muted, fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: spacing.sm, marginTop: 22 },
  actionsStacked: { flexDirection: 'column' },
  button: {
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 11,
    minWidth: 110,
    alignItems: 'center',
  },
  buttonFull: { width: '100%', paddingVertical: 13 },
  cancelButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  destructiveButton: { backgroundColor: colors.danger },
  pressed: { opacity: 0.85 },
  buttonText: { color: colors.surface, fontWeight: fontWeights.bold, fontSize: 15 },
  cancelText: { color: colors.text },
});
