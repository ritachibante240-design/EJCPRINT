import { Platform } from 'react-native';

if (Platform.OS === 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ExpoSecureStoreModule = require('expo-secure-store/build/ExpoSecureStore');
    const target = ExpoSecureStoreModule.default || ExpoSecureStoreModule;
    if (target) {
      if (!target.setValueWithKeyAsync) {
        target.setValueWithKeyAsync = async (value: string, key: string) => {
          try {
            if (typeof window !== 'undefined' && window.localStorage) {
              window.localStorage.setItem(key, value);
            }
          } catch {}
        };
      }
      if (!target.getValueWithKeyAsync) {
        target.getValueWithKeyAsync = async (key: string) => {
          try {
            if (typeof window !== 'undefined' && window.localStorage) {
              return window.localStorage.getItem(key);
            }
          } catch {}
          return null;
        };
      }
      if (!target.deleteValueWithKeyAsync) {
        target.deleteValueWithKeyAsync = async (key: string) => {
          try {
            if (typeof window !== 'undefined' && window.localStorage) {
              window.localStorage.removeItem(key);
            }
          } catch {}
        };
      }
    }
  } catch {}
}
