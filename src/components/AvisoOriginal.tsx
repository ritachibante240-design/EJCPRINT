import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { AVISO_ORIGINAL } from '../utils/servicoPresencial';

/** Aviso de que o cliente tem de levar o documento original à papelaria. */
export default function AvisoOriginal({ texto = AVISO_ORIGINAL }: { texto?: string }) {
  return (
    <View style={styles.caixa} accessibilityRole="alert">
      <Ionicons name="document-text-outline" size={22} color={colors.warning} />
      <Text style={styles.texto}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  caixa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.warningSoft,
    borderRadius: 13,
    padding: 14,
    marginBottom: 15,
  },
  texto: { flex: 1, color: colors.warning, lineHeight: 20, fontWeight: '600' },
});
