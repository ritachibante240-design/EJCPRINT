import React, { useState } from 'react';
import TextInput from '../../components/AppTextInput';
import { colors, fontWeights, radii, spacing } from '../../theme';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
        <Ionicons name="arrow-back" size={16} color={colors.muted} />
        <Text style={styles.backButtonText}>Voltar</Text>
      </Pressable>

      {!isDesktop && (
        <Image source={require('../../../assets/ejc-print-logo.png')} style={styles.logo} resizeMode="contain" />
      )}
      <View style={styles.eyebrow}>
        <Ionicons name="shield-checkmark-outline" size={18} color={colors.success} />
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
          <Ionicons name={mostrarPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.muted} />
        </Pressable>
      </View>
      {erro ? <Text style={styles.error}>{erro}</Text> : null}
      <Pressable style={[styles.button, enviando && styles.buttonDisabled]} disabled={enviando} onPress={entrar}>
        {enviando ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>Entrar</Text>}
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
  container: { flex: 1, justifyContent: 'center', backgroundColor: colors.background, padding: spacing.xl },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: spacing.xxl },
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: 22, borderWidth: 1, borderColor: colors.border },
  backButtonTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.lg,
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.brandSoft,
  },
  backButtonText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: fontWeights.semibold,
  },
  logo: { width: 170, height: 60, alignSelf: 'flex-start', marginBottom: spacing.md },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: spacing.md },
  eyebrowText: { color: colors.success, fontSize: 12, fontWeight: fontWeights.bold, letterSpacing: 0.8 },
  title: { color: colors.brand, fontSize: 25, fontWeight: fontWeights.bold },
  subtitle: { color: colors.muted, marginTop: 7, marginBottom: 22, lineHeight: 20 },
  label: { color: colors.text, fontSize: 13, fontWeight: fontWeights.semibold, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, color: colors.brand, paddingHorizontal: 13, paddingVertical: spacing.md, marginBottom: 14, backgroundColor: '#FBFCFE' },
  passwordField: { position: 'relative', marginBottom: 14 },
  passwordInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, color: colors.brand, paddingLeft: 13, paddingRight: 48, paddingVertical: spacing.md, backgroundColor: '#FBFCFE' },
  eyeButton: { position: 'absolute', right: 4, top: 2, bottom: 2, width: 44, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.danger, marginBottom: spacing.md, lineHeight: 19 },
  button: { backgroundColor: colors.brand, alignItems: 'center', borderRadius: radii.sm, minHeight: 48, justifyContent: 'center', marginTop: spacing.xs },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: colors.surface, fontWeight: fontWeights.bold },
  forgot: { alignItems: 'center', paddingTop: spacing.lg },
  forgotText: { color: colors.accent, fontWeight: fontWeights.semibold },

  // ── Desktop ──────────────────────────────────────────────────
  desktopRoot: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.background,
  },
  desktopBranding: {
    flex: 1,
    backgroundColor: colors.brand,
    padding: 56,
    justifyContent: 'center',
  },
  logoDesktopPlate: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderRadius: radii.sm, marginBottom: 36, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  logoDesktop: { width: 280, height: 112 },
  brandingTitle: { color: colors.surface, fontSize: 32, fontWeight: fontWeights.bold, marginBottom: spacing.md },
  brandingSubtitle: { color: colors.subtle, fontSize: 16, lineHeight: 24, marginBottom: 40 },
  brandingFeatures: { gap: spacing.lg },
  brandingFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  brandingFeatureText: { color: colors.brandSoft, fontSize: 15 },
  desktopFormPanel: {
    width: 480,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
  },
  cardDesktop: {
    width: '100%',
    maxWidth: 400,
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
});
