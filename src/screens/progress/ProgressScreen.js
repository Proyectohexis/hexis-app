import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useState, useEffect } from 'react';
import { colors, typography, spacing } from '../../theme';
import { getProgress, addProgress } from '../../lib/progress';
import { getCurrentUser } from '../../lib/auth';

export default function ProgressScreen() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [weight, setWeight] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    initScreen();
  }, []);

  async function initScreen() {
    const user = await getCurrentUser();
    if (user) {
      setUserId(user.id);
      await loadProgress(user.id);
    }
  }

  async function loadProgress(uid) {
    setLoading(true);
    setError(null);
    const { data, error } = await getProgress(uid);
    if (error) {
      setError('No se pudo cargar el progreso.');
    } else {
      setRecords(data || []);
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!weight || !userId) return;
    setSaving(true);
    await addProgress(userId, parseFloat(weight), notes);
    setWeight('');
    setNotes('');
    await loadProgress(userId);
    setSaving(false);
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.accent.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={() => userId && loadProgress(userId)} style={styles.retryButton}>
          <Text style={styles.retryText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Progreso fisico</Text>
        <Text style={styles.subtitle}>Registra tu evolucion dia a dia.</Text>
      </View>
      <View style={styles.form}>
        <Text style={styles.label}>Peso (kg)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ej. 75.5"
          placeholderTextColor={colors.text.tertiary}
          value={weight}
          onChangeText={setWeight}
          keyboardType="numeric"
        />
        <Text style={styles.label}>Notas</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          placeholder="Como te sientes hoy..."
          placeholderTextColor={colors.text.tertiary}
          value={notes}
          onChangeText={setNotes}
          multiline
        />
        <TouchableOpacity
          style={[styles.button, (!weight || saving) && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={!weight || saving}
        >
          <Text style={styles.buttonText}>{saving ? 'Guardando...' : 'Guardar registro'}</Text>
        </TouchableOpacity>
      </View>
      {records.length > 0 && (
        <View style={styles.history}>
          <Text style={styles.historyTitle}>Historial</Text>
          {records.map((record) => (
            <View key={record.id} style={styles.record}>
              <View style={styles.recordLeft}>
                <Text style={styles.recordWeight}>{record.weight} kg</Text>
                <Text style={styles.recordDate}>{record.date}</Text>
              </View>
              {record.notes && <Text style={styles.recordNotes}>{record.notes}</Text>}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.primary },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing.xxl },
  loadingContainer: { flex: 1, backgroundColor: colors.background.primary, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: typography.sizes.md, color: colors.error, marginBottom: spacing.md, textAlign: 'center' },
  retryButton: { backgroundColor: colors.accent.primary, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: 8 },
  retryText: { color: colors.text.primary, fontSize: typography.sizes.sm, fontWeight: typography.weights.medium },
  header: { marginBottom: spacing.xl },
  title: { fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold, color: colors.text.primary, marginBottom: spacing.xs },
  subtitle: { fontSize: typography.sizes.sm, color: colors.text.secondary },
  form: { marginBottom: spacing.xl },
  label: { fontSize: typography.sizes.sm, color: colors.text.secondary, marginBottom: spacing.xs, marginTop: spacing.md },
  input: { borderWidth: 1, borderColor: colors.border.default, borderRadius: 12, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, fontSize: typography.sizes.md, color: colors.text.primary, backgroundColor: colors.background.card },
  inputMultiline: { height: 80, textAlignVertical: 'top' },
  button: { backgroundColor: colors.accent.primary, paddingVertical: spacing.md, borderRadius: 12, alignItems: 'center', marginTop: spacing.lg },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.text.primary, letterSpacing: 1 },
  history: { marginTop: spacing.md },
  historyTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.text.primary, marginBottom: spacing.md },
  record: { backgroundColor: colors.background.card, borderRadius: 12, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border.default },
  recordLeft: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  recordWeight: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, color: colors.text.primary },
  recordDate: { fontSize: typography.sizes.sm, color: colors.text.tertiary },
  recordNotes: { fontSize: typography.sizes.sm, color: colors.text.secondary },
});