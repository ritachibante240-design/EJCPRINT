import React from 'react';
import { Image, ScrollView, View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useResponsiveContent } from '../../hooks/useResponsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
        <Ionicons name="print-outline" size={30} color="#102A43" />
      </View>
      <Text style={styles.kicker}>ATENDIMENTO EJC PRINT</Text>
      <Text style={styles.welcome}>Como podemos ajudar?</Text>
      <Text style={styles.description}>Envie o seu pedido de impressão de forma simples e rápida.</Text>
      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <View style={styles.iconBox}><Ionicons name="document-text-outline" size={25} color="#102A43" /></View>
          <View style={styles.cardHeadingText}><Text style={styles.cardTitle}>Novo pedido</Text><Text style={styles.cardMeta}>Impressão e serviços</Text></View>
        </View>
        <Text style={styles.cardDescription}>Envie o documento, escolha o serviço e receba o valor estimado.</Text>
        <Pressable style={styles.primaryButton} onPress={() => navigation.navigate('NovoPedido')}>
          <Text style={styles.primaryText}>Fazer pedido</Text><Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
        </Pressable>
      </View>
      <View style={styles.highlights}>
        <View style={styles.highlight}><Ionicons name="flash-outline" size={21} color="#147D64" /><Text style={styles.highlightTitle}>Rápido</Text><Text style={styles.highlightText}>Atendimento</Text></View>
        <View style={styles.highlight}><Ionicons name="checkmark-circle-outline" size={21} color="#147D64" /><Text style={styles.highlightTitle}>Qualidade</Text><Text style={styles.highlightText}>Garantida</Text></View>
        <View style={styles.highlight}><Ionicons name="pricetag-outline" size={21} color="#147D64" /><Text style={styles.highlightTitle}>Preços</Text><Text style={styles.highlightText}>Acessíveis</Text></View>
      </View>
      </ScrollView>
      <View style={[styles.bottomBar, { height: 72 + insets.bottom, paddingBottom: 8 + insets.bottom }, isDesktop && { maxWidth: 680, width: '100%', alignSelf: 'center', borderRadius: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E6EAF0' }]}>
        <Pressable style={styles.bottomItem} onPress={() => navigation.navigate('Acesso')}>
          <Ionicons name="home" size={23} color="#102A43" />
          <Text style={styles.bottomActive}>Início</Text>
        </Pressable>
        <Pressable style={styles.bottomItem} onPress={() => navigation.navigate('Servicos')}>
          <Ionicons name="pricetag-outline" size={23} color="#829AB1" />
          <Text style={styles.bottomText}>Serviços</Text>
        </Pressable>
        <Pressable style={styles.bottomItem} onPress={() => navigation.navigate('MeusPedidos')}>
          <Ionicons name="receipt-outline" size={23} color="#829AB1" />
          <Text style={styles.bottomText}>Pedidos</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F7FA' },
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  content: { padding: 20, paddingTop: 22, paddingBottom: 100 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 20, marginBottom: 28, borderBottomWidth: 1, borderBottomColor: '#E6EAF0' },
  logoImage: { height: 55, width: 158 },
  subtitle: { fontSize: 15, color: '#829AB1', marginTop: 4 },
  welcome: { fontSize: 32, fontWeight: 'bold', color: '#102A43' },
  description: { fontSize: 16, color: '#829AB1', marginTop: 5, marginBottom: 20 },
  kicker: { color: '#147D64', fontSize: 12, fontWeight: 'bold', letterSpacing: 1.1, marginBottom: 7 },
  card: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 18, marginBottom: 14, borderWidth: 1, borderColor: '#F0F2F5' },
  cardHeading: { flexDirection: 'row', alignItems: 'center' },
  iconBox: { width: 54, height: 54, borderRadius: 16, backgroundColor: '#F0F4F8', alignItems: 'center', justifyContent: 'center' },
  cardHeadingText: { marginLeft: 14 },
  cardTitle: { color: '#102A43', fontSize: 19, fontWeight: 'bold' },
  cardMeta: { color: '#829AB1', fontSize: 14, marginTop: 4 },
  cardDescription: { color: '#627D98', marginTop: 16, lineHeight: 21, fontSize: 15 },
  primaryButton: { backgroundColor: '#102A43', borderRadius: 11, padding: 14, flexDirection: 'row', gap: 8, justifyContent: 'center', alignItems: 'center', marginTop: 18 },
  primaryText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
  highlights: { backgroundColor: '#FFFFFF', borderColor: '#E6EAF0', borderRadius: 16, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-around', marginTop: 4, paddingVertical: 17 },
  highlight: { alignItems: 'center', flex: 1 },
  highlightTitle: { color: '#102A43', fontSize: 12, fontWeight: 'bold', marginTop: 7 },
  highlightText: { color: '#829AB1', fontSize: 11, marginTop: 2 },
  bottomBar: { height: 72, flexDirection: 'row', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E6EAF0', paddingTop: 8, paddingBottom: 8 },
  bottomItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  bottomActive: { color: '#102A43', fontSize: 11, fontWeight: 'bold' },
  bottomText: { color: '#829AB1', fontSize: 11, fontWeight: '600' },
});
