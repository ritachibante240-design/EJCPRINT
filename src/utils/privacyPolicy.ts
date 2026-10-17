import * as Linking from 'expo-linking';
import { showAppAlert } from '../components/AppAlert';

export const PRIVACY_POLICY_URL = 'https://ejcprint-1.onrender.com/api/privacy';

export async function abrirPoliticaPrivacidade() {
  try {
    await Linking.openURL(PRIVACY_POLICY_URL);
  } catch (error) {
    console.error('Não foi possível abrir a política de privacidade:', error);
    showAppAlert('Não foi possível abrir', 'Verifique a ligação à internet e tente novamente.');
  }
}
