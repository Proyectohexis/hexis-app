import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { colors, typography, spacing } from '../../theme';

export default function DashboardScreen({ route }) {
  const name = route?.params?.name || 'Atleta';
  const today = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.date}>{today}</Text>
        <Text style={styles.greeting}>Bienvenido, {name}.</Text>
        <Text style={styles.subtitle}>Tu disciplina construye tu destino.</Text>
      </View>
      <View style={styles.streakCard}>
        <Text style={styles.streakLabel}>Racha activa</Text>
        <Text style={styles.streakNumber}>1</Text>
        <Text style={styles.streakUnit}>día</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Hábitos de hoy</Text>
        {['Entrenamiento', 'Lectura', 'Meditación'].map((habit) => (
          <View key={habit} style={styles.habitRow}>
            <View style={styles.habitDot} />
            <Text style={styles.habitText}>{habit}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.primary },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.xxl },
  header: { marginBottom: spacing.xl },
  date: { fontSize: typography.sizes.sm, color: colors.text.tertiary, marginBottom: spacing.xs, textTransform: 'capitalize' },
  greeting: { fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold, color: colors.text.primary, marginBottom: spacing.xs },
  subtitle: { fontSize: typography.sizes.sm, color: colors.text.secondary },
  streakCard: { backgroundColor: colors.background.card, borderRadius: 16, padding: spacing.lg, alignItems: 'center', marginBottom: spacing.xl, borderWidth: 1, borderColor: colors.accent.muted },
  streakLabel: { fontSize: typography.sizes.sm, color: colors.accent.primary, letterSpacing: 2, marginBottom: spacing.sm },
  streakNumber: { fontSize: 72, fontWeight: typography.weights.bold, color: colors.text.primary, lineHeight: 80 },
  streakUnit: { fontSize: typography.sizes.md, color: colors.text.secondary },
  section: { marginBottom: spacing.xl },
  sectionTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.text.primary, marginBottom: spacing.md },
  habitRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  habitDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent.primary, marginRight: spacing.md },
  habitText: { fontSize: typography.sizes.md, color: colors.text.secondary },
});