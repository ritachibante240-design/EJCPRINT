import React from 'react';
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
      <View style={styles.header}><View><Image source={require('../../../assets/ejc-print-logo.png')} style={styles.logoImage} resizeMode="contain" /><Text style={styles.subtitle}>Impressão e serviços</Text></View><Ionicons name="pricetag-outline" size={30} color="#102A43" /></View>
      <Text style={styles.title}>Serviços</Text>
      <Text style={styles.description}>Escolha o serviço que precisa.</Text>

      <View style={styles.card}>
        <View style={styles.iconBox}><Ionicons name="print-outline" size={25} color="#102A43" /></View><View style={styles.serviceInfo}><Text style={styles.service}>Impressão P/B</Text><Text style={styles.price}>3 MT / página</Text></View><Ionicons name="chevron-forward" size={21} color="#9FB3C8" />
      </View>

      <View style={styles.card}>
        <View style={styles.iconBox}><Ionicons name="copy-outline" size={25} color="#102A43" /></View><View style={styles.serviceInfo}><Text style={styles.service}>Fotocópia P/B</Text><Text style={styles.price}>2 MT / página</Text></View><Ionicons name="chevron-forward" size={21} color="#9FB3C8" />
      </View>

      <View style={styles.card}>
        <View style={styles.iconBox}><Ionicons name="color-palette-outline" size={25} color="#102A43" /></View><View style={styles.serviceInfo}><Text style={styles.service}>Colorida simples</Text><Text style={styles.price}>5 MT / página</Text></View><Ionicons name="chevron-forward" size={21} color="#9FB3C8" />
      </View>

      <View style={styles.card}>
        <View style={styles.iconBox}><Ionicons name="images-outline" size={25} color="#102A43" /></View><View style={styles.serviceInfo}><Text style={styles.service}>Colorida com imagens</Text><Text style={styles.price}>10 MT / página</Text></View><Ionicons name="chevron-forward" size={21} color="#9FB3C8" />
      </View>

      <View style={styles.card}>
        <View style={styles.iconBox}><Ionicons name="scan-outline" size={25} color="#102A43" /></View><View style={styles.serviceInfo}><Text style={styles.service}>Digitalização</Text><Text style={styles.price}>15 MT / página</Text></View><Ionicons name="chevron-forward" size={21} color="#9FB3C8" />
      </View>
      </ScrollView>
      <View style={[styles.bottomBar, { height: 72 + insets.bottom, paddingBottom: 8 + insets.bottom }, isDesktop && { maxWidth: 680, width: '100%', alignSelf: 'center', borderRadius: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E6EAF0' }]}><Pressable style={styles.bottomItem} onPress={() => navigation.navigate('Acesso')}><Ionicons name="home-outline" size={23} color="#829AB1" /><Text style={styles.bottomText}>Início</Text></Pressable><Pressable style={styles.bottomItem} onPress={() => navigation.navigate('Servicos')}><Ionicons name="pricetag" size={23} color="#102A43" /><Text style={styles.bottomActive}>Serviços</Text></Pressable><Pressable style={styles.bottomItem} onPress={() => navigation.navigate('MeusPedidos')}><Ionicons name="receipt-outline" size={23} color="#829AB1" /><Text style={styles.bottomText}>Pedidos</Text></Pressable></View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F7FA' },
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  content: { padding: 20, paddingTop: 22, paddingBottom: 28 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 20, marginBottom: 28, borderBottomWidth: 1, borderBottomColor: '#E6EAF0' },
  logoImage: { height: 55, width: 158 },
  subtitle: { fontSize: 15, color: '#829AB1', marginTop: 4 },

  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#102A43',
    marginBottom: 20,
  },
  description: { color: '#829AB1', fontSize: 16, marginTop: 5, marginBottom: 20 },

  card: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 18,
    marginBottom: 13,
    borderWidth: 1,
    borderColor: '#F0F2F5',
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBox: { width: 54, height: 54, borderRadius: 16, backgroundColor: '#F0F4F8', alignItems: 'center', justifyContent: 'center' },
  serviceInfo: { flex: 1, marginLeft: 14 },

  service: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#102A43',
  },

  price: {
    marginTop: 6,
    color: '#627D98',
    fontSize: 15,
  },
  bottomBar: { height: 72, flexDirection: 'row', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E6EAF0', paddingTop: 8, paddingBottom: 8 },
  bottomItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  bottomActive: { color: '#102A43', fontSize: 11, fontWeight: 'bold' },
  bottomText: { color: '#829AB1', fontSize: 11, fontWeight: '600' },
});
