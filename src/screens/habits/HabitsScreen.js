import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Modal } from 'react-native';
import { useState, useEffect } from 'react';
import { colors, typography, spacing } from '../../theme';
import { getHabits, toggleHabit, createHabit } from '../../lib/habits';
import { updateStreak } from '../../lib/streaks';
import { getCurrentUser } from '../../lib/auth';

export default function HabitsScreen() {
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [streak, setStreak] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [newHabit, setNewHabit] = useState('');
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState(null);

  useEffect(() => { initScreen(); }, []);

  async function initScreen() {
    const user = await getCurrentUser();
    if (user) { setUserId(user.id); await loadHabits(user.id); }
  }

  async function loadHabits(uid) {
    setLoading(true); setError(null);
    const { data, error } = await getHabits(uid);
    if (error) { setError('No se pudieron cargar los habitos.'); setLoading(false); return; }
    if (data && data.length === 0) {
      await createHabit(uid, 'Entrenamiento');
      await createHabit(uid, 'Lectura');
      await createHabit(uid, 'Meditacion');
      const { data: newData } = await getHabits(uid);
      setHabits(newData || []);
    } else { setHabits(data || []); }
    setLoading(false);
  }

  async function handleToggle(habit) {
    const updatedHabits = habits.map(h => h.id === habit.id ? { ...h, completed: !h.completed } : h);
    await toggleHabit(habit.id, !habit.completed);
    setHabits(updatedHabits);
    const allDone = updatedHabits.every(h => h.completed);
    if (allDone && userId) { const newStreak = await updateStreak(userId); setStreak(newStreak); }
  }

  async function handleAddHabit() {
    if (!newHabit.trim() || !userId) return;
    setSaving(true);
    await createHabit(userId, newHabit.trim());
    setNewHabit(''); setModalVisible(false);
    await loadHabits(userId);
    setSaving(false);
  }

  const completed = habits.filter(h => h.completed).length;

  if (loading) return <View style={styles.loadingContainer}><ActivityIndicator color={colors.accent.primary} /></View>;
  if (error) return (
    <View style={styles.loadingContainer}>
      <Text style={styles.errorText}>{error}</Text>
      <TouchableOpacity onPress={() => userId && loadHabits(userId)} style={styles.retryButton}>
        <Text style={styles.retryText}>Reintentar</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.wrapper}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Habitos</Text>
          <Text style={styles.subtitle}>{completed} de {habits.length} completados</Text>
        </View>
        {streak > 0 && <View style={styles.streakBanner}><Text style={styles.streakBannerText}>Racha activa: {streak} dia{streak > 1 ? 's' : ''}</Text></View>}
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: habits.length > 0 ? (completed / habits.length * 100) + '%' : '0%' }]} />
        </View>
        <View style={styles.list}>
          {habits.map((habit) => (
            <TouchableOpacity key={habit.id} style={[styles.habitCard, habit.completed && styles.habitCardDone]} onPress={() => handleToggle(habit)}>
              <View style={[styles.check, habit.completed && styles.checkDone]}>
                {habit.completed && <Text style={styles.checkMark}>✓</Text>}
              </View>
              <Text style={[styles.habitName, habit.completed && styles.habitNameDone]}>{habit.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
      <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
        <Text style={styles.addButtonText}>+ Nuevo habito</Text>
      </TouchableOpacity>
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Nuevo habito</Text>
            <TextInput style={styles.modalInput} placeholder="Nombre del habito" placeholderTextColor={colors.text.tertiary} value={newHabit} onChangeText={setNewHabit} autoFocus />
            <TouchableOpacity style={[styles.modalButton, (!newHabit.trim() || saving) && styles.buttonDisabled]} onPress={handleAddHabit} disabled={!newHabit.trim() || saving}>
              <Text style={styles.modalButtonText}>{saving ? 'Guardando...' : 'Agregar'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setModalVisible(false)}>
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: colors.background.primary },
  container: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.xxl },
  loadingContainer: { flex: 1, backgroundColor: colors.background.primary, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: typography.sizes.md, color: colors.error, marginBottom: spacing.md, textAlign: 'center' },
  retryButton: { backgroundColor: colors.accent.primary, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: 8 },
  retryText: { color: colors.text.primary, fontSize: typography.sizes.sm, fontWeight: typography.weights.medium },
  header: { marginBottom: spacing.md },
  title: { fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold, color: colors.text.primary, marginBottom: spacing.xs },
  subtitle: { fontSize: typography.sizes.sm, color: colors.text.secondary },
  streakBanner: { backgroundColor: colors.accent.muted, borderRadius: 12, padding: spacing.md, alignItems: 'center', marginBottom: spacing.md, borderWidth: 1, borderColor: colors.accent.primary },
  streakBannerText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.accent.light },
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
  addButton: { margin: spacing.lg, backgroundColor: colors.accent.primary, paddingVertical: spacing.md, borderRadius: 12, alignItems: 'center' },
  addButtonText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.text.primary, letterSpacing: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: colors.background.secondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.xl },
  modalTitle: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.text.primary, marginBottom: spacing.lg },
  modalInput: { borderWidth: 1, borderColor: colors.border.default, borderRadius: 12, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, fontSize: typography.sizes.md, color: colors.text.primary, backgroundColor: colors.background.card, marginBottom: spacing.md },
  modalButton: { backgroundColor: colors.accent.primary, paddingVertical: spacing.md, borderRadius: 12, alignItems: 'center', marginBottom: spacing.sm },
  modalButtonText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.text.primary },
  buttonDisabled: { opacity: 0.4 },
  cancelButton: { paddingVertical: spacing.md, alignItems: 'center' },
  cancelButtonText: { fontSize: typography.sizes.md, color: colors.text.secondary },
});
