import { showAppAlert } from '../../components/AppAlert';
import TextInput from '../../components/AppTextInput';
import { colors, fontWeights, radii, spacing } from '../../theme';
import React, { useCallback, useState } from 'react';
import {
	View,
	Text,
	Pressable,
	StyleSheet,
	FlatList,
	Alert,
	KeyboardAvoidingView,
	Platform,
} from 'react-native';

import { useFocusEffect } from '@react-navigation/native';
import { useResponsiveContent } from '../../hooks/useResponsive';

import {
	criarDespesa,
	listarDespesas,
	Despesa,
	TipoSaida,
} from '../../services/despesaService';

const tipos: { id: TipoSaida; nome: string }[] = [
	{ id: 'COMPRA_STOCK', nome: 'Compra de stock' },
	{ id: 'DESPESA_OPERACIONAL', nome: 'Despesa operacional' },
	{ id: 'OUTRO', nome: 'Outro' },
];

const categorias = [
	'Papel',
	'Tinta',
	'Encadernação',
	'Manutenção',
	'Equipamento',
	'Outros',
];

export default function DespesasScreen() {
  const { isDesktop } = useResponsiveContent(20);
	const [descricao, setDescricao] = useState('');
	const [valor, setValor] = useState('');
	const [tipo, setTipo] = useState<TipoSaida>('DESPESA_OPERACIONAL');
	const [categoria, setCategoria] = useState('Papel');
	const [despesas, setDespesas] = useState<Despesa[]>([]);

	async function carregar() {
		try {
			const dados = await listarDespesas();
			setDespesas(dados);
		} catch (erro) {
			showAppAlert('Despesas indisponíveis', erro instanceof Error ? erro.message : 'Não foi possível carregar as despesas online.');
		}
	}

	useFocusEffect(
		useCallback(() => {
			carregar();
		}, [])
	);

	async function guardar() {
		const valorNumero = Number(
			valor.replace(',', '.')
		);

		if (!descricao.trim()) {
			showAppAlert(
				'Atenção',
				'Informe a descrição da despesa.'
			);
			return;
		}

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
			await criarDespesa(
				descricao.trim(),
				categoria,
				tipo,
				valorNumero
			);

			setDescricao('');
			setValor('');

			await carregar();

			showAppAlert(
				'Despesa registada',
				`${valorNumero.toFixed(2)} MT`
			);
		} catch (erro) {
			console.error(erro);

			showAppAlert(
				'Erro',
				'Não foi possível guardar a despesa.'
			);
		}
	}

	const totalCentavos = despesas.reduce(
		(soma, item) => soma + Math.round(item.valor * 100),
		0
	);
	const total = totalCentavos / 100;

	return (
		<KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
		<FlatList
			keyboardShouldPersistTaps="handled"
			style={styles.container}
			contentContainerStyle={[styles.content, isDesktop && { maxWidth: 1000, width: '100%', alignSelf: 'center' }]}
			data={despesas}
			keyExtractor={(item) => item.id.toString()}
			ListHeaderComponent={
				<>
					<Text style={styles.title}>
						Despesas
					</Text>

					<Text style={styles.subtitle}>
						Registe os gastos da EJC Print
					</Text>

					<View style={styles.totalCard}>
						<Text style={styles.totalLabel}>
							Total de despesas
						</Text>

						<Text style={styles.total}>
							{total.toFixed(2)} MT
						</Text>
					</View>

					<View style={styles.form}>
						<Text style={styles.label}>
							Descrição
						</Text>

						<TextInput
							style={styles.input}
							placeholder="Ex.: Compra de uma resma A4"
							value={descricao}
							onChangeText={setDescricao}
						/>

						<Text style={styles.label}>
							Tipo de saída
						</Text>

						<View style={styles.categories}>
							{tipos.map((item) => (
								<Pressable
									key={item.id}
									style={[
										styles.category,
										tipo === item.id &&
											styles.categorySelected,
									]}
									onPress={() => setTipo(item.id)}
								>
									<Text
										style={[
											styles.categoryText,
											tipo === item.id &&
												styles.categoryTextSelected,
										]}
									>
										{item.nome}
									</Text>
								</Pressable>
							))}
						</View>

						<Text style={styles.label}>
							Categoria
						</Text>

						<View style={styles.categories}>
							{categorias.map((item) => (
								<Pressable
									key={item}
									style={[
										styles.category,
										categoria === item &&
											styles.categorySelected,
									]}
									onPress={() => setCategoria(item)}
								>
									<Text
										style={[
											styles.categoryText,
											categoria === item &&
												styles.categoryTextSelected,
										]}
									>
										{item}
									</Text>
								</Pressable>
							))}
						</View>

						<Text style={styles.label}>
							Valor
						</Text>

						<TextInput
							style={styles.input}
							placeholder="Ex.: 350"
							keyboardType="decimal-pad"
							value={valor}
							onChangeText={setValor}
						/>

						<Pressable
							style={styles.button}
							onPress={guardar}
						>
							<Text style={styles.buttonText}>
								Registar despesa
							</Text>
						</Pressable>
					</View>

					<Text style={styles.historyTitle}>
						Histórico
					</Text>
				</>
			}
			renderItem={({ item }) => (
				<View style={styles.expenseCard}>
					<View>
						<Text style={styles.expenseName}>
							{item.descricao}
						</Text>

						<Text style={styles.expenseCategory}>
							{item.tipo === 'COMPRA_STOCK'
								? 'Compra de stock'
								: item.tipo === 'DESPESA_OPERACIONAL'
									? 'Despesa operacional'
									: 'Outro'}
							{' • '}
							{item.categoria}
						</Text>
					</View>

					<Text style={styles.expenseValue}>
						- {item.valor.toFixed(2)} MT
					</Text>
				</View>
			)}
			ListEmptyComponent={
				<Text style={styles.empty}>
					Nenhuma despesa registada.
				</Text>
			}
		/>
		</KeyboardAvoidingView>
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

	title: {
		fontSize: 28,
		fontWeight: fontWeights.bold,
		color: colors.brand,
	},

	subtitle: {
		color: colors.subtle,
		marginTop: spacing.xs,
		marginBottom: spacing.xl,
	},

	totalCard: {
		backgroundColor: colors.brand,
		padding: spacing.xl,
		borderRadius: radii.lg,
		marginBottom: spacing.xl,
	},

	totalLabel: {
		color: colors.border,
	},

	total: {
		color: colors.surface,
		fontSize: 30,
		fontWeight: fontWeights.bold,
		marginTop: 5,
	},

	form: {
		backgroundColor: colors.surface,
		padding: 18,
		borderRadius: radii.lg,
	},

	label: {
		color: colors.text,
		fontWeight: fontWeights.semibold,
		marginBottom: spacing.sm,
		marginTop: 10,
	},

	input: {
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: radii.md,
		padding: 14,
		fontSize: 16,
	},

	categories: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: spacing.sm,
	},

	category: {
		borderWidth: 1,
		borderColor: colors.border,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
		borderRadius: radii.xxl,
	},

	categorySelected: {
		backgroundColor: colors.brand,
		borderColor: colors.brand,
	},

	categoryText: {
		color: '#486581',
	},

	categoryTextSelected: {
		color: colors.surface,
	},

	button: {
		backgroundColor: colors.brand,
		padding: spacing.lg,
		borderRadius: radii.md,
		alignItems: 'center',
		marginTop: 18,
	},

	buttonText: {
		color: colors.surface,
		fontWeight: fontWeights.bold,
	},

	historyTitle: {
		fontSize: 20,
		fontWeight: fontWeights.bold,
		color: colors.brand,
		marginTop: spacing.xxxl,
		marginBottom: spacing.md,
	},

	expenseCard: {
		backgroundColor: colors.surface,
		padding: spacing.lg,
		borderRadius: 14,
		marginBottom: 10,
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},

	expenseName: {
		color: colors.text,
		fontWeight: fontWeights.semibold,
	},

	expenseCategory: {
		color: colors.subtle,
		fontSize: 12,
		marginTop: spacing.xs,
	},

	expenseValue: {
		color: colors.danger,
		fontWeight: fontWeights.bold,
	},

	empty: {
		color: colors.subtle,
		textAlign: 'center',
		marginTop: spacing.xl,
	},
});
