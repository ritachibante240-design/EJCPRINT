import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { iniciarSessaoAdministrador } from '../../services/adminAuthService';
import { useDesktopGrid } from '../../hooks/useResponsive';

export default function LoginAdministradorScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const { isDesktop } = useDesktopGrid();

  async function entrar() {
    if (enviando) return;
    setErro(null);
    try {
      setEnviando(true);
      await iniciarSessaoAdministrador(email, password);
      navigation.replace('Dashboard');
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível iniciar a sessão.');
    } finally {
      setEnviando(false);
    }
  }

  const formCard = (
    <View style={[styles.card, isDesktop && styles.cardDesktop]}>
      <Pressable
        onPress={() => navigation.navigate('Acesso')}
        style={styles.backButtonTop}
      >
        <Ionicons name="arrow-back" size={16} color="#627D98" />
        <Text style={styles.backButtonText}>Voltar</Text>
      </Pressable>

      {!isDesktop && (
        <Image source={require('../../../assets/ejc-print-logo.png')} style={styles.logo} resizeMode="contain" />
      )}
      <View style={styles.eyebrow}>
        <Ionicons name="shield-checkmark-outline" size={18} color="#147D64" />
        <Text style={styles.eyebrowText}>ÁREA ADMINISTRATIVA</Text>
      </View>
      <Text style={styles.title}>Entrar no painel</Text>
      <Text style={styles.subtitle}>Use o seu utilizador para gerir pedidos, pagamentos e stock.</Text>
      <Text style={styles.label}>E-mail</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        placeholder="E-mail do administrador"
        editable={!enviando}
      />
      <Text style={styles.label}>Palavra-passe</Text>
      <View style={styles.passwordField}>
        <TextInput
          style={styles.passwordInput}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!mostrarPassword}
          placeholder="Palavra-passe"
          editable={!enviando}
          onSubmitEditing={entrar}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={mostrarPassword ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}
          style={styles.eyeButton}
          onPress={() => setMostrarPassword((v) => !v)}
        >
          <Ionicons name={mostrarPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color="#627D98" />
        </Pressable>
      </View>
      {erro ? <Text style={styles.error}>{erro}</Text> : null}
      <Pressable style={[styles.button, enviando && styles.buttonDisabled]} disabled={enviando} onPress={entrar}>
        {enviando ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Entrar</Text>}
      </Pressable>
      <Pressable onPress={() => navigation.navigate('RecuperarPassword')} style={styles.forgot}>
        <Text style={styles.forgotText}>Esqueci a palavra-passe</Text>
      </Pressable>
    </View>
  );

  if (isDesktop) {
    return (
      <View style={styles.desktopRoot}>
        {/* Painel esquerdo — branding */}
        <View style={styles.desktopBranding}>
          <View style={styles.logoDesktopPlate}>
            <Image source={require('../../../assets/ejc-print-logo.png')} style={styles.logoDesktop} resizeMode="contain" />
          </View>
          <Text style={styles.brandingTitle}>Painel de Gestão</Text>
          <Text style={styles.brandingSubtitle}>Gerencie pedidos, stock, finanças e muito mais a partir do seu computador.</Text>
          <View style={styles.brandingFeatures}>
            {[
              { icon: 'file-tray-full-outline', text: 'Gestão de Pedidos' },
              { icon: 'wallet-outline', text: 'Controlo Financeiro' },
              { icon: 'cube-outline', text: 'Gestão de Stock' },
              { icon: 'bar-chart-outline', text: 'Relatórios Detalhados' },
            ].map((f) => (
              <View key={f.text} style={styles.brandingFeatureRow}>
                <Ionicons name={f.icon as any} size={18} color="#A7F3D0" />
                <Text style={styles.brandingFeatureText}>{f.text}</Text>
              </View>
            ))}
          </View>
        </View>
        {/* Painel direito — formulário */}
        <View style={styles.desktopFormPanel}>
          {formCard}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {formCard}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // ── Mobile ──────────────────────────────────────────────────
  container: { flex: 1, justifyContent: 'center', backgroundColor: '#F5F7FA', padding: 20 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 22, borderWidth: 1, borderColor: '#E6EAF0' },
  backButtonTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#F0F4F8',
  },
  backButtonText: {
    color: '#627D98',
    fontSize: 13,
    fontWeight: '600',
  },
  logo: { width: 170, height: 60, alignSelf: 'flex-start', marginBottom: 12 },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  eyebrowText: { color: '#147D64', fontSize: 12, fontWeight: 'bold', letterSpacing: 0.8 },
  title: { color: '#102A43', fontSize: 25, fontWeight: 'bold' },
  subtitle: { color: '#627D98', marginTop: 7, marginBottom: 22, lineHeight: 20 },
  label: { color: '#243B53', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#D9E2EC', borderRadius: 10, color: '#102A43', paddingHorizontal: 13, paddingVertical: 12, marginBottom: 14, backgroundColor: '#FBFCFE' },
  passwordField: { position: 'relative', marginBottom: 14 },
  passwordInput: { borderWidth: 1, borderColor: '#D9E2EC', borderRadius: 10, color: '#102A43', paddingLeft: 13, paddingRight: 48, paddingVertical: 12, backgroundColor: '#FBFCFE' },
  eyeButton: { position: 'absolute', right: 4, top: 2, bottom: 2, width: 44, alignItems: 'center', justifyContent: 'center' },
  error: { color: '#B42318', marginBottom: 12, lineHeight: 19 },
  button: { backgroundColor: '#102A43', alignItems: 'center', borderRadius: 10, minHeight: 48, justifyContent: 'center', marginTop: 4 },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#FFFFFF', fontWeight: 'bold' },
  forgot: { alignItems: 'center', paddingTop: 16 },
  forgotText: { color: '#1D4ED8', fontWeight: '600' },

  // ── Desktop ──────────────────────────────────────────────────
  desktopRoot: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F5F7FA',
  },
  desktopBranding: {
    flex: 1,
    backgroundColor: '#102A43',
    padding: 56,
    justifyContent: 'center',
  },
  logoDesktopPlate: { alignSelf: 'flex-start', backgroundColor: '#FFFFFF', borderRadius: 10, marginBottom: 36, paddingHorizontal: 12, paddingVertical: 8 },
  logoDesktop: { width: 280, height: 112 },
  brandingTitle: { color: '#FFFFFF', fontSize: 32, fontWeight: 'bold', marginBottom: 12 },
  brandingSubtitle: { color: '#9FB3C8', fontSize: 16, lineHeight: 24, marginBottom: 40 },
  brandingFeatures: { gap: 16 },
  brandingFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandingFeatureText: { color: '#D9E8F5', fontSize: 15 },
  desktopFormPanel: {
    width: 480,
    backgroundColor: '#F5F7FA',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
  },
  cardDesktop: {
    width: '100%',
    maxWidth: 400,
    shadowColor: '#102A43',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
});
