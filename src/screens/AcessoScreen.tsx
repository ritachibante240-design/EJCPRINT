import React from 'react';
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
                <View style={[styles.iconBox, styles.clientIcon]}><Ionicons name="person-outline" size={27} color="#102A43" /></View>
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>Área do cliente</Text>
                  <Text style={styles.cardText}>Faça pedidos, consulte serviços e acompanhe o seu atendimento.</Text>
                  <View style={styles.cardAction}><Text style={styles.clientAction}>Continuar como cliente</Text><Ionicons name="arrow-forward" size={17} color="#1D4ED8" /></View>
                </View>
              </Pressable>
              <Pressable style={[styles.card, styles.adminCard]} onPress={() => navigation.navigate('LoginAdministrador')}>
                <View style={[styles.iconBox, styles.adminIcon]}><Ionicons name="shield-checkmark-outline" size={28} color="#147D64" /></View>
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>Área administrativa</Text>
                  <Text style={styles.cardText}>Faça a gestão de pedidos, pagamentos, despesas e stock.</Text>
                  <View style={styles.cardAction}><Text style={styles.adminAction}>Entrar no painel</Text><Ionicons name="arrow-forward" size={17} color="#147D64" /></View>
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
              <View style={[styles.iconBox, styles.clientIcon]}><Ionicons name="person-outline" size={27} color="#102A43" /></View>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>Área do cliente</Text>
                <Text style={styles.cardText}>Faça pedidos, consulte serviços e acompanhe o seu atendimento.</Text>
                <View style={styles.cardAction}><Text style={styles.clientAction}>Continuar como cliente</Text><Ionicons name="arrow-forward" size={17} color="#1D4ED8" /></View>
              </View>
            </Pressable>
            <Pressable style={[styles.card, styles.adminCard]} onPress={() => navigation.navigate('LoginAdministrador')}>
              <View style={[styles.iconBox, styles.adminIcon]}><Ionicons name="shield-checkmark-outline" size={28} color="#147D64" /></View>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>Área administrativa</Text>
                <Text style={styles.cardText}>Faça a gestão de pedidos, pagamentos, despesas e stock.</Text>
                <View style={styles.cardAction}><Text style={styles.adminAction}>Entrar no painel</Text><Ionicons name="arrow-forward" size={17} color="#147D64" /></View>
              </View>
            </Pressable>
          </View>
          <View style={styles.footer}>
            <Ionicons name="lock-closed-outline" size={15} color="#9FB3C8" />
            <Text style={styles.footerText}>Acesso seguro e separado por função.</Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 20, paddingTop: 36, paddingBottom: 36 },
  contentDesktop: { padding: 0, justifyContent: 'flex-start' },

  // ── Mobile styles ──────────────────────────────────────────
  brand: { marginBottom: 46 },
  logoImage: { height: 62, width: 178 },
  subtitle: { color: '#829AB1', fontSize: 15, marginTop: 8 },
  intro: { marginBottom: 22 },
  kicker: { color: '#147D64', fontSize: 12, fontWeight: 'bold', letterSpacing: 1.3, marginBottom: 8 },
  title: { color: '#102A43', fontSize: 30, fontWeight: 'bold' },
  description: { color: '#627D98', fontSize: 16, lineHeight: 22, marginTop: 7 },
  cards: { gap: 14 },
  card: { backgroundColor: '#FFFFFF', borderColor: '#E6EAF0', borderRadius: 20, borderWidth: 1, padding: 18, flexDirection: 'row', alignItems: 'flex-start' },
  adminCard: { borderColor: '#B7E4D3' },
  iconBox: { alignItems: 'center', borderRadius: 16, height: 54, justifyContent: 'center', width: 54 },
  clientIcon: { backgroundColor: '#EAF1FA' },
  adminIcon: { backgroundColor: '#E8F7F1' },
  cardContent: { flex: 1, marginLeft: 14 },
  cardTitle: { color: '#102A43', fontSize: 18, fontWeight: 'bold' },
  cardText: { color: '#627D98', fontSize: 14, lineHeight: 20, marginTop: 6 },
  cardAction: { alignItems: 'center', flexDirection: 'row', gap: 7, marginTop: 14 },
  clientAction: { color: '#1D4ED8', fontSize: 14, fontWeight: 'bold' },
  adminAction: { color: '#147D64', fontSize: 14, fontWeight: 'bold' },
  footer: { alignItems: 'center', flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 32 },
  footerText: { color: '#9FB3C8', fontSize: 13 },

  // ── Desktop styles ──────────────────────────────────────────
  desktopLayout: {
    flex: 1,
    flexDirection: 'row',
    minHeight: '100%' as any,
  },
  desktopBranding: {
    flex: 1,
    backgroundColor: '#102A43',
    padding: 60,
    justifyContent: 'center',
  },
  logoDesktopPlate: { alignSelf: 'flex-start', backgroundColor: '#FFFFFF', borderRadius: 10, marginBottom: 32, paddingHorizontal: 12, paddingVertical: 8 },
  logoDesktop: { width: 280, height: 112 },
  desktopTagline: { color: '#9FB3C8', fontSize: 16, marginBottom: 20 },
  desktopDescription: { color: '#D9E8F5', fontSize: 17, lineHeight: 27, marginBottom: 36 },
  desktopBadge: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  desktopBadgeText: { color: '#9FB3C8', fontSize: 13 },
  desktopCards: {
    width: 520,
    backgroundColor: '#F5F7FA',
    padding: 60,
    justifyContent: 'center',
  },
  desktopSectionKicker: { color: '#147D64', fontSize: 12, fontWeight: 'bold', letterSpacing: 1.3, marginBottom: 8 },
  desktopSectionTitle: { color: '#102A43', fontSize: 28, fontWeight: 'bold', marginBottom: 8 },
  desktopSectionDesc: { color: '#627D98', fontSize: 15, lineHeight: 22, marginBottom: 28 },
});
