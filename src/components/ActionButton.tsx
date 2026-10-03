import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

type Props = { title: string; onPress: () => void | Promise<void>; loading?: boolean; disabled?: boolean; style?: ViewStyle };

export default function ActionButton({ title, onPress, loading = false, disabled = false, style }: Props) {
  const [internamenteOcupado, setInternamenteOcupado] = useState(false);
  const bloqueado = disabled || loading || internamenteOcupado;
  async function pressionar() {
    if (bloqueado) return;
    setInternamenteOcupado(true);
    try { await onPress(); } finally { setInternamenteOcupado(false); }
  }
  return <Pressable disabled={bloqueado} onPress={pressionar} hitSlop={4} style={({ pressed }) => [styles.button, style, bloqueado && styles.disabled, pressed && !bloqueado && styles.pressed]}>{loading || internamenteOcupado ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.text}>{title}</Text>}</Pressable>;
}

const styles = StyleSheet.create({ button: { minHeight: 50, borderRadius: 13, backgroundColor: '#102A43', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 }, text: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' }, disabled: { opacity: 0.5 }, pressed: { opacity: 0.85 } });
