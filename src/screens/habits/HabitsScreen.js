import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { colors, typography, spacing } from '../../theme';
import { getHabits, toggleHabit, createHabit } from '../../lib/habits';

const USER_ID = 'user_001';

export default function HabitsScreen() {
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHabits();
  }, []);

  async function loadHabits() {
    setLoading(true);
    const { data } = await getHabits(USER_ID);
    if (data && data.length === 0) {
      await createHabit(USER_ID, 'Entrenamiento');
      await createHabit(USER_ID, 'Lectura');
      await createHabit(USER_ID, 'Meditacion');
      const { data: newData } = await getHabits(USER_ID);
      setHabits(newData || []);
    } else {
      setHabits(data || []);
    }
    setLoading(false);
  }

  async function handleToggle(habit) {
    await toggleHabit(habit.id, !habit.completed);
    setHabits(habits.map(h => h.id === habit.id ? { ...h, completed: !h.completed } : h));
  }

  const completed = habits.filter(h => h.completed).length;

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
        <Text style={styles.title}>Habitos</Text>
        <Text style={styles.subtitle}>{completed} de {habits.length} completados</Text>
      </View>

      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: habits.length > 0 ? `${(completed / habits.length) * 100}%` : '0%' }]} />
      </View>

      <View style={styles.list}>
        {habits.map((habit) => (
          <TouchableOpacity
            key={habit.id}
            style={[styles.habitCard, habit.completed && styles.habitCardDone]}
            onPress={() => handleToggle(habit)}
          >
            <View style={[styles.check, habit.completed && styles.checkDone]}>
              {habit.completed && <Text style={styles.checkMark}>✓</Text>}
            </View>
            <Text style={[styles.habitName, habit.completed && styles.habitNameDone]}>
              {habit.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.primary },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.xxl },
  loadingContainer: { flex: 1, backgroundColor: colors.background.primary, alignItems: 'center', justifyContent: 'center' },
  header: { marginBottom: spacing.md },
  title: { fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold, color: colors.text.primary, marginBottom: spacing.xs },
  subtitle: { fontSize: typography.sizes.sm, color: colors.text.secondary },
  progressBar: { height: 4, backgroundColor: colors.border.default, borderRadius: 2, marginBottom: spacing.xl },
  progressFill: { height: 4, backgroundColor: colors.accent.primary, borderRadius: 2 },
  list: { gap: spacing.sm },
  habitCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background.card, borderRadius: 12, padding: spacing.md, borderWidth: 1, borderColor: colors.border.default },
  habitCardDone: { borderColor: colors.accent.muted, backgroundColor: colors.accent.muted },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: colors.border.strong, marginRight: spacing.md, alignItems: 'center', justifyContent: 'center' },
  checkDone: { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary },
  checkMark: { color: colors.text.primary, fontSize: 14, fontWeight: typography.weights.bold },
  habitName: { fontSize: typography.sizes.md, color: colors.text.primary },
  habitNameDone: { color: colors.text.tertiary },
});