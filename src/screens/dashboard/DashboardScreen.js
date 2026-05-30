import { StyleSheet, Text, View, ScrollView, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { colors, typography, spacing } from '../../theme';
import { getStreak } from '../../lib/streaks';
import { getCurrentUser } from '../../lib/auth';

export default function DashboardScreen({ route }) {
  const [streak, setStreak] = useState(0);
  const [name, setName] = useState(route?.params?.name || 'Atleta');
  const [loading, setLoading] = useState(true);
  const today = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  useEffect(() => {
    initDashboard();
  }, []);

  async function initDashboard() {
    const user = await getCurrentUser();
    if (user) {
      if (user.user_metadata?.name) setName(user.user_metadata.name);
      const { data } = await getStreak(user.id);
      if (data) setStreak(data.current_streak);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.accent.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.date}>{today}</Text>
        <Text style={styles.greeting}>Bienvenido, {name}.</Text>
        <Text style={styles.subtitle}>Tu disciplina construye tu destino.</Text>
      </View>
      <View style={styles.streakCard}>
        <Text style={styles.streakLabel}>Racha activa</Text>
        <Text style={styles.streakNumber}>{streak}</Text>
        <Text style={styles.streakUnit}>{streak === 1 ? 'dia' : 'dias'}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.primary },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.xxl },
  loadingContainer: { flex: 1, backgroundColor: colors.background.primary, alignItems: 'center', justifyContent: 'center' },
  header: { marginBottom: spacing.xl },
  date: { fontSize: typography.sizes.sm, color: colors.text.tertiary, marginBottom: spacing.xs, textTransform: 'capitalize' },
  greeting: { fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold, color: colors.text.primary, marginBottom: spacing.xs },
  subtitle: { fontSize: typography.sizes.sm, color: colors.text.secondary },
  streakCard: { backgroundColor: colors.background.card, borderRadius: 16, padding: spacing.lg, alignItems: 'center', marginBottom: spacing.xl, borderWidth: 1, borderColor: colors.accent.muted },
  streakLabel: { fontSize: typography.sizes.sm, color: colors.accent.primary, letterSpacing: 2, marginBottom: spacing.sm },
  streakNumber: { fontSize: 72, fontWeight: typography.weights.bold, color: colors.text.primary, lineHeight: 80 },
  streakUnit: { fontSize: typography.sizes.md, color: colors.text.secondary },
});
