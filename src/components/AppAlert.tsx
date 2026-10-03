import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
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
  return <AppToastProvider><Context.Provider value={{ show }}><>{children}</><Modal visible={!!request} transparent animationType="fade" onRequestClose={() => setRequest(null)}><View style={styles.overlay}><View style={styles.card}><Text style={styles.title}>{request?.title}</Text>{request?.message && <Text style={styles.message}>{request.message}</Text>}<View style={styles.actions}>{buttons.map((button, index) => <Pressable key={`${button.text}-${index}`} style={[styles.button, button.style === 'cancel' && styles.cancelButton]} onPress={() => { setRequest(null); button.onPress?.(); }}><Text style={[styles.buttonText, button.style === 'cancel' && styles.cancelText]}>{button.text}</Text></Pressable>)}</View></View></View></Modal></Context.Provider></AppToastProvider>;
}

export function useAppAlert() { const context = useContext(Context); if (!context) throw new Error('useAppAlert deve ser usado dentro de AppAlertProvider.'); return context; }

const styles = StyleSheet.create({ overlay: { flex: 1, backgroundColor: 'rgba(16,42,67,0.52)', alignItems: 'center', justifyContent: 'center', padding: 24 }, card: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 22, padding: 22, shadowColor: '#102A43', shadowOpacity: 0.2, shadowRadius: 18, elevation: 8 }, title: { color: '#102A43', fontSize: 21, fontWeight: '800' }, message: { color: '#627D98', fontSize: 15, lineHeight: 22, marginTop: 10 }, actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, marginTop: 22 }, button: { backgroundColor: '#102A43', borderRadius: 11, paddingHorizontal: 16, paddingVertical: 11 }, cancelButton: { backgroundColor: '#F0F4F8' }, buttonText: { color: '#FFFFFF', fontWeight: '700' }, cancelText: { color: '#486581' } });
