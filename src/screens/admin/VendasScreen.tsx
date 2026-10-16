import { formatarDinheiro } from '../../utils/formatters';
import { colors, fontWeights, radii, spacing } from '../../theme';
import { showAppAlert } from '../../components/AppAlert';
import TextInput from '../../components/AppTextInput';
import React, { useCallback, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';

import {
	View,
	Text,
	StyleSheet,
	FlatList,
	Pressable,
	Alert,
	Modal,
	Image,
} from 'react-native';

import { useFocusEffect } from '@react-navigation/native';
import { useResponsiveContent } from '../../hooks/useResponsive';
import { sincronizarTudoPendentes } from '../../services/sincronizacaoSeguraService';
import { abrirArquivoPedido } from '../../services/arquivoRemotoService';
import { obterTokenAdministrador } from '../../services/adminAuthService';

import {
	listarPedidos,
	Pedido,
} from '../../services/pedidoService';
import { enviarPagamento, registrarPagamento, MetodoPagamento, TipoPagamento, listarPagamentos, confirmarPagamento as confirmarPagamentoAdmin, rejeitarPagamento, Pagamento } from '../../services/pagamentoService';

export default function VendasScreen() {
	const { isDesktop } = useResponsiveContent(20);
	const [pedidos, setPedidos] = useState<Pedido[]>([]);
	const [pedidoSelecionado, setPedidoSelecionado] =
		useState<Pedido | null>(null);
	const [valor, setValor] = useState('');
	const [metodo, setMetodo] = useState<MetodoPagamento>('Dinheiro');
	const [referencia, setReferencia] = useState('');
	const tipoPagamento: TipoPagamento = 'TOTAL';
	const [comprovativoUri, setComprovativoUri] = useState<string | null>(null);
	const [comprovativoNome, setComprovativoNome] = useState<string | null>(null);
	const [visualizarComprovativo, setVisualizarComprovativo] = useState(false);
	const [pendentes, setPendentes] = useState<(Pagamento & { numero_pedido: string; cliente: string })[]>([]);
	const [pagamentoProcessando, setPagamentoProcessando] = useState<number | null>(null);

	async function carregar(mostrarErro = true) {
		const carregarDadosLocais = async () => {
			const [dados, pagamentos] = await Promise.all([
				listarPedidos(),
				listarPagamentos(),
			]);
			setPedidos(dados);
			setPendentes(pagamentos.filter((item) => item.status === 'PENDENTE'));
		};

		try {
			await carregarDadosLocais();
		} catch (erro) {
			showAppAlert('Vendas indisponíveis', erro instanceof Error ? erro.message : 'Não foi possível carregar as vendas locais.');
			return;
		}

		let erroSincronizacao: unknown;
		try {
			await sincronizarTudoPendentes(1, 1200);
		} catch (erro) {
			erroSincronizacao = erro;
			console.warn('Não foi possível atualizar vendas do servidor.', erro);
		}

		try {
			await carregarDadosLocais();
		} catch (erro) {
			showAppAlert('Vendas indisponíveis', erro instanceof Error ? erro.message : 'Não foi possível carregar as vendas locais.');
			return;
		}

		if (erroSincronizacao && mostrarErro) {
			const detalhe = erroSincronizacao instanceof Error
				? erroSincronizacao.message
				: 'O servidor não conseguiu concluir a sincronização.';
			showAppAlert(
				'Vendas não atualizadas',
				`Os dados guardados neste dispositivo foram carregados, mas não foi possível atualizar os pedidos e pagamentos do servidor.\n\nMotivo: ${detalhe}\n\nVerifique a ligação ou inicie sessão novamente e tente atualizar.`
			);
		}
	}

	useFocusEffect(
		useCallback(() => {
			carregar();
		}, [])
	);

	function abrirPagamento(pedido: Pedido) {
		setPedidoSelecionado(pedido);
		setValor('');
		setReferencia(''); setComprovativoUri(null); setComprovativoNome(null); setMetodo('Dinheiro');
	}

	async function escolherComprovativo() {
		const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
		if (!permissao.granted) return showAppAlert('Permissão necessária', 'Permita o acesso às fotografias.');
		const resultado = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsMultipleSelection: false });
		if (!resultado.canceled) { const imagem = resultado.assets[0]; setComprovativoUri(imagem.uri); setComprovativoNome(imagem.fileName ?? `comprovativo-${Date.now()}.jpg`); }
	}

	async function tirarFotoComprovativo() {
		const permissao = await ImagePicker.requestCameraPermissionsAsync();
		if (!permissao.granted) return showAppAlert('Permissão necessária', 'Permita o acesso à câmera.');
		const resultado = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: false });
		if (!resultado.canceled) { const imagem = resultado.assets[0]; setComprovativoUri(imagem.uri); setComprovativoNome(imagem.fileName ?? `comprovativo-${Date.now()}.jpg`); }
	}

	async function confirmarPagamento() {
		if (!pedidoSelecionado) {
			return;
		}

		const valorNumero = Number(
			valor.replace(',', '.')
		);

		if (
			!Number.isFinite(valorNumero) ||
			valorNumero <= 0
		) {
			showAppAlert(
				'Atenção',
				'Informe um valor válido.'
			);

			return;
		}

		try {
			if (metodo === 'Dinheiro') await registrarPagamento(
				pedidoSelecionado.id,
				valorNumero,
				metodo,
				referencia
			);
			else await enviarPagamento(pedidoSelecionado.id, valorNumero, metodo, tipoPagamento, referencia, comprovativoNome ?? undefined, comprovativoUri ?? undefined);

			setPedidoSelecionado(null);
			setValor('');
			setReferencia('');
			setMetodo('Dinheiro');
			setComprovativoUri(null); setComprovativoNome(null);

			await carregar();

			showAppAlert(
				'Pagamento registado',
				`${valorNumero.toFixed(2)} MT recebidos.`
			);
		} catch (erro) {
			showAppAlert(
				'Erro',
				erro instanceof Error
					? erro.message
					: 'Não foi possível registar o pagamento.'
			);
		}
	}

	async function analisarPagamento(id: number, aprovar: boolean) {
		if (pagamentoProcessando !== null) return;
		setPagamentoProcessando(id);
		try {
			if (aprovar) await confirmarPagamentoAdmin(id);
			else await rejeitarPagamento(id, 'Comprovativo incorreto');
			void carregar(false);
			showAppAlert(aprovar ? 'Pagamento aprovado' : 'Pagamento reprovado', aprovar ? 'O pagamento entrou no Caixa.' : 'O cliente poderá enviar um novo comprovativo.');
		} catch (erro) {
			showAppAlert('Não foi possível processar', erro instanceof Error ? erro.message : 'Pagamento já analisado ou indisponível.');
		} finally {
			setPagamentoProcessando(null);
		}
	}

	async function abrirComprovativoPagamento(pagamento: Pagamento) {
		if (!pagamento.comprovativo_uri) {
			showAppAlert('Comprovativo indisponível', 'Este pagamento não tem um comprovativo anexado.');
			return;
		}

		const nome = pagamento.comprovativo_nome ?? 'comprovativo';
		const extensao = nome.split('.').pop()?.toLowerCase();
		const mimeType = extensao === 'pdf'
			? 'application/pdf'
			: extensao === 'png'
				? 'image/png'
				: 'image/jpeg';

		try {
			const token = pagamento.comprovativo_uri.startsWith('http')
				? await obterTokenAdministrador()
				: null;
			await abrirArquivoPedido(
				pagamento.comprovativo_uri,
				nome,
				mimeType,
				token
			);
		} catch (erro) {
			showAppAlert(
				'Não foi possível abrir o comprovativo',
				erro instanceof Error ? erro.message : 'Verifique a ligação e tente novamente.'
			);
		}
	}

	function renderPedido({
		item,
	}: {
		item: Pedido;
	}) {
		const pago = item.valor_pago ?? 0;
		const faltaCentavos = Math.max(
			Math.round(item.total * 100) - Math.round(pago * 100),
			0
		);
		const falta = faltaCentavos / 100;
		const pagamentoCompleto = falta <= 0;

		let estadoPagamento = 'Não pago';

		if (pago > 0 && !pagamentoCompleto) {
			estadoPagamento = 'Parcial';
		}

		if (pagamentoCompleto) {
			estadoPagamento = 'Pago';
		}

		return (
			<View style={styles.card}>
				<View style={styles.header}>
					<Text style={styles.numero}>
						{item.numero}
					</Text>

					<Text
						style={[
							styles.paymentStatus,
							pagamentoCompleto && styles.paid,
						]}
					>
						{estadoPagamento}
					</Text>
				</View>

				<Text style={styles.cliente}>
					{item.cliente}
				</Text>

				<Text style={styles.servico}>
					{item.servico}
				</Text>

				<View style={styles.line} />

				<View style={styles.row}>
					<Text style={styles.label}>Total</Text>
					<Text style={styles.value}>
						{item.total.toFixed(2)} MT
					</Text>
				</View>

				<View style={styles.row}>
					<Text style={styles.label}>Recebido</Text>
					<Text style={styles.received}>
						{pago.toFixed(2)} MT
					</Text>
				</View>

				<View style={styles.row}>
					<Text style={styles.label}>Em falta</Text>
					<Text style={styles.missing}>
						{falta.toFixed(2)} MT
					</Text>
				</View>

				{!pagamentoCompleto && (
					<View style={styles.waitingPayment}>
						<Text style={styles.waitingPaymentText}>
							O cliente deve enviar o comprovativo. Analise-o na área de pagamentos pendentes.
						</Text>
					</View>
				)}

				{pagamentoCompleto && (
					<View style={styles.complete}>
						<Text style={styles.completeText}>
							✓ Pagamento concluído
						</Text>
					</View>
				)}
			</View>
		);
	}

	return (
		<>
			{pendentes.length > 0 && <View style={styles.pendingReview}><Text style={styles.reviewTitle}>Pagamentos para análise</Text>{pendentes.map((pagamento) => <View key={pagamento.id} style={styles.reviewCard}><Text style={styles.numero}>{pagamento.numero_pedido}</Text><Text style={styles.cliente}>{pagamento.cliente}</Text><Text style={styles.reviewAmount}>{pagamento.valor.toFixed(2)} MT • {pagamento.metodo}</Text><Pressable onPress={() => { void abrirComprovativoPagamento(pagamento); }}><Text style={styles.viewProof}>{pagamento.comprovativo_uri ? 'Ver comprovativo' : 'Comprovativo indisponível'}</Text></Pressable><View style={styles.reviewActions}><Pressable disabled={pagamentoProcessando !== null} style={styles.approveButton} onPress={() => { void analisarPagamento(pagamento.id, true); }}><Text style={styles.approveText}>{pagamentoProcessando === pagamento.id ? 'A processar...' : 'Confirmar'}</Text></Pressable><Pressable disabled={pagamentoProcessando !== null} style={styles.rejectButton} onPress={() => { void analisarPagamento(pagamento.id, false); }}><Text style={styles.rejectText}>{pagamentoProcessando === pagamento.id ? 'A processar...' : 'Rejeitar'}</Text></Pressable></View></View>)}</View>}
			<FlatList
				style={styles.container}
				contentContainerStyle={[styles.content, isDesktop && { maxWidth: 1000, width: '100%', alignSelf: 'center' }]}
				data={pedidos}
				keyExtractor={(item) => item.id.toString()}
				renderItem={renderPedido}
				ListEmptyComponent={
					<View style={styles.empty}>
						<Text style={styles.emptyTitle}>Nenhum pedido para apresentar</Text>
						<Text style={styles.emptyText}>
							Os pedidos dos clientes aparecerão aqui quando forem sincronizados.
						</Text>
					</View>
				}
				ListHeaderComponent={
					<View style={styles.pageHeader}>
						<Text style={styles.title}>
							Vendas e Pagamentos
						</Text>

						<Text style={styles.subtitle}>
							Controle do dinheiro recebido
						</Text>
					</View>
				}
			/>

			<Modal
				visible={pedidoSelecionado !== null}
				transparent
				animationType="fade"
				onRequestClose={() =>
					setPedidoSelecionado(null)
				}
			>
				<View style={styles.overlay}>
					<View style={styles.modal}>
						<Text style={styles.modalTitle}>
							Registar pagamento
						</Text>

						<Text style={styles.modalPedido}>
							{pedidoSelecionado?.numero}
						</Text>

						<Text style={styles.modalLabel}>
							Valor recebido
						</Text>

						<TextInput
							style={styles.input}
							placeholder="Ex.: 150"
							keyboardType="decimal-pad"
							value={valor}
							onChangeText={setValor}
						/>

						<Text style={styles.modalLabel}>Método</Text>
						<View style={styles.methods}>
							{(['Dinheiro', 'M-Pesa', 'e-Mola', 'Transferência'] as MetodoPagamento[]).map((item) => (
								<Pressable key={item} style={[styles.methodButton, metodo === item && styles.methodButtonSelected]} onPress={() => setMetodo(item)}>
									<Text style={[styles.methodText, metodo === item && styles.methodTextSelected]}>{item}</Text>
								</Pressable>
							))}
						</View>
						{metodo !== 'Dinheiro' && <><Text style={styles.modalLabel}>Referência</Text><TextInput style={styles.input} value={referencia} onChangeText={setReferencia} placeholder="Opcional" /></>}
						{metodo !== 'Dinheiro' && <View style={styles.proofSection}><Text style={styles.modalLabel}>Comprovativo</Text>{comprovativoUri ? <View style={styles.proofCard}><Image source={{ uri: comprovativoUri }} style={styles.proofThumbnail} /><View style={styles.proofInfo}><Text style={styles.attachedText}>Comprovativo anexado</Text><Pressable onPress={() => setVisualizarComprovativo(true)}><Text style={styles.viewProof}>Visualizar</Text></Pressable><Pressable onPress={escolherComprovativo}><Text style={styles.changeProof}>Trocar</Text></Pressable></View></View> : <Pressable style={styles.proofButton} onPress={tirarFotoComprovativo}><Text style={styles.methodText}>Fotografar comprovativo</Text></Pressable>}</View>}

						<Pressable
							style={styles.confirmButton}
							onPress={confirmarPagamento}
						>
							<Text style={styles.buttonText}>
								Confirmar pagamento
							</Text>
						</Pressable>

						<Pressable
							onPress={() =>
								setPedidoSelecionado(null)
							}
						>
							<Text style={styles.cancel}>
								Cancelar
							</Text>
						</Pressable>
					</View>
				</View>
			</Modal>
			<Modal visible={visualizarComprovativo} transparent animationType="fade" onRequestClose={() => setVisualizarComprovativo(false)}><View style={styles.imageModal}><Pressable style={styles.closeImage} onPress={() => setVisualizarComprovativo(false)}><Text style={styles.closeText}>×</Text></Pressable>{comprovativoUri && <Image source={{ uri: comprovativoUri }} style={styles.fullImage} resizeMode="contain" />}</View></Modal>
		</>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background,
	},

	content: {
		padding: spacing.xl,
		paddingBottom: 40,
	},

	pageHeader: {
		marginBottom: spacing.xl,
	},

	empty: {
		alignItems: 'center',
		paddingHorizontal: spacing.xl,
		paddingVertical: 48,
	},

	emptyTitle: {
		color: colors.brand,
		fontSize: 16,
		fontWeight: fontWeights.bold,
		textAlign: 'center',
	},

	emptyText: {
		color: colors.subtle,
		marginTop: spacing.sm,
		textAlign: 'center',
	},

	title: {
		fontSize: 28,
		fontWeight: fontWeights.bold,
		color: colors.brand,
	},

	subtitle: {
		color: colors.subtle,
		marginTop: spacing.xs,
	},

	card: {
		backgroundColor: colors.surface,
		padding: 18,
		borderRadius: radii.lg,
		marginBottom: 14,
	},

	header: {
		flexDirection: 'row',
		justifyContent: 'space-between',
	},

	numero: {
		color: colors.brand,
		fontSize: 18,
		fontWeight: fontWeights.bold,
	},

	paymentStatus: {
		color: colors.danger,
		fontWeight: fontWeights.bold,
	},

	paid: {
		color: colors.success,
	},

	cliente: {
		fontSize: 16,
		fontWeight: fontWeights.semibold,
		color: colors.text,
		marginTop: 15,
	},

	servico: {
		color: colors.subtle,
		marginTop: spacing.xs,
	},

	line: {
		height: 1,
		backgroundColor: colors.border,
		marginVertical: 15,
	},

	row: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginBottom: 9,
	},

	label: {
		color: colors.subtle,
	},

	value: {
		color: colors.brand,
		fontWeight: fontWeights.bold,
	},

	received: {
		color: colors.success,
		fontWeight: fontWeights.bold,
	},

	missing: {
		color: colors.danger,
		fontWeight: fontWeights.bold,
	},

	button: {
		backgroundColor: colors.brand,
		padding: 15,
		borderRadius: radii.md,
		alignItems: 'center',
		marginTop: spacing.md,
	},

	buttonText: {
		color: colors.surface,
		fontWeight: fontWeights.bold,
	},

	waitingPayment: {
		backgroundColor: colors.warningSoft,
		borderRadius: radii.sm,
		padding: 11,
		marginTop: 14,
	},

	waitingPaymentText: {
		color: colors.warning,
		fontSize: 12,
		lineHeight: 18,
	},

	complete: {
		backgroundColor: colors.successSoft,
		padding: 13,
		borderRadius: radii.sm,
		alignItems: 'center',
		marginTop: spacing.md,
	},

	completeText: {
		color: colors.success,
		fontWeight: fontWeights.bold,
	},

	overlay: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.45)',
		justifyContent: 'center',
		padding: 25,
	},

	modal: {
		backgroundColor: colors.surface,
		padding: 22,
		borderRadius: radii.xl,
	},

	modalTitle: {
		color: colors.brand,
		fontSize: 22,
		fontWeight: fontWeights.bold,
	},

	modalPedido: {
		color: colors.muted,
		marginTop: 5,
		marginBottom: spacing.xl,
	},

	modalLabel: {
		color: colors.text,
		marginBottom: spacing.sm,
	},

	input: {
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: radii.md,
		padding: 15,
		fontSize: 18,
	},

	methods: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
	methodButton: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, paddingHorizontal: spacing.md, paddingVertical: 10 },
	methodButtonSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
	methodText: { color: '#334E68', fontWeight: fontWeights.semibold },
	methodTextSelected: { color: colors.surface },
	pendingReview: { margin: spacing.xl, marginBottom: 0 }, reviewTitle: { color: colors.brand, fontSize: 18, fontWeight: fontWeights.bold, marginBottom: 10 }, reviewCard: { backgroundColor: colors.warningSoft, borderRadius: 14, padding: 14, marginBottom: 10 }, reviewAmount: { color: colors.warning, fontWeight: fontWeights.bold, marginTop: 5 }, reviewActions: { flexDirection: 'row', gap: spacing.sm, marginTop: 10 }, approveButton: { flex: 1, backgroundColor: colors.success, padding: 10, borderRadius: 9, alignItems: 'center' }, approveText: { color: '#FFF', fontWeight: fontWeights.bold }, rejectButton: { flex: 1, backgroundColor: colors.dangerSoft, padding: 10, borderRadius: 9, alignItems: 'center' }, rejectText: { color: colors.danger, fontWeight: fontWeights.bold },
	proofSection: { marginTop: spacing.md }, proofButton: { minHeight: 55, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' }, proofCard: { flexDirection: 'row', backgroundColor: '#F8FAFC', padding: spacing.sm, borderRadius: radii.md }, proofThumbnail: { width: 70, height: 70, borderRadius: 8 }, proofInfo: { flex: 1, marginLeft: 10, justifyContent: 'center', gap: 6 }, attachedText: { color: colors.success, fontWeight: fontWeights.bold }, viewProof: { color: colors.brand, fontWeight: fontWeights.bold }, changeProof: { color: '#486581', fontWeight: fontWeights.semibold }, imageModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' }, fullImage: { width: '100%', height: '85%' }, closeImage: { position: 'absolute', top: 50, right: 20, zIndex: 10 }, closeText: { color: '#FFF', fontSize: 36 },

	confirmButton: {
		backgroundColor: colors.brand,
		padding: 15,
		borderRadius: radii.md,
		alignItems: 'center',
		marginTop: 15,
	},

	cancel: {
		textAlign: 'center',
		color: colors.muted,
		marginTop: 18,
	},
});
