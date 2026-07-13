import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { colors, spacing, typography } from '../../theme';
import { getGoalDefinition } from '../../constants/goals';
import { WEEKDAYS, formatScheduledWeekdays } from '../../constants/weekdays';
import { createInitialPlan, getPlanRepositoryErrorMessage } from '../../data/repositories/planRepository';
import { createOperationId } from '../../lib/operationId';
import { signOut } from '../../lib/auth';
import { focusAccessibilityElement } from '../../lib/accessibility';
import { trackProductEvent } from '../../analytics/analytics';
const { getDateKeyInTimeZone, getDeviceTimeZone } = require('../../lib/date.cjs');
const { validateInitialPlan } = require('../../domain/plan.cjs');

const ALL_WEEKDAYS = WEEKDAYS.map((day) => day.value);

function createCommitment(localId) {
  return {
    localId,
    name: '',
    minimum_action: '',
    scheduled_weekdays: [...ALL_WEEKDAYS],
    reminder_time: '',
  };
}

function toValidationInput({ identity, outcome, why, timeZone, startsOn, commitments }) {
  return {
    identity_statement: identity,
    outcome_statement: outcome,
    why_statement: why,
    timezone: timeZone,
    starts_on: startsOn,
    commitments: commitments.map(({ localId: _localId, ...commitment }) => commitment),
  };
}

