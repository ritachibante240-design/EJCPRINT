import { Platform, useWindowDimensions } from 'react-native';

/** Largura a partir da qual consideramos "desktop" */
const DESKTOP_BREAKPOINT = 768;

/** Largura máxima do conteúdo em layouts desktop */
const CONTENT_MAX_WIDTH = 900;

/**
 * Devolve estilos responsivos para o contentContainerStyle dos ScrollViews.
 * Em desktop (web >= 768px) centraliza o conteúdo com maxWidth.
 * Em mobile mantém o comportamento existente.
 */
export function useResponsiveContent(basePadding: number = 20) {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;

  return {
    isDesktop,
    contentStyle: isDesktop
      ? {
          paddingHorizontal: Math.max(basePadding, width * 0.06),
          paddingVertical: 32,
          maxWidth: CONTENT_MAX_WIDTH,
          width: '100%' as const,
          alignSelf: 'center' as const,
        }
      : {
          padding: basePadding,
          paddingBottom: 40,
        },
  };
}

/**
 * Devolve a largura máxima do conteúdo para uso em grid/colunas.
 */
export function useDesktopGrid() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const columns = isDesktop ? 2 : 1;
  return { isDesktop, columns };
}
