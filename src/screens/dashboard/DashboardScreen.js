import { StyleSheet, Text, View, ScrollView, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { colors, typography, spacing } from '../../theme';
import { getStreak } from '../../lib/streaks';
import { getHabits } from '../../lib/habits';
import { getCurrentUser } from '../../lib/auth';

export default function DashboardScreen({ route }) {
  const [streak, setStreak] = useState(0);
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');

  useEffect(() => { initScreen(); }, []);

  async function initScreen() {
    try {
      const user = await getCurrentUser();
      if (user) {
        const name = user.user_metadata?.name || route?.params?.name || 'Atleta';
        setUserName(name);
        const [streakData, habitsData] = await Promise.all([
          getStreak(user.id).then(({ data }) => data?.current_streak || 0),
          getHabits(user.id),
        ]);
        setStreak(streakData || 0);
        setHabits(habitsData.data || []);
      }
    } catch (e) {
      console.log('Error dashboard:', e);
    } finally {
      setLoading(false);
    }
  }

  const completedHabits = habits.filter(h => h.completed).length;
  const totalHabits = habits.length;

  if (loading) return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator color={colors.accent.primary} />
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Bienvenido,</Text>
        <Text style={styles.name}>{userName}</Text>
        <Text style={styles.subtitle}>Compromiso. Disciplina. Transformación.</Text>
      </View>

      <View style={styles.streakCard}>
        <Text style={styles.streakNumber}>{streak}</Text>
        <Text style={styles.streakLabel}>días de racha</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Hábitos de hoy</Text>
        {totalHabits === 0 ? (
          <Text style={styles.emptyText}>Ve a Hábitos para agregar tus primeros hábitos.</Text>
        ) : (
          <>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: (completedHabits / totalHabits * 100) + '%' }]} />
            </View>
            <Text style={styles.progressText}>{completedHabits} de {totalHabits} completados</Text>
          </>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tu propósito</Text>
        <Text style={styles.purposeText}>
          Cada hábito que construyes hoy define quién serás mañana. La disciplina no es un destino — es el camino.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.primary },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.xxl },
  loadingContainer: { flex: 1, backgroundColor: colors.background.primary, alignItems: 'center', justifyContent: 'center' },
  header: { marginBottom: spacing.xl },
  greeting: { fontSize: typography.sizes.md, color: colors.text.secondary },
  name: { fontSize: typography.sizes.xxxl, fontWeight: typography.weights.bold, color: colors.text.primary, marginBottom: spacing.xs },
  subtitle: { fontSize: typography.sizes.xs, color: colors.accent.primary, letterSpacing: 2 },
  streakCard: { backgroundColor: colors.background.card, borderRadius: 16, padding: spacing.xl, alignItems: 'center', marginBottom: spacing.xl, borderWidth: 1, borderColor: colors.accent.muted },
  streakNumber: { fontSize: 64, fontWeight: typography.weights.bold, color: colors.accent.primary, lineHeight: 72 },
  streakLabel: { fontSize: typography.sizes.sm, color: colors.text.secondary, letterSpacing: 2, textTransform: 'uppercase' },
  section: { backgroundColor: colors.background.card, borderRadius: 16, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border.default },
  sectionTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.text.primary, marginBottom: spacing.md },
  progressBar: { height: 4, backgroundColor: colors.border.default, borderRadius: 2, marginBottom: spacing.sm },
  progressFill: { height: 4, backgroundColor: colors.accent.primary, borderRadius: 2 },
  progressText: { fontSize: typography.sizes.sm, color: colors.text.secondary },
  emptyText: { fontSize: typography.sizes.sm, color: colors.text.tertiary },
  purposeText: { fontSize: typography.sizes.sm, color: colors.text.secondary, lineHeight: 22, fontStyle: 'italic' },
});