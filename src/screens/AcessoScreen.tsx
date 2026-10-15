import React from 'react';
import { colors, fontWeights, radii, spacing } from '../theme';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDesktopGrid } from '../hooks/useResponsive';

export default function AcessoScreen({ navigation }: any) {
  const { isDesktop } = useDesktopGrid();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}
      showsVerticalScrollIndicator={false}
    >
      {isDesktop ? (
        // ── Desktop: layout dividido em duas colunas ──────────────
        <View style={styles.desktopLayout}>
          {/* Coluna esquerda — branding */}
          <View style={styles.desktopBranding}>
            <View style={styles.logoDesktopPlate}>
              <Image source={require('../../assets/ejc-print-logo.png')} style={styles.logoDesktop} resizeMode="contain" />
            </View>
            <Text style={styles.desktopTagline}>Impressão e serviços</Text>
            <Text style={styles.desktopDescription}>
              Plataforma digital de gestão de impressão da EJC. Faça pedidos, acompanhe o estado e gira o seu atendimento — tudo num só lugar.
            </Text>
            <View style={styles.desktopBadge}>
              <Ionicons name="lock-closed-outline" size={14} color="#A7F3D0" />
              <Text style={styles.desktopBadgeText}>Acesso seguro e separado por função</Text>
            </View>
          </View>

          {/* Coluna direita — cartões de acesso */}
          <View style={styles.desktopCards}>
            <Text style={styles.desktopSectionKicker}>BEM-VINDO</Text>
            <Text style={styles.desktopSectionTitle}>Como deseja entrar?</Text>
            <Text style={styles.desktopSectionDesc}>Escolha o seu tipo de acesso para continuar.</Text>
            <View style={styles.cards}>
              <Pressable style={styles.card} onPress={() => navigation.replace('Inicio')}>
                <View style={[styles.iconBox, styles.clientIcon]}><Ionicons name="person-outline" size={27} color={colors.brand} /></View>
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>Área do cliente</Text>
                  <Text style={styles.cardText}>Faça pedidos, consulte serviços e acompanhe o seu atendimento.</Text>
                  <View style={styles.cardAction}><Text style={styles.clientAction}>Continuar como cliente</Text><Ionicons name="arrow-forward" size={17} color={colors.accent} /></View>
                </View>
              </Pressable>
              <Pressable style={[styles.card, styles.adminCard]} onPress={() => navigation.navigate('LoginAdministrador')}>
                <View style={[styles.iconBox, styles.adminIcon]}><Ionicons name="shield-checkmark-outline" size={28} color={colors.success} /></View>
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>Área administrativa</Text>
                  <Text style={styles.cardText}>Faça a gestão de pedidos, pagamentos, despesas e stock.</Text>
                  <View style={styles.cardAction}><Text style={styles.adminAction}>Entrar no painel</Text><Ionicons name="arrow-forward" size={17} color={colors.success} /></View>
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      ) : (
        // ── Mobile: layout original ────────────────────────────────
        <>
          <View style={styles.brand}>
            <Image source={require('../../assets/ejc-print-logo.png')} style={styles.logoImage} resizeMode="contain" />
            <Text style={styles.subtitle}>Impressão e serviços</Text>
          </View>
          <View style={styles.intro}>
            <Text style={styles.kicker}>BEM-VINDO</Text>
            <Text style={styles.title}>Como deseja entrar?</Text>
            <Text style={styles.description}>Escolha o seu tipo de acesso para continuar.</Text>
          </View>
          <View style={styles.cards}>
            <Pressable style={styles.card} onPress={() => navigation.replace('Inicio')}>
              <View style={[styles.iconBox, styles.clientIcon]}><Ionicons name="person-outline" size={27} color={colors.brand} /></View>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>Área do cliente</Text>
                <Text style={styles.cardText}>Faça pedidos, consulte serviços e acompanhe o seu atendimento.</Text>
                <View style={styles.cardAction}><Text style={styles.clientAction}>Continuar como cliente</Text><Ionicons name="arrow-forward" size={17} color={colors.accent} /></View>
              </View>
            </Pressable>
            <Pressable style={[styles.card, styles.adminCard]} onPress={() => navigation.navigate('LoginAdministrador')}>
              <View style={[styles.iconBox, styles.adminIcon]}><Ionicons name="shield-checkmark-outline" size={28} color={colors.success} /></View>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>Área administrativa</Text>
                <Text style={styles.cardText}>Faça a gestão de pedidos, pagamentos, despesas e stock.</Text>
                <View style={styles.cardAction}><Text style={styles.adminAction}>Entrar no painel</Text><Ionicons name="arrow-forward" size={17} color={colors.success} /></View>
              </View>
            </Pressable>
          </View>
          <View style={styles.footer}>
            <Ionicons name="lock-closed-outline" size={15} color={colors.subtle} />
            <Text style={styles.footerText}>Acesso seguro e separado por função.</Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, paddingTop: 36, paddingBottom: 36 },
  contentDesktop: { padding: 0, justifyContent: 'flex-start' },

  // ── Mobile styles ──────────────────────────────────────────
  brand: { marginBottom: 46 },
  logoImage: { height: 62, width: 178 },
  subtitle: { color: colors.subtle, fontSize: 15, marginTop: spacing.sm },
  intro: { marginBottom: 22 },
  kicker: { color: colors.success, fontSize: 12, fontWeight: fontWeights.bold, letterSpacing: 1.3, marginBottom: spacing.sm },
  title: { color: colors.brand, fontSize: 30, fontWeight: fontWeights.bold },
  description: { color: colors.muted, fontSize: 16, lineHeight: 22, marginTop: 7 },
  cards: { gap: 14 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.xxl, borderWidth: 1, padding: 18, flexDirection: 'row', alignItems: 'flex-start' },
  adminCard: { borderColor: '#B7E4D3' },
  iconBox: { alignItems: 'center', borderRadius: radii.lg, height: 54, justifyContent: 'center', width: 54 },
  clientIcon: { backgroundColor: colors.accentSoft },
  adminIcon: { backgroundColor: colors.successSoft },
  cardContent: { flex: 1, marginLeft: 14 },
  cardTitle: { color: colors.brand, fontSize: 18, fontWeight: fontWeights.bold },
  cardText: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  cardAction: { alignItems: 'center', flexDirection: 'row', gap: 7, marginTop: 14 },
  clientAction: { color: colors.accent, fontSize: 14, fontWeight: fontWeights.bold },
  adminAction: { color: colors.success, fontSize: 14, fontWeight: fontWeights.bold },
  footer: { alignItems: 'center', flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: spacing.xxxxl },
  footerText: { color: colors.subtle, fontSize: 13 },

  // ── Desktop styles ──────────────────────────────────────────
  desktopLayout: {
    flex: 1,
    flexDirection: 'row',
    minHeight: '100%' as any,
  },
  desktopBranding: {
    flex: 1,
    backgroundColor: colors.brand,
    padding: 60,
    justifyContent: 'center',
  },
  logoDesktopPlate: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderRadius: radii.sm, marginBottom: spacing.xxxxl, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  logoDesktop: { width: 280, height: 112 },
  desktopTagline: { color: colors.subtle, fontSize: 16, marginBottom: spacing.xl },
  desktopDescription: { color: colors.brandSoft, fontSize: 17, lineHeight: 27, marginBottom: 36 },
  desktopBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  desktopBadgeText: { color: colors.subtle, fontSize: 13 },
  desktopCards: {
    width: 520,
    backgroundColor: colors.background,
    padding: 60,
    justifyContent: 'center',
  },
  desktopSectionKicker: { color: colors.success, fontSize: 12, fontWeight: fontWeights.bold, letterSpacing: 1.3, marginBottom: spacing.sm },
  desktopSectionTitle: { color: colors.brand, fontSize: 28, fontWeight: fontWeights.bold, marginBottom: spacing.sm },
  desktopSectionDesc: { color: colors.muted, fontSize: 15, lineHeight: 22, marginBottom: spacing.xxxl },
});
