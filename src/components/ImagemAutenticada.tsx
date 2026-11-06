import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ImageProps, Platform, StyleSheet, Text, View } from 'react-native';

type Props = Omit<ImageProps, 'source'> & {
  uri: string;
  token?: string | null;
};

/**
 * Mostra uma imagem que pode exigir autenticação.
 *
 * No telemóvel, o <Image> envia o cabeçalho Authorization diretamente.
 * No navegador isso não é possível: a imagem é descarregada com fetch
 * (com o token) e apresentada a partir de um endereço local (blob:).
 */
export default function ImagemAutenticada({ uri, token, style, ...resto }: Props) {
  const remota = /^https?:\/\//i.test(uri);
  const precisaDeFetch = Platform.OS === 'web' && remota && !!token;
  const chave = `${uri}|${token ?? ''}`;
  const [resultado, setResultado] = useState<{ chave: string; url?: string; falhou?: boolean } | null>(null);

  useEffect(() => {
    if (!precisaDeFetch) return;

    let cancelado = false;
    let urlCriado: string | null = null;

    fetch(uri, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (resposta) => {
        if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
        const blob = await resposta.blob();
        if (cancelado) return;
        urlCriado = URL.createObjectURL(blob);
        setResultado({ chave, url: urlCriado });
      })
      .catch(() => {
        if (!cancelado) setResultado({ chave, falhou: true });
      });

    return () => {
      cancelado = true;
      if (urlCriado) URL.revokeObjectURL(urlCriado);
    };
  }, [uri, token, chave, precisaDeFetch]);

  const atual = resultado?.chave === chave ? resultado : null;
  const uriLocal = precisaDeFetch ? atual?.url ?? null : uri;
  const falhou = precisaDeFetch && !!atual?.falhou;

  if (falhou) {
    return (
      <View style={[style, styles.centro]}>
        <Text style={styles.aviso}>Não foi possível carregar a imagem</Text>
      </View>
    );
  }

  if (!uriLocal) {
    return (
      <View style={[style, styles.centro]}>
        <ActivityIndicator />
      </View>
    );
  }

  const cabecalhos = Platform.OS !== 'web' && remota && token
    ? { headers: { Authorization: `Bearer ${token}` } }
    : {};

  return <Image {...resto} style={style} source={{ uri: uriLocal, ...cabecalhos }} />;
}

const styles = StyleSheet.create({
  centro: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F4F8',
  },
  aviso: {
    color: '#627D98',
    fontSize: 12,
    textAlign: 'center',
    padding: 8,
  },
});
