import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, typography } from '../../theme';
import { useAppSession } from '../../context/AppSessionContext';
import {
  createTransformationMetric,
  deleteMetricEntry,
  getActiveMetric,
  getMetricEntries,
  getMetricRepositoryErrorMessage,
  recordMetricEntry,
  updateMetricEntry,
} from '../../data/repositories/metricRepository';
import { createOperationId } from '../../lib/operationId';
import { announceForAccessibility, focusAccessibilityElement } from '../../lib/accessibility';
const { getDateKeyInTimeZone } = require('../../lib/date.cjs');
const { validateMetricEntry } = require('../../domain/metricValues.cjs');

const METRIC_TYPES = [
  { kind: 'weight', label: 'Peso', unit: 'kg', description: 'Una medición física opcional.' },
  { kind: 'circumference', label: 'Perímetro', unit: 'cm', description: 'Una medida corporal elegida por ti.' },
  { kind: 'custom', label: '', unit: '', description: 'Una señal numérica no clínica definida por ti.' },
];

function sortEntries(entries) {
  return [...entries].sort((left, right) => (
    left.local_date === right.local_date
      ? right.recorded_at.localeCompare(left.recorded_at)
      : right.local_date.localeCompare(left.local_date)
  ));
}

export default function TransformationScreen() {
  const { activePlan, user } = useAppSession();
  const today = getDateKeyInTimeZone(new Date(), activePlan.timezone);
  const [metric, setMetric] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [metricDraft, setMetricDraft] = useState({ kind: '', label: '', unit: '' });
  const [metricSaving, setMetricSaving] = useState(false);
  const [metricError, setMetricError] = useState('');
  const [entryDraft, setEntryDraft] = useState({ value: '', localDate: today, note: '' });
  const [editingEntry, setEditingEntry] = useState(null);
  const [entrySaving, setEntrySaving] = useState(false);
  const [entryErrors, setEntryErrors] = useState([]);
  const [deleteError, setDeleteError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const requestIdRef = useRef(0);
  const metricOperationRef = useRef(createOperationId());
  const entryOperationRef = useRef(createOperationId());
  const deleteOperationsRef = useRef({});
  const scrollRef = useRef(null);
  const entryFormYRef = useRef(0);
  const entryValueInputRef = useRef(null);
  const metricUnitInputRef = useRef(null);
  const entryDateInputRef = useRef(null);
  const entryNoteInputRef = useRef(null);
  const historyHeaderRef = useRef(null);
  const screenTitleRef = useRef(null);

  const loadData = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');
    try {
      const metricResult = await getActiveMetric({ userId: user.id, planId: activePlan.id });
      if (metricResult.error) throw metricResult.error;

      let nextEntries = [];
      if (metricResult.data) {
        const entriesResult = await getMetricEntries({ userId: user.id, metricId: metricResult.data.id });
        if (entriesResult.error) throw entriesResult.error;
        nextEntries = entriesResult.data;
      }

      if (requestId !== requestIdRef.current) return;
      setMetric(metricResult.data || null);
      setEntries(nextEntries);
      setEntryDraft((current) => ({ ...current, localDate: getDateKeyInTimeZone(new Date(), activePlan.timezone) }));
    } catch (loadError) {
      if (requestId === requestIdRef.current) setError(getMetricRepositoryErrorMessage(loadError));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [activePlan.id, activePlan.timezone, user.id]);

  useFocusEffect(
    useCallback(() => {
      loadData();
      return () => {
        requestIdRef.current += 1;
      };
    }, [loadData, reloadKey])
  );

  function selectMetricType(option) {
    metricOperationRef.current = createOperationId();
    setMetricError('');
    setMetricDraft({ kind: option.kind, label: option.label, unit: option.unit });
  }

  async function activateMetric() {
    if (metricSaving) return;
    if (!metricDraft.kind || !metricDraft.label.trim() || !metricDraft.unit.trim()) {
      setMetricError('Elige un tipo y completa nombre y unidad.');
      return;
    }
    if (metricDraft.label.trim().length > 80 || metricDraft.unit.trim().length > 20) {
      setMetricError('El nombre admite 80 caracteres y la unidad 20.');
      return;
    }

    setMetricSaving(true);
    setMetricError('');
    try {
      const result = await createTransformationMetric({
        planId: activePlan.id,
        ...metricDraft,
        clientOperationId: metricOperationRef.current,
      });
      if (result.error) throw result.error;
      if (!result.data?.metric) throw new Error('El servidor no devolvió la métrica confirmada.');
      setMetric(result.data.metric);
      setEntries([]);
      announceForAccessibility(`Métrica ${result.data.metric.label} activada. Ya puedes registrar el primer valor.`);
      setTimeout(() => {
        entryValueInputRef.current?.focus();
        focusAccessibilityElement(entryValueInputRef, 20);
      }, 140);
    } catch (mutationError) {
      setMetricError(getMetricRepositoryErrorMessage(mutationError));
    } finally {
      setMetricSaving(false);
    }
  }

  function updateEntryDraft(field, value) {
    if (entryErrors.length) {
      entryOperationRef.current = createOperationId();
      setEntryErrors([]);
    }
    setEntryDraft((current) => ({ ...current, [field]: value }));
  }

  function startEdit(entry) {
    entryOperationRef.current = createOperationId();
    setEditingEntry(entry);
    setEntryErrors([]);
    setEntryDraft({
      value: String(entry.value),
      localDate: entry.local_date,
      note: entry.note || '',
    });
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, entryFormYRef.current - spacing.md), animated: true });
      entryValueInputRef.current?.focus();
      focusAccessibilityElement(entryValueInputRef, 40);
    }, 80);
  }

  function resetEntryForm() {
    entryOperationRef.current = createOperationId();
    setEditingEntry(null);
    setEntryErrors([]);
    setEntryDraft({ value: '', localDate: today, note: '' });
  }

  async function saveEntry() {
    if (entrySaving) return;
    const validation = validateMetricEntry({
      valueText: entryDraft.value,
      localDate: entryDraft.localDate,
      note: entryDraft.note,
      minValue: metric.min_value,
      maxValue: metric.max_value,
      maxDate: today,
    });
    if (!validation.valid) {
      setEntryErrors(validation.errors.map((issue) => issue.message));
      return;
    }

    setEntrySaving(true);
    setEntryErrors([]);
    try {
      const result = editingEntry
        ? await updateMetricEntry({
            entryId: editingEntry.id,
            value: validation.value,
            localDate: entryDraft.localDate,
            note: entryDraft.note,
            clientOperationId: entryOperationRef.current,
          })
        : await recordMetricEntry({
            metricId: metric.id,
            value: validation.value,
            localDate: entryDraft.localDate,
            note: entryDraft.note,
            clientOperationId: entryOperationRef.current,
          });
      if (result.error) throw result.error;
      if (!result.data?.entry) throw new Error('El servidor no devolvió la entrada confirmada.');

      setEntries((current) => sortEntries(
        editingEntry
          ? current.map((entry) => entry.id === editingEntry.id ? result.data.entry : entry)
          : [result.data.entry, ...current],
      ));
      resetEntryForm();
      announceForAccessibility(editingEntry ? 'Registro actualizado.' : 'Registro guardado.');
    } catch (mutationError) {
      setEntryErrors([getMetricRepositoryErrorMessage(mutationError)]);
    } finally {
      setEntrySaving(false);
    }
  }

  async function removeEntry(entry) {
    if (deletingId) return;
    const operationId = deleteOperationsRef.current[entry.id] || createOperationId();
    deleteOperationsRef.current[entry.id] = operationId;
    setDeletingId(entry.id);
    setDeleteError('');
    try {
      const result = await deleteMetricEntry({ entryId: entry.id, clientOperationId: operationId });
      if (result.error) throw result.error;
      if (!result.data?.entry) throw new Error('El servidor no devolvió la eliminación confirmada.');
      delete deleteOperationsRef.current[entry.id];
      const hasRemainingEntries = entries.some((candidate) => candidate.id !== entry.id);
      setEntries((current) => current.filter((candidate) => candidate.id !== entry.id));
      if (editingEntry?.id === entry.id) resetEntryForm();
      announceForAccessibility('Registro eliminado.');
      focusAccessibilityElement(hasRemainingEntries ? historyHeaderRef : screenTitleRef, 140);
    } catch (mutationError) {
      setDeleteError(getMetricRepositoryErrorMessage(mutationError));
    } finally {
      setDeletingId(null);
    }
  }

  function confirmDelete(entry) {
    Alert.alert(
      'Eliminar registro',
      'Este registro dejará de aparecer en tu historial. La operación quedará auditada para sincronización segura.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => removeEntry(entry) },
      ],
    );
  }

  const latestValue = Number(entries[0]?.value);
  const previousValue = Number(entries[1]?.value);
  const delta = Number.isFinite(latestValue) && Number.isFinite(previousValue)
    ? latestValue - previousValue
    : null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.eyebrow}>03 · TRANSFORMACIÓN</Text>
            <Text ref={screenTitleRef} accessible accessibilityRole="header" style={styles.title}>Una señal elegida.</Text>
            <Text style={styles.subtitle}>Describe una tendencia; no diagnostica ni califica tu cuerpo.</Text>
          </View>

          {loading ? (
            <View style={styles.centerState} accessible accessibilityLabel="Cargando transformación">
              <ActivityIndicator color={colors.accent.primary} />
            </View>
          ) : null}

          {!loading && error ? (
            <View style={styles.centerState}>
              <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
              <TouchableOpacity accessibilityRole="button" style={styles.retryButton} onPress={() => setReloadKey((value) => value + 1)}>
                <Text style={styles.retryText}>Reintentar</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {!loading && !error && !metric ? (
            <>
              <View style={styles.noticeCard}>
                <Text style={styles.noticeTitle}>Esta función es opcional.</Text>
                <Text style={styles.noticeCopy}>Guardarás valores personales. Usa solo datos de prueba hasta validar RLS, exportación y eliminación en staging.</Text>
              </View>

              <Text accessibilityRole="header" style={styles.sectionTitle}>Elige una métrica</Text>
              <View accessibilityRole="radiogroup" accessibilityLabel="Tipo de métrica" style={styles.typeList}>
                {METRIC_TYPES.map((option) => {
                  const selected = metricDraft.kind === option.kind;
                  return (
                    <TouchableOpacity key={option.kind} accessibilityRole="radio" accessibilityState={{ checked: selected }} style={[styles.typeCard, selected && styles.typeCardSelected]} onPress={() => selectMetricType(option)}>
                      <Text style={[styles.typeTitle, selected && styles.typeTitleSelected]}>{option.kind === 'custom' ? 'Personalizada' : option.label}</Text>
                      <Text style={styles.typeCopy}>{option.description}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {metricDraft.kind ? (
                <View style={styles.formCard}>
                  <Text accessibilityRole="header" style={styles.sectionTitle}>Configura la métrica</Text>
                  <Text style={styles.label}>Nombre visible</Text>
                  <TextInput accessibilityLabel="Nombre de la métrica" style={styles.input} value={metricDraft.label} onChangeText={(label) => { metricOperationRef.current = createOperationId(); setMetricError(''); setMetricDraft((current) => ({ ...current, label })); }} maxLength={80} placeholder="Ej. Horas de práctica" placeholderTextColor={colors.text.tertiary} returnKeyType="next" onSubmitEditing={() => metricUnitInputRef.current?.focus()} />
                  <Text style={styles.label}>Unidad</Text>
                  <TextInput ref={metricUnitInputRef} accessibilityLabel="Unidad de la métrica" style={styles.input} value={metricDraft.unit} onChangeText={(unit) => { metricOperationRef.current = createOperationId(); setMetricError(''); setMetricDraft((current) => ({ ...current, unit })); }} maxLength={20} placeholder="Ej. horas" placeholderTextColor={colors.text.tertiary} returnKeyType="done" onSubmitEditing={activateMetric} />
                  {metricError ? <Text accessibilityRole="alert" style={styles.error}>{metricError}</Text> : null}
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Activar métrica" accessibilityState={{ disabled: metricSaving, busy: metricSaving }} style={[styles.primaryButton, metricSaving && styles.disabled]} onPress={activateMetric} disabled={metricSaving}>
                    {metricSaving ? <ActivityIndicator color={colors.text.inverse} /> : <Text style={styles.primaryButtonText}>Activar métrica</Text>}
                  </TouchableOpacity>
                </View>
              ) : null}
            </>
          ) : null}

          {!loading && !error && metric ? (
            <>
              {entries.length ? (
                <View style={styles.latestCard}>
                  <Text style={styles.cardLabel}>ÚLTIMO REGISTRO · {metric.label.toUpperCase()}</Text>
                  <View style={styles.latestRow}>
                    <Text style={styles.latestValue}>{entries[0].value} {metric.unit}</Text>
                    {delta !== null ? <Text accessibilityLabel={`Cambio descriptivo ${delta.toFixed(2)} ${metric.unit}`} style={styles.delta}>{delta > 0 ? '+' : ''}{delta.toFixed(2)} {metric.unit}</Text> : null}
                  </View>
                  <Text style={styles.latestDate}>{entries[0].local_date}</Text>
                </View>
              ) : null}

              <View style={styles.noticeCard}>
                <Text style={styles.noticeTitle}>Dato personal opcional</Text>
                <Text style={styles.noticeCopy}>No uses datos reales hasta que exportación, eliminación y aislamiento remoto estén probados.</Text>
              </View>

              <View style={styles.formCard} onLayout={(event) => { entryFormYRef.current = event.nativeEvent.layout.y; }}>
                <Text accessibilityRole="header" style={styles.sectionTitle}>{editingEntry ? 'Editar registro' : `Registrar ${metric.label}`}</Text>
                <Text style={styles.label}>Valor · {metric.unit}</Text>
                <TextInput ref={entryValueInputRef} accessibilityLabel={`Valor en ${metric.unit}`} style={styles.input} value={entryDraft.value} onChangeText={(value) => updateEntryDraft('value', value)} keyboardType="numbers-and-punctuation" maxLength={16} placeholder="0" placeholderTextColor={colors.text.tertiary} returnKeyType="next" onSubmitEditing={() => entryDateInputRef.current?.focus()} />
                <Text style={styles.label}>Fecha civil</Text>
                <TextInput ref={entryDateInputRef} accessibilityLabel="Fecha del registro, formato año mes día" style={styles.input} value={entryDraft.localDate} onChangeText={(value) => updateEntryDraft('localDate', value)} maxLength={10} placeholder="YYYY-MM-DD" placeholderTextColor={colors.text.tertiary} returnKeyType="next" onSubmitEditing={() => entryNoteInputRef.current?.focus()} />
                <Text style={styles.label}>Nota opcional</Text>
                <TextInput ref={entryNoteInputRef} accessibilityLabel="Nota opcional del registro" style={[styles.input, styles.multiline]} value={entryDraft.note} onChangeText={(value) => updateEntryDraft('note', value)} multiline maxLength={500} textAlignVertical="top" placeholder="Contexto útil para la revisión" placeholderTextColor={colors.text.tertiary} />
                {entryErrors.length ? <View style={styles.errorList}>{entryErrors.map((message, index) => <Text key={`${index}-${message}`} accessibilityRole="alert" style={styles.error}>• {message}</Text>)}</View> : null}
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={editingEntry ? 'Guardar cambios del registro' : 'Guardar registro'} accessibilityState={{ disabled: entrySaving, busy: entrySaving }} style={[styles.primaryButton, entrySaving && styles.disabled]} onPress={saveEntry} disabled={entrySaving}>
                  {entrySaving ? <ActivityIndicator color={colors.text.inverse} /> : <Text style={styles.primaryButtonText}>{editingEntry ? 'Guardar cambios' : 'Guardar registro'}</Text>}
                </TouchableOpacity>
                {editingEntry ? <TouchableOpacity accessibilityRole="button" style={styles.cancelButton} onPress={resetEntryForm} disabled={entrySaving}><Text style={styles.cancelText}>Cancelar edición</Text></TouchableOpacity> : null}
              </View>

              {deleteError ? <Text accessibilityRole="alert" style={[styles.error, styles.deleteError]}>{deleteError}</Text> : null}
              {entries.length ? (
                <View style={styles.history}>
                  <Text ref={historyHeaderRef} accessible accessibilityRole="header" style={styles.sectionTitle}>Historial</Text>
                  {entries.map((entry) => (
                    <View key={entry.id} style={styles.entryRow}>
                      <View style={styles.entryCopy}>
                        <Text style={styles.entryValue}>{entry.value} {metric.unit}</Text>
                        <Text style={styles.entryDate}>{entry.local_date}</Text>
                        {entry.note ? <Text style={styles.entryNote}>{entry.note}</Text> : null}
                      </View>
                      <View style={styles.entryActions}>
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Editar registro de ${entry.local_date}, ${entry.value} ${metric.unit}`} style={styles.textAction} onPress={() => startEdit(entry)} disabled={Boolean(deletingId)}><Text style={styles.editText}>Editar</Text></TouchableOpacity>
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Eliminar registro de ${entry.local_date}, ${entry.value} ${metric.unit}`} style={styles.textAction} onPress={() => confirmDelete(entry)} disabled={Boolean(deletingId)}><Text style={styles.deleteText}>Eliminar</Text></TouchableOpacity>
                        {deletingId === entry.id ? <ActivityIndicator size="small" color={colors.accent.primary} /> : null}
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>Aún no hay una línea base.</Text>
                  <Text style={styles.emptyCopy}>Registra solo si esta señal ayuda a tomar decisiones.</Text>
                </View>
              )}
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: colors.background.primary },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  header: { marginBottom: spacing.xl },
  eyebrow: { color: colors.accent.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.xs, letterSpacing: 2, marginBottom: spacing.sm },
  title: { color: colors.text.primary, fontFamily: typography.fonts.bold, fontSize: typography.sizes.xxl, lineHeight: typography.lineHeights.xxl },
  subtitle: { color: colors.text.secondary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm, marginTop: spacing.sm },
  centerState: { minHeight: 260, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.error, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm, marginTop: spacing.sm },
  retryButton: { minHeight: 48, justifyContent: 'center', marginTop: spacing.sm },
  retryText: { color: colors.text.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.sm },
  noticeCard: { borderLeftWidth: 2, borderLeftColor: colors.border.strong, paddingLeft: spacing.md, marginBottom: spacing.lg },
  noticeTitle: { color: colors.text.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.sm },
  noticeCopy: { color: colors.text.secondary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm, marginTop: spacing.xs },
  sectionTitle: { color: colors.text.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.lg },
  typeList: { gap: spacing.sm, marginTop: spacing.md },
  typeCard: { borderWidth: 1, borderColor: colors.border.default, borderRadius: 14, padding: spacing.md },
  typeCardSelected: { borderColor: colors.accent.primary, backgroundColor: colors.accent.muted },
  typeTitle: { color: colors.text.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.md },
  typeTitleSelected: { color: colors.accent.light },
  typeCopy: { color: colors.text.secondary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.sm, marginTop: spacing.xs },
  formCard: { borderWidth: 1, borderColor: colors.border.default, borderRadius: 18, backgroundColor: colors.background.card, padding: spacing.lg, marginTop: spacing.lg },
  label: { color: colors.text.secondary, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.border.default, borderRadius: 12, backgroundColor: colors.background.secondary, color: colors.text.primary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  multiline: { minHeight: 96 },
  primaryButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.accent.primary, marginTop: spacing.lg },
  primaryButtonText: { color: colors.text.inverse, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.md },
  disabled: { opacity: 0.55 },
  latestCard: { borderWidth: 1, borderColor: colors.accent.dark, borderRadius: 18, backgroundColor: colors.accent.muted, padding: spacing.lg, marginBottom: spacing.md },
  cardLabel: { color: colors.accent.light, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.xs, letterSpacing: 1.4 },
  latestRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.sm },
  latestValue: { flexShrink: 1, color: colors.text.primary, fontFamily: typography.fonts.bold, fontSize: typography.sizes.xxl },
  delta: { flexShrink: 1, color: colors.text.secondary, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm, textAlign: 'right' },
  latestDate: { color: colors.text.tertiary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.xs, marginTop: spacing.xs },
  errorList: { marginTop: spacing.sm },
  cancelButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: colors.text.secondary, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm },
  deleteError: { marginVertical: spacing.md },
  history: { marginTop: spacing.xl },
  entryRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border.subtle, paddingVertical: spacing.md },
  entryCopy: { flex: 1, paddingRight: spacing.md },
  entryValue: { color: colors.text.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.lg },
  entryDate: { color: colors.text.tertiary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.xs, marginTop: spacing.xs },
  entryNote: { color: colors.text.secondary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm, marginTop: spacing.xs },
  entryActions: { alignItems: 'flex-end' },
  textAction: { minWidth: 44, minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs },
  editText: { color: colors.accent.light, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm },
  deleteText: { color: colors.error, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm },
  emptyCard: { borderWidth: 1, borderColor: colors.border.default, borderRadius: 16, padding: spacing.lg, marginTop: spacing.xl },
  emptyTitle: { color: colors.text.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.md },
  emptyCopy: { color: colors.text.secondary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm, marginTop: spacing.xs },
});
