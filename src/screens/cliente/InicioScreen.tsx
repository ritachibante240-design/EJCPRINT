import React from 'react';
import { colors, fontWeights, radii, spacing } from '../../theme';
import { Image, ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useResponsiveContent } from '../../hooks/useResponsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { abrirPoliticaPrivacidade } from '../../utils/privacyPolicy';

export default function InicioScreen({ navigation }: any) {
  const { isDesktop } = useResponsiveContent(20);
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, isDesktop && { maxWidth: 900, width: '100%', alignSelf: 'center' }]}
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.header}>
        <View>
          <Pressable onLongPress={() => navigation.navigate('LoginAdministrador')}><Image source={require('../../../assets/ejc-print-logo.png')} style={styles.logoImage} resizeMode="contain" /></Pressable>
          <Text style={styles.subtitle}>Impressão e serviços</Text>
        </View>
        <Ionicons name="print-outline" size={30} color={colors.brand} />
      </View>
      <Text style={styles.kicker}>ATENDIMENTO EJC PRINT</Text>
      <Text style={styles.welcome}>Como podemos ajudar?</Text>
      <Text style={styles.description}>Envie o seu pedido de impressão de forma simples e rápida.</Text>
      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <View style={styles.iconBox}><Ionicons name="document-text-outline" size={25} color={colors.brand} /></View>
          <View style={styles.cardHeadingText}><Text style={styles.cardTitle}>Novo pedido</Text><Text style={styles.cardMeta}>Impressão e serviços</Text></View>
        </View>
        <Text style={styles.cardDescription}>Envie o documento, escolha o serviço e receba o valor estimado.</Text>
        <Pressable style={styles.primaryButton} onPress={() => navigation.navigate('NovoPedido')}>
          <Text style={styles.primaryText}>Fazer pedido</Text><Ionicons name="arrow-forward" size={19} color={colors.surface} />
        </Pressable>
      </View>
      <View style={styles.highlights}>
        <View style={styles.highlight}><Ionicons name="flash-outline" size={21} color={colors.success} /><Text style={styles.highlightTitle}>Rápido</Text><Text style={styles.highlightText}>Atendimento</Text></View>
        <View style={styles.highlight}><Ionicons name="checkmark-circle-outline" size={21} color={colors.success} /><Text style={styles.highlightTitle}>Qualidade</Text><Text style={styles.highlightText}>Garantida</Text></View>
        <View style={styles.highlight}><Ionicons name="pricetag-outline" size={21} color={colors.success} /><Text style={styles.highlightTitle}>Preços</Text><Text style={styles.highlightText}>Acessíveis</Text></View>
      </View>
      <Pressable
        accessibilityRole="link"
        style={styles.privacyLink}
        onPress={() => void abrirPoliticaPrivacidade()}
      >
        <Text style={styles.privacyLinkText}>Política de privacidade</Text>
      </Pressable>
      </ScrollView>
      <View style={[styles.bottomBar, { height: 72 + insets.bottom, paddingBottom: 8 + insets.bottom }, isDesktop && { maxWidth: 680, width: '100%', alignSelf: 'center', borderRadius: radii.lg, marginBottom: 14, borderWidth: 1, borderColor: colors.border }]}>
        <Pressable style={styles.bottomItem} onPress={() => navigation.navigate('Acesso')}>
          <Ionicons name="home" size={23} color={colors.brand} />
          <Text style={styles.bottomActive}>Início</Text>
        </Pressable>
        <Pressable style={styles.bottomItem} onPress={() => navigation.navigate('Servicos')}>
          <Ionicons name="pricetag-outline" size={23} color={colors.subtle} />
          <Text style={styles.bottomText}>Serviços</Text>
        </Pressable>
        <Pressable style={styles.bottomItem} onPress={() => navigation.navigate('MeusPedidos')}>
          <Ionicons name="receipt-outline" size={23} color={colors.subtle} />
          <Text style={styles.bottomText}>Pedidos</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingTop: 22, paddingBottom: 100 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: spacing.xl, marginBottom: spacing.xxxl, borderBottomWidth: 1, borderBottomColor: colors.border },
  logoImage: { height: 55, width: 158 },
  subtitle: { fontSize: 15, color: colors.subtle, marginTop: spacing.xs },
  welcome: { fontSize: 32, fontWeight: fontWeights.bold, color: colors.brand },
  description: { fontSize: 16, color: colors.subtle, marginTop: 5, marginBottom: spacing.xl },
  kicker: { color: colors.success, fontSize: 12, fontWeight: fontWeights.bold, letterSpacing: 1.1, marginBottom: 7 },
  card: { backgroundColor: colors.surface, padding: spacing.xl, borderRadius: radii.xl, marginBottom: 14, borderWidth: 1, borderColor: colors.border },
  cardHeading: { flexDirection: 'row', alignItems: 'center' },
  iconBox: { width: 54, height: 54, borderRadius: radii.lg, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  cardHeadingText: { marginLeft: 14 },
  cardTitle: { color: colors.brand, fontSize: 19, fontWeight: fontWeights.bold },
  cardMeta: { color: colors.subtle, fontSize: 14, marginTop: spacing.xs },
  cardDescription: { color: colors.muted, marginTop: spacing.lg, lineHeight: 21, fontSize: 15 },
  primaryButton: { backgroundColor: colors.brand, borderRadius: 11, padding: 14, flexDirection: 'row', gap: spacing.sm, justifyContent: 'center', alignItems: 'center', marginTop: 18 },
  primaryText: { color: colors.surface, fontWeight: fontWeights.bold, fontSize: 15 },
  highlights: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-around', marginTop: spacing.xs, paddingVertical: 17 },
  highlight: { alignItems: 'center', flex: 1 },
  highlightTitle: { color: colors.brand, fontSize: 12, fontWeight: fontWeights.bold, marginTop: 7 },
  highlightText: { color: colors.subtle, fontSize: 11, marginTop: 2 },
  privacyLink: { alignSelf: 'center', paddingVertical: spacing.lg },
  privacyLinkText: { color: colors.accent, fontSize: 14, fontWeight: fontWeights.semibold, textDecorationLine: 'underline' },
  bottomBar: { height: 72, flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  bottomItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  bottomActive: { color: colors.brand, fontSize: 11, fontWeight: fontWeights.bold },
  bottomText: { color: colors.subtle, fontSize: 11, fontWeight: fontWeights.semibold },
});