export default function PlanSetupScreen({ user, onPlanCreated }) {
  const goal = getGoalDefinition(user?.user_metadata?.goal_code || user?.user_metadata?.goal);
  const timeZone = useMemo(() => getDeviceTimeZone(), []);
  const startsOn = useMemo(() => getDateKeyInTimeZone(new Date(), timeZone), [timeZone]);
  const nextLocalId = useRef(1);
  const operationIdRef = useRef(createOperationId());
  const reviewTitleRef = useRef(null);
  const editTitleRef = useRef(null);
  const commitmentsTitleRef = useRef(null);
  const errorCardRef = useRef(null);
  const scrollRef = useRef(null);

  const [identity, setIdentity] = useState(goal.identity);
  const [outcome, setOutcome] = useState('');
  const [why, setWhy] = useState('');
  const [commitments, setCommitments] = useState([createCommitment('commitment-0')]);
  const [phase, setPhase] = useState('edit');
  const [validationErrors, setValidationErrors] = useState([]);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (phase === 'review') focusAccessibilityElement(reviewTitleRef);
  }, [phase]);

  async function exitSetup() {
    if (saving || signingOut) return;
    setSigningOut(true);
    setSaveError('');
    try {
      const result = await signOut();
      if (result.error) setSaveError('No pudimos cerrar la sesión. Inténtalo de nuevo.');
    } catch {
      setSaveError('No pudimos cerrar la sesión. Inténtalo de nuevo.');
    } finally {
      setSigningOut(false);
    }
  }

  function updateCommitment(localId, field, value) {
    setCommitments((current) => current.map((commitment) => (
      commitment.localId === localId ? { ...commitment, [field]: value } : commitment
    )));
  }

  function toggleWeekday(localId, weekday) {
    setCommitments((current) => current.map((commitment) => {
      if (commitment.localId !== localId) return commitment;
      const selected = commitment.scheduled_weekdays.includes(weekday);
      return {
        ...commitment,
        scheduled_weekdays: selected
          ? commitment.scheduled_weekdays.filter((value) => value !== weekday)
          : [...commitment.scheduled_weekdays, weekday],
      };
    }));
  }

  function addCommitment() {
    if (commitments.length >= 3) return;
    const localId = `commitment-${nextLocalId.current++}`;
    setCommitments((current) => [...current, createCommitment(localId)]);
  }

  function removeCommitment(localId) {
    if (commitments.length <= 1) return;
    setCommitments((current) => current.filter((commitment) => commitment.localId !== localId));
    focusAccessibilityElement(commitmentsTitleRef, 140);
  }

  function reviewPlan() {
    const result = validateInitialPlan(toValidationInput({
      identity,
      outcome,
      why,
      timeZone,
      startsOn,
      commitments,
    }));

    if (!result.valid) {
      setValidationErrors(result.errors.map((error) => error.message));
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      focusAccessibilityElement(errorCardRef, 140);
      return;
    }

    operationIdRef.current = createOperationId();
    setValidationErrors([]);
    setSaveError('');
    setPhase('review');
  }

  async function confirmPlan() {
    if (saving) return;
    setSaving(true);
    setSaveError('');

    try {
      const result = await createInitialPlan({
        identityStatement: identity,
        outcomeStatement: outcome,
        whyStatement: why,
        timeZone,
        startsOn,
        habits: commitments,
        clientOperationId: operationIdRef.current,
      });

      if (result.error) throw result.error;
      if (!result.data?.plan) throw new Error('El servidor no devolvió el plan confirmado.');
      void trackProductEvent('plan_created', {
        commitment_count: commitments.length,
        reminder_count: commitments.filter((commitment) => Boolean(commitment.reminder_time)).length,
      });
      onPlanCreated(result.data.plan);
    } catch (error) {
      setSaveError(getPlanRepositoryErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  if (phase === 'review') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.container}>
          <View>
            <Text style={styles.eyebrow}>RESUMEN · COMPROMISO</Text>
            <Text ref={reviewTitleRef} accessible accessibilityRole="header" style={styles.title}>Este es tu protocolo inicial.</Text>
            <Text style={styles.subtitle}>Revísalo antes de guardarlo. Después podrás ajustarlo sin borrar el historial.</Text>
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ disabled: saving || signingOut, busy: signingOut }}
            style={styles.exitButton}
            onPress={exitSetup}
            disabled={saving || signingOut}
          >
            <Text style={styles.exitButtonText}>{signingOut ? 'Cerrando sesión…' : 'Salir y continuar después'}</Text>
          </TouchableOpacity>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>IDENTIDAD</Text>
            <Text style={styles.summaryValue}>{identity.trim()}</Text>
            <Text style={styles.summaryLabel}>META PRIORITARIA</Text>
            <Text style={styles.summaryValue}>{outcome.trim()}</Text>
            <Text style={styles.summaryLabel}>MOTIVO</Text>
            <Text style={styles.summaryCopy}>{why.trim()}</Text>
          </View>

          <View style={styles.summaryList}>
            {commitments.map((commitment, index) => (
              <View key={commitment.localId} style={styles.summaryCommitment}>
                <Text style={styles.summaryIndex}>0{index + 1}</Text>
                <View style={styles.summaryCommitmentCopy}>
                  <Text style={styles.summaryCommitmentName}>{commitment.name.trim()}</Text>
                  <Text style={styles.summaryCopy}>Mínimo: {commitment.minimum_action.trim()}</Text>
                  <Text style={styles.summaryMeta}>{formatScheduledWeekdays(commitment.scheduled_weekdays)}</Text>
                  {commitment.reminder_time ? (
                    <Text style={styles.summaryMeta}>Horario elegido: {commitment.reminder_time}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>

          <View style={styles.developmentNotice}>
            <Text style={styles.noticeTitle}>Entorno de desarrollo</Text>
            <Text style={styles.noticeCopy}>Usa contenido de prueba hasta que las migraciones y el aislamiento RLS pasen en staging.</Text>
          </View>

          {saveError ? <Text accessibilityRole="alert" style={styles.error}>{saveError}</Text> : null}

          <View style={styles.actions}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Confirmar y guardar plan"
              accessibilityState={{ disabled: saving, busy: saving }}
              style={[styles.primaryButton, saving && styles.disabled]}
              onPress={confirmPlan}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color={colors.text.inverse} /> : <Text style={styles.primaryButtonText}>Confirmar plan</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              style={styles.secondaryButton}
              onPress={() => {
                setSaveError('');
                setPhase('edit');
                focusAccessibilityElement(editTitleRef, 140);
              }}
              disabled={saving}
            >
              <Text style={styles.secondaryButtonText}>Editar</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View>
            <Text style={styles.eyebrow}>03 · TU PROTOCOLO</Text>
            <Text ref={editTitleRef} accessible accessibilityRole="header" style={styles.title}>Haz tu identidad ejecutable.</Text>
            <Text style={styles.subtitle}>Define una meta y entre uno y tres compromisos que puedas reconocer en el mundo real.</Text>
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ disabled: signingOut, busy: signingOut }}
            style={styles.exitButton}
            onPress={exitSetup}
            disabled={signingOut}
          >
            <Text style={styles.exitButtonText}>{signingOut ? 'Cerrando sesión…' : 'Salir y continuar después'}</Text>
          </TouchableOpacity>

          {saveError ? <Text accessibilityRole="alert" style={styles.error}>{saveError}</Text> : null}

          {validationErrors.length ? (
            <View ref={errorCardRef} accessible accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.errorCard}>
              {validationErrors.map((message, index) => <Text key={`${index}-${message}`} style={styles.error}>• {message}</Text>)}
            </View>
          ) : null}

          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Dirección</Text>
            <Text style={styles.label}>Identidad elegida</Text>
            <TextInput
              accessibilityLabel="Identidad elegida"
              style={[styles.input, styles.multiline]}
              value={identity}
              onChangeText={setIdentity}
              multiline
              maxLength={160}
              textAlignVertical="top"
            />
            <Text style={styles.label}>Meta prioritaria</Text>
            <TextInput
              accessibilityLabel="Meta prioritaria"
              style={styles.input}
              value={outcome}
              onChangeText={setOutcome}
              placeholder="Ej. Entrenar con constancia durante este ciclo"
              placeholderTextColor={colors.text.tertiary}
              maxLength={160}
            />
            <Text style={styles.label}>¿Por qué importa?</Text>
            <TextInput
              accessibilityLabel="Motivo personal"
              style={[styles.input, styles.multiline]}
              value={why}
              onChangeText={setWhy}
              placeholder="Escribe el motivo que querrás recordar cuando cueste"
              placeholderTextColor={colors.text.tertiary}
              multiline
              maxLength={500}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderCopy}>
              <Text ref={commitmentsTitleRef} accessible accessibilityRole="header" style={styles.sectionTitle}>Compromisos</Text>
              <Text style={styles.sectionHint}>{commitments.length} de 3</Text>
            </View>
            {commitments.length < 3 ? (
              <TouchableOpacity accessibilityRole="button" style={styles.addButton} onPress={addCommitment}>
                <Text style={styles.addButtonText}>Añadir</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {commitments.map((commitment, index) => (
            <View key={commitment.localId} style={styles.commitmentCard}>
              <View style={styles.commitmentHeader}>
                <Text style={styles.commitmentNumber}>COMPROMISO 0{index + 1}</Text>
                {commitments.length > 1 ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`Eliminar compromiso ${index + 1}`}
                    style={styles.removeButton}
                    onPress={() => removeCommitment(commitment.localId)}
                  >
                    <Text style={styles.removeButtonText}>Eliminar</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <Text style={styles.label}>Acción observable</Text>
              <TextInput
                accessibilityLabel={`Acción del compromiso ${index + 1}`}
                style={styles.input}
                value={commitment.name}
                onChangeText={(value) => updateCommitment(commitment.localId, 'name', value)}
                placeholder="Ej. Entrenar fuerza"
                placeholderTextColor={colors.text.tertiary}
                maxLength={80}
              />

              <Text style={styles.label}>Versión mínima</Text>
              <TextInput
                accessibilityLabel={`Acción mínima del compromiso ${index + 1}`}
                style={styles.input}
                value={commitment.minimum_action}
                onChangeText={(value) => updateCommitment(commitment.localId, 'minimum_action', value)}
                placeholder="Ej. Hacer el calentamiento y una serie"
                placeholderTextColor={colors.text.tertiary}
                maxLength={120}
              />

              <Text style={styles.label}>Días programados</Text>
              <View style={styles.weekdays}>
                {WEEKDAYS.map((day) => {
                  const selected = commitment.scheduled_weekdays.includes(day.value);
                  return (
                    <TouchableOpacity
                      key={day.value}
                      accessibilityRole="checkbox"
                      accessibilityLabel={`${day.label}, compromiso ${index + 1}`}
                      accessibilityState={{ checked: selected }}
                      style={[styles.weekday, selected && styles.weekdaySelected]}
                      onPress={() => toggleWeekday(commitment.localId, day.value)}
                    >
                      <Text style={[styles.weekdayText, selected && styles.weekdayTextSelected]}>{day.short}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.label}>Horario deseado · opcional</Text>
              <TextInput
                accessibilityLabel={`Horario opcional del compromiso ${index + 1}, formato veinticuatro horas`}
                style={styles.input}
                value={commitment.reminder_time}
                onChangeText={(value) => updateCommitment(commitment.localId, 'reminder_time', value)}
                placeholder="HH:MM"
                placeholderTextColor={colors.text.tertiary}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
              <Text style={styles.fieldHint}>El horario se guarda sin pedir permisos. Podrás activar el recordatorio desde Disciplina.</Text>
            </View>
          ))}

          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>INICIO</Text>
            <Text style={styles.metaValue}>{startsOn}</Text>
            <Text style={styles.metaLabel}>ZONA DEL DISPOSITIVO</Text>
            <Text style={styles.metaValue}>{timeZone}</Text>
          </View>

          <TouchableOpacity accessibilityRole="button" style={styles.primaryButton} onPress={reviewPlan}>
            <Text style={styles.primaryButtonText}>Revisar protocolo</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: colors.background.primary },
  container: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  eyebrow: {
    color: colors.accent.primary,
    fontFamily: typography.fonts.semibold,
    fontSize: typography.sizes.xs,
    letterSpacing: 2,
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.text.primary,
    fontFamily: typography.fonts.bold,
    fontSize: typography.sizes.xxl,
    lineHeight: typography.lineHeights.xxl,
  },
  subtitle: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.regular,
    fontSize: typography.sizes.md,
    lineHeight: typography.lineHeights.md,
    marginTop: spacing.sm,
  },
  errorCard: { marginTop: spacing.lg },
  error: {
    color: colors.error,
    fontFamily: typography.fonts.medium,
    fontSize: typography.sizes.sm,
    lineHeight: typography.lineHeights.sm,
  },
  section: { marginTop: spacing.xl },
  sectionHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionHeaderCopy: { flexDirection: 'row', flexWrap: 'wrap', flexShrink: 1, alignItems: 'baseline', gap: spacing.sm },
  sectionTitle: {
    color: colors.text.primary,
    fontFamily: typography.fonts.semibold,
    fontSize: typography.sizes.lg,
    flexShrink: 1,
  },
  sectionHint: { color: colors.text.tertiary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.sm },
  label: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.medium,
    fontSize: typography.sizes.sm,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 12,
    backgroundColor: colors.background.card,
    color: colors.text.primary,
    fontFamily: typography.fonts.regular,
    fontSize: typography.sizes.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  multiline: { minHeight: 92 },
  addButton: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border.strong,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
  },
  addButtonText: { color: colors.text.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.sm },
  commitmentCard: {
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 18,
    backgroundColor: colors.background.secondary,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  commitmentHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  commitmentNumber: {
    color: colors.accent.primary,
    fontFamily: typography.fonts.semibold,
    fontSize: typography.sizes.xs,
    letterSpacing: 1.5,
    flexShrink: 1,
  },
  removeButton: { minWidth: 44, minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs },
  removeButtonText: { color: colors.error, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm },
  weekdays: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  weekday: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 22,
    backgroundColor: colors.background.card,
  },
  weekdaySelected: { borderColor: colors.accent.primary, backgroundColor: colors.accent.muted },
  weekdayText: { color: colors.text.secondary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.sm },
  weekdayTextSelected: { color: colors.accent.light },
  fieldHint: {
    color: colors.text.tertiary,
    fontFamily: typography.fonts.regular,
    fontSize: typography.sizes.xs,
    lineHeight: typography.lineHeights.xs,
    marginTop: spacing.xs,
  },
  metaCard: {
    borderLeftWidth: 2,
    borderLeftColor: colors.border.strong,
    paddingLeft: spacing.md,
    marginVertical: spacing.lg,
  },
  metaLabel: {
    color: colors.text.tertiary,
    fontFamily: typography.fonts.semibold,
    fontSize: typography.sizes.xs,
    letterSpacing: 1.2,
    marginTop: spacing.sm,
  },
  metaValue: { color: colors.text.secondary, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm, marginTop: spacing.xs },
  primaryButton: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.accent.primary,
  },
  primaryButtonText: { color: colors.text.inverse, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.md },
  secondaryButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: colors.text.secondary, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm },
  disabled: { opacity: 0.55 },
  exitButton: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', marginTop: spacing.sm },
  exitButtonText: { color: colors.text.secondary, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm },
  summaryCard: {
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 18,
    backgroundColor: colors.background.card,
    padding: spacing.lg,
    marginTop: spacing.xl,
  },
  summaryLabel: {
    color: colors.accent.primary,
    fontFamily: typography.fonts.semibold,
    fontSize: typography.sizes.xs,
    letterSpacing: 1.4,
    marginTop: spacing.md,
  },
  summaryValue: {
    color: colors.text.primary,
    fontFamily: typography.fonts.semibold,
    fontSize: typography.sizes.lg,
    lineHeight: typography.lineHeights.lg,
    marginTop: spacing.xs,
  },
  summaryCopy: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.regular,
    fontSize: typography.sizes.sm,
    lineHeight: typography.lineHeights.sm,
    marginTop: spacing.xs,
  },
  summaryList: { marginTop: spacing.md },
  summaryCommitment: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    paddingVertical: spacing.md,
  },
  summaryIndex: { color: colors.accent.primary, fontFamily: typography.fonts.bold, fontSize: typography.sizes.lg, marginRight: spacing.md },
  summaryCommitmentCopy: { flex: 1 },
  summaryCommitmentName: { color: colors.text.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.md },
  summaryMeta: { color: colors.text.tertiary, fontFamily: typography.fonts.medium, fontSize: typography.sizes.xs, marginTop: spacing.xs },
  developmentNotice: {
    borderRadius: 14,
    backgroundColor: colors.background.secondary,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  noticeTitle: { color: colors.text.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.sm },
  noticeCopy: { color: colors.text.secondary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm, marginTop: spacing.xs },
  actions: { marginTop: spacing.lg },
});
