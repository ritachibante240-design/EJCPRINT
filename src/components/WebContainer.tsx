import React, { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Na web, injeta CSS globais para garantir que html/body preenchem
 * o ecrã completo (necessário para o Expo Web funcionar a 100%).
 * No iOS/Android não faz nada.
 */
export default function WebContainer({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const style = document.createElement('style');
    style.id = 'ejc-web-globals';
    style.textContent = `
      html, body { height: 100%; margin: 0; padding: 0; }
      #root { height: 100%; display: flex; flex-direction: column; }
    `;
    if (!document.getElementById('ejc-web-globals')) {
      document.head.appendChild(style);
    }
    return () => {
      document.getElementById('ejc-web-globals')?.remove();
    };
  }, []);

  return <>{children}</>;
}
