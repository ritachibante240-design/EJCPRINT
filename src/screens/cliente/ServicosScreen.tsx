import React from 'react';
import { colors, fontWeights, radii, spacing } from '../../theme';
import { Image, Pressable, ScrollView, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useResponsiveContent } from '../../hooks/useResponsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ServicosScreen({ navigation }: any) {
  const { isDesktop } = useResponsiveContent(20);
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <ScrollView style={styles.container} contentContainerStyle={[styles.content, isDesktop && { maxWidth: 900, width: '100%', alignSelf: 'center' }]} showsVerticalScrollIndicator={false}>
      <View style={styles.header}><View><Image source={require('../../../assets/ejc-print-logo.png')} style={styles.logoImage} resizeMode="contain" /><Text style={styles.subtitle}>Impressão e serviços</Text></View><Ionicons name="pricetag-outline" size={30} color={colors.brand} /></View>
      <Text style={styles.title}>Serviços</Text>
      <Text style={styles.description}>Escolha o serviço que precisa.</Text>

      <View style={styles.card}>
        <View style={styles.iconBox}><Ionicons name="print-outline" size={25} color={colors.brand} /></View><View style={styles.serviceInfo}><Text style={styles.service}>Impressão P/B</Text><Text style={styles.price}>3 MT / página</Text></View><Ionicons name="chevron-forward" size={21} color={colors.subtle} />
      </View>

      <View style={styles.card}>
        <View style={styles.iconBox}><Ionicons name="copy-outline" size={25} color={colors.brand} /></View><View style={styles.serviceInfo}><Text style={styles.service}>Fotocópia P/B</Text><Text style={styles.price}>2 MT / página</Text></View><Ionicons name="chevron-forward" size={21} color={colors.subtle} />
      </View>

      <View style={styles.card}>
        <View style={styles.iconBox}><Ionicons name="color-palette-outline" size={25} color={colors.brand} /></View><View style={styles.serviceInfo}><Text style={styles.service}>Colorida simples</Text><Text style={styles.price}>5 MT / página</Text></View><Ionicons name="chevron-forward" size={21} color={colors.subtle} />
      </View>

      <View style={styles.card}>
        <View style={styles.iconBox}><Ionicons name="images-outline" size={25} color={colors.brand} /></View><View style={styles.serviceInfo}><Text style={styles.service}>Colorida com imagens</Text><Text style={styles.price}>10 MT / página</Text></View><Ionicons name="chevron-forward" size={21} color={colors.subtle} />
      </View>

      <View style={styles.card}>
        <View style={styles.iconBox}><Ionicons name="scan-outline" size={25} color={colors.brand} /></View><View style={styles.serviceInfo}><Text style={styles.service}>Digitalização</Text><Text style={styles.price}>15 MT / página</Text></View><Ionicons name="chevron-forward" size={21} color={colors.subtle} />
      </View>

      <View style={styles.priceGuide}>
        <View style={styles.priceGuideHeading}>
          <Ionicons name="information-circle-outline" size={22} color={colors.brand} />
          <Text style={styles.priceGuideTitle}>Como é calculado o valor</Text>
        </View>
        <Text style={styles.priceGuideText}>
          O serviço é cobrado por página: preço por página × páginas do documento × número de cópias.
          Frente e verso reduz as folhas utilizadas, mas as páginas continuam a ser contabilizadas.
        </Text>
        <Text style={styles.priceGuideText}>
          Encadernação é opcional e cobrada por exemplar: 30 MT de 1 a 50 folhas, 40 MT de 51 a 100 folhas
          e 50 MT de 101 a 200 folhas. Acima de 200 folhas, solicite uma cotação.
        </Text>
      </View>
      </ScrollView>
      <View style={[styles.bottomBar, { height: 72 + insets.bottom, paddingBottom: 8 + insets.bottom }, isDesktop && { maxWidth: 680, width: '100%', alignSelf: 'center', borderRadius: radii.lg, marginBottom: 14, borderWidth: 1, borderColor: colors.border }]}><Pressable style={styles.bottomItem} onPress={() => navigation.navigate('Acesso')}><Ionicons name="home-outline" size={23} color={colors.subtle} /><Text style={styles.bottomText}>Início</Text></Pressable><Pressable style={styles.bottomItem} onPress={() => navigation.navigate('Servicos')}><Ionicons name="pricetag" size={23} color={colors.brand} /><Text style={styles.bottomActive}>Serviços</Text></Pressable><Pressable style={styles.bottomItem} onPress={() => navigation.navigate('MeusPedidos')}><Ionicons name="receipt-outline" size={23} color={colors.subtle} /><Text style={styles.bottomText}>Pedidos</Text></Pressable></View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: { padding: spacing.xl, paddingTop: 22, paddingBottom: spacing.xxxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: spacing.xl, marginBottom: spacing.xxxl, borderBottomWidth: 1, borderBottomColor: colors.border },
  logoImage: { height: 55, width: 158 },
  subtitle: { fontSize: 15, color: colors.subtle, marginTop: spacing.xs },

  title: {
    fontSize: 28,
    fontWeight: fontWeights.bold,
    color: colors.brand,
    marginBottom: spacing.xl,
  },
  description: { color: colors.subtle, fontSize: 16, marginTop: 5, marginBottom: spacing.xl },
  priceGuide: {
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: spacing.lg,
    marginTop: spacing.sm,
  },
  priceGuideHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.sm },
  priceGuideTitle: { color: colors.brand, fontSize: 16, fontWeight: fontWeights.bold },
  priceGuideText: { color: colors.text, fontSize: 13, lineHeight: 19, marginTop: spacing.xs },

  card: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radii.xl,
    marginBottom: 13,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: { width: 54, height: 54, borderRadius: radii.lg, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  serviceInfo: { flex: 1, marginLeft: 14 },

  service: {
    fontSize: 18,
    fontWeight: fontWeights.bold,
    color: colors.brand,
  },

  price: {
    marginTop: 6,
    color: colors.muted,
    fontSize: 15,
  },
  bottomBar: { height: 72, flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  bottomItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  bottomActive: { color: colors.brand, fontSize: 11, fontWeight: fontWeights.bold },
  bottomText: { color: colors.subtle, fontSize: 11, fontWeight: fontWeights.semibold },
});
