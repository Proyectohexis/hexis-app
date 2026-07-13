import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
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
import NetInfo from '@react-native-community/netinfo';
import { colors, spacing, typography } from '../../theme';
import { useAppSession } from '../../context/AppSessionContext';
import { getCompletionEvents, getPlanHabits, getScheduleExceptions } from '../../data/repositories/practiceRepository';
import {
  completeWeeklyReview,
  getReviewRepositoryErrorMessage,
  getWeeklyReview,
} from '../../data/repositories/reviewRepository';
import { createOperationId } from '../../lib/operationId';
import { focusAccessibilityElement } from '../../lib/accessibility';
import { asyncStorageCheckInQueue } from '../../data/sync/asyncStorageCheckInQueue';
import { flushPendingCheckIns } from '../../data/sync/flushCheckInQueue';
import { trackProductEvent } from '../../analytics/analytics';
const { getDateKeyInTimeZone } = require('../../lib/date.cjs');
const { addDays, parseDateKey } = require('../../domain/dateKeys.cjs');
const {
  calculateConsistency,
  evaluateSecWeek,
  evaluateWeeklyReviewEligibility,
  getPreviousClosedIsoWeek,
} = require('../../domain/metrics.cjs');
const { aggregateLineageBreakdown } = require('./reviewBreakdown.cjs');

const DECISIONS = [
  { value: 'keep', label: 'Mantener', description: 'El protocolo sigue siendo adecuado.' },
  { value: 'reduce', label: 'Reducir', description: 'La versión actual necesita menos carga.' },
  { value: 'increase', label: 'Aumentar', description: 'Existe capacidad real para subir el estándar.' },
  { value: 'replace', label: 'Sustituir', description: 'Una acción distinta serviría mejor a la identidad.' },
];

function toDomainPlan(plan, habits, exceptions) {
  return {
    ...plan,
    commitments: habits.map((habit) => ({
      ...habit,
      excluded_dates: exceptions
        .filter((exception) => exception.habit_id === habit.id)
        .map((exception) => exception.local_date),
      pause_intervals: habit.pause_intervals || [],
    })),
  };
}

function formatRecoveryStatus(status) {
  if (status === 'reentry_due') return 'reentrada pendiente';
  if (status === 'recovered') return 'reentrada registrada';
  return 'trayectoria estable';
}

function percentage(value) {
  return value == null ? '—' : `${Math.round(value * 100)}%`;
}

function formatCivilDate(dateKey, includeWeekday = false) {
  const { timestamp } = parseDateKey(dateKey);
  return new Intl.DateTimeFormat('es-PA', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
    weekday: includeWeekday ? 'long' : undefined,
    year: 'numeric',
  }).format(new Date(timestamp));
}

function getEligibilityExplanation(eligibility, plan) {
  if (eligibility.eligibility_reason === 'week_before_plan') {
    return `La semana cerrada terminó antes de que tu plan comenzara el ${formatCivilDate(plan.starts_on)}.`;
  }
  if (eligibility.eligibility_reason === 'week_after_plan') {
    return 'La semana cerrada comenzó después de que terminara este plan.';
  }
  return 'La revisión solo se habilita después de que la semana termine en la zona horaria de tu plan.';
}

function consistencyBand(summary) {
  if (!summary?.scheduled_opportunities) return 'insufficient';
  if (summary.consistency_rate < 0.4) return 'low';
  if (summary.consistency_rate < 0.75) return 'medium';
  return 'high';
}

export default function WeeklyReviewScreen({ navigation }) {
  const { activePlan, user } = useAppSession();
  const timeZone = activePlan.timezone;
  const [today, setToday] = useState(() => getDateKeyInTimeZone(new Date(), timeZone));
  const reviewPeriod = useMemo(() => getPreviousClosedIsoWeek(today), [today]);
  const weekStart = reviewPeriod.week_start;
  const weekEnd = reviewPeriod.week_end;
  const reviewEligibility = useMemo(() => evaluateWeeklyReviewEligibility({
    as_of_date: today,
    plan: activePlan,
    week_start: weekStart,
  }), [activePlan, today, weekStart]);
  const historyStart = useMemo(() => addDays(weekEnd, -29), [weekEnd]);
  const reviewScopeKey = `${user.id}:${activePlan.id}:${weekStart}`;
  const operationIdRef = useRef(createOperationId());
  const reviewScopeRef = useRef(reviewScopeKey);
  const requestIdRef = useRef(0);
  const onlineRef = useRef(null);
  const confirmedTitleRef = useRef(null);
  const [summary, setSummary] = useState(null);
  const [trajectory, setTrajectory] = useState(null);
  const [review, setReview] = useState(null);
  const [events, setEvents] = useState([]);
  const [domainPlan, setDomainPlan] = useState(null);
  const [reflection, setReflection] = useState('');
  const [decision, setDecision] = useState('keep');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [failedSyncCount, setFailedSyncCount] = useState(0);

  useLayoutEffect(() => {
    reviewScopeRef.current = reviewScopeKey;
    requestIdRef.current += 1;
    operationIdRef.current = createOperationId();
    setSummary(null);
    setTrajectory(null);
    setReview(null);
    setEvents([]);
    setDomainPlan(null);
    setReflection('');
    setDecision('keep');
    setError('');
    setSaveError('');
    setUnsyncedCount(0);
    setFailedSyncCount(0);
    setSaving(false);
    setLoading(true);
  }, [reviewScopeKey]);

  useLayoutEffect(() => {
    const currentDate = getDateKeyInTimeZone(new Date(), timeZone);
    if (currentDate !== today) setToday(currentDate);
  }, [timeZone, today]);

  const loadReview = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');

    if (!reviewEligibility.eligible) {
      setSummary(null);
      setTrajectory(null);
      setReview(null);
      setEvents([]);
      setDomainPlan(null);
      setReflection('');
      setDecision('keep');
      setSaveError('');
      setUnsyncedCount(0);
      setFailedSyncCount(0);
      setLoading(false);
      return;
    }

    try {
      await flushPendingCheckIns({ userId: user.id }).catch(() => null);
      const queueResult = await asyncStorageCheckInQueue.list({ userId: user.id });
      const relevantQueue = queueResult.items.filter((item) => (
        item.user_id === user.id
        && item.local_date >= weekStart
        && item.local_date <= weekEnd
      ));

      const habitsResult = await getPlanHabits({
        userId: user.id,
        planId: activePlan.id,
        includeArchived: true,
      });
      if (habitsResult.error) throw habitsResult.error;

      const completionResult = await getCompletionEvents({
        userId: user.id,
        habitIds: habitsResult.data.map((habit) => habit.id),
        from: historyStart,
        through: weekEnd,
      });
      if (completionResult.error) throw completionResult.error;

      const exceptionsResult = await getScheduleExceptions({
        userId: user.id,
        habitIds: habitsResult.data.map((habit) => habit.id),
        from: historyStart,
        through: weekEnd,
      });
      if (exceptionsResult.error) throw exceptionsResult.error;

      const reviewResult = await getWeeklyReview({
        userId: user.id,
        planId: activePlan.id,
        weekStart,
      });
      if (reviewResult.error) throw reviewResult.error;

      const nextDomainPlan = toDomainPlan(activePlan, habitsResult.data, exceptionsResult.data);
      const nextSummary = calculateConsistency({
        plan: nextDomainPlan,
        events: completionResult.data,
        from: weekStart,
        through: weekEnd,
      });
      const nextTrajectory = {
        seven: calculateConsistency({
          plan: nextDomainPlan,
          events: completionResult.data,
          from: addDays(weekEnd, -6),
          through: weekEnd,
        }),
        thirty: calculateConsistency({
          plan: nextDomainPlan,
          events: completionResult.data,
          from: historyStart,
          through: weekEnd,
        }),
      };

      if (requestId !== requestIdRef.current) return;
      setDomainPlan(nextDomainPlan);
      setEvents(completionResult.data);
      setSummary(nextSummary);
      setTrajectory(nextTrajectory);
      setReview(reviewResult.data || null);
      setUnsyncedCount(relevantQueue.length);
      setFailedSyncCount(relevantQueue.filter((item) => item.status === 'failed').length);
      if (reviewResult.data) {
        setReflection(reviewResult.data.reflection || '');
        setDecision(reviewResult.data.decision);
      }
    } catch (loadError) {
      if (requestId === requestIdRef.current) {
        setError(getReviewRepositoryErrorMessage(loadError));
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [activePlan, historyStart, reviewEligibility.eligible, user.id, weekEnd, weekStart]);

  useFocusEffect(
    useCallback(() => {
      const currentDate = getDateKeyInTimeZone(new Date(), timeZone);
      if (currentDate === today) {
        loadReview();
      } else {
        setToday(currentDate);
      }
      return () => {
        requestIdRef.current += 1;
      };
    }, [loadReview, reloadKey, timeZone, today])
  );

  useEffect(() => {
    const refreshCivilDate = () => {
      const currentDate = getDateKeyInTimeZone(new Date(), timeZone);
      if (currentDate !== today) setToday(currentDate);
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshCivilDate();
    });
    const timer = setInterval(refreshCivilDate, 60_000);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [timeZone, today]);

  useEffect(() => NetInfo.addEventListener((state) => {
    const online = state.isConnected === true && state.isInternetReachable !== false;
    if (online && onlineRef.current === false) {
      setReloadKey((value) => value + 1);
    }
    onlineRef.current = online;
  }), []);

  useEffect(() => {
    if (review?.id) focusAccessibilityElement(confirmedTitleRef);
  }, [review?.id]);

  async function saveReview() {
    if (saving || review) return;
    const currentDate = getDateKeyInTimeZone(new Date(), timeZone);
    const currentPeriod = getPreviousClosedIsoWeek(currentDate);
    const currentEligibility = evaluateWeeklyReviewEligibility({
      as_of_date: currentDate,
      plan: activePlan,
      week_start: currentPeriod.week_start,
    });
    if (currentPeriod.week_start !== weekStart) {
      setSaveError('La semana cambió. Actualizamos la Revisión antes de guardar.');
      setToday(currentDate);
      return;
    }
    if (!currentEligibility.eligible || !reviewEligibility.eligible) {
      setSaveError('Esta semana no coincide con la vigencia del plan y no puede cerrarse.');
      return;
    }
    if (unsyncedCount > 0) {
      setSaveError('Sincroniza o resuelve la evidencia pendiente de esta semana antes de cerrarla.');
      return;
    }
    if (reflection.trim().length < 3) {
      setSaveError('Escribe una reflexión breve de al menos tres caracteres.');
      return;
    }
    if (reflection.trim().length > 500) {
      setSaveError('La reflexión no puede superar 500 caracteres.');
      return;
    }

    setSaving(true);
    setSaveError('');
    const savingScopeKey = reviewScopeKey;
    try {
      const result = await completeWeeklyReview({
        planId: activePlan.id,
        weekStart,
        reflection,
        decision,
        clientOperationId: operationIdRef.current,
      });
      if (result.error) throw result.error;
      if (!result.data?.review) throw new Error('El servidor no devolvió la revisión confirmada.');
      if (reviewScopeRef.current !== savingScopeKey) return;
      setReview(result.data.review);
      void trackProductEvent('weekly_review_completed', {
        decision,
        consistency_band: consistencyBand(summary),
      });
    } catch (reviewError) {
      if (reviewScopeRef.current !== savingScopeKey) return;
      setSaveError(getReviewRepositoryErrorMessage(reviewError));
    } finally {
      if (reviewScopeRef.current === savingScopeKey) setSaving(false);
    }
  }

  const sec = domainPlan && summary
    ? evaluateSecWeek({
        user_id: user.id,
        plan: domainPlan,
        events,
        weekly_reviews: review ? [review] : [],
        week_start: weekStart,
        as_of_date: today,
      })
    : null;
  const lineageBreakdown = domainPlan && summary
    ? aggregateLineageBreakdown(summary.commitments, domainPlan.commitments)
    : [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.eyebrow}>REVISIÓN SEMANAL</Text>
            <Text accessibilityRole="header" style={styles.title}>Decide con evidencia.</Text>
            <Text style={styles.subtitle}>
              Semana del {formatCivilDate(weekStart)} al {formatCivilDate(weekEnd)}
            </Text>
            <Text style={styles.periodMeta}>Zona horaria del plan: {activePlan.timezone}</Text>
            <View
              accessible
              accessibilityLabel={reviewEligibility.eligible ? 'Semana cerrada disponible para revisar' : 'Semana cerrada todavía no elegible'}
              style={[styles.periodStatus, reviewEligibility.eligible && styles.periodStatusEligible]}
            >
              <Text style={[styles.periodStatusText, reviewEligibility.eligible && styles.periodStatusTextEligible]}>
                {review ? 'Revisión completada' : reviewEligibility.eligible ? 'Semana cerrada · Lista para revisar' : 'Semana cerrada · Aún no elegible'}
              </Text>
            </View>
          </View>

          {loading ? (
            <View style={styles.centerState} accessible accessibilityLabel="Cargando revisión semanal">
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

          {!loading && !error && !reviewEligibility.eligible ? (
            <View style={styles.eligibilityCard}>
              <Text style={styles.cardLabel}>PRIMER CIERRE</Text>
              <Text accessibilityRole="header" style={styles.eligibilityTitle}>Tu primera revisión todavía no está disponible.</Text>
              <Text style={styles.eligibilityCopy}>{getEligibilityExplanation(reviewEligibility, activePlan)}</Text>
              <Text style={styles.eligibilityDate}>
                Podrás revisar tu primera semana el {formatCivilDate(reviewEligibility.first_review_available_on, true)}.
              </Text>
              <Text style={styles.eligibilityCopy}>Mientras tanto, registra tus acciones con normalidad. No necesitas cerrar una semana anterior al inicio del plan.</Text>
            </View>
          ) : null}

          {!loading && !error && reviewEligibility.eligible && summary ? (
            <>
              {unsyncedCount ? (
                <View style={styles.syncCard} accessibilityRole="alert">
                  <Text style={styles.syncTitle}>Semana aún no conciliada</Text>
                  <Text style={styles.syncCopy}>
                    Hay {unsyncedCount} {unsyncedCount === 1 ? 'operación local' : 'operaciones locales'} sin confirmar
                    {failedSyncCount ? `; ${failedSyncCount} requieren intervención` : ''}. La revisión no se cerrará con un resumen incompleto.
                  </Text>
                </View>
              ) : null}

              <View style={styles.summaryGrid}>
                <View style={styles.metricCard}>
                  <Text style={styles.metricValue}>{summary.completed_opportunities}/{summary.scheduled_opportunities}</Text>
                  <Text style={styles.metricLabel}>acciones registradas</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricValue}>{percentage(summary.consistency_rate)}</Text>
                  <Text style={styles.metricLabel}>consistencia programada</Text>
                </View>
              </View>

              <View style={styles.evidenceCard}>
                <Text style={styles.cardLabel}>FECHAS CON EVIDENCIA</Text>
                <Text style={styles.evidenceValue}>{summary.evidence_dates.length}</Text>
                <Text style={styles.evidenceCopy}>
                  {summary.scheduled_opportunities === 0
                    ? 'No hubo acciones programadas en esta semana.'
                    : summary.evidence_dates.length === 0
                      ? 'No hay suficiente evidencia registrada; la revisión sigue siendo válida.'
                      : summary.evidence_dates.join(' · ')}
                </Text>
              </View>

              {trajectory ? (
                <View style={styles.trajectoryCard}>
                  <Text style={styles.cardLabel}>CONSISTENCIA DE TRAYECTORIA</Text>
                  <View style={styles.trajectoryRow}>
                    <View style={styles.trajectoryMetric}>
                      <Text style={styles.trajectoryValue}>{percentage(trajectory.seven.consistency_rate)}</Text>
                      <Text style={styles.metricLabel}>últimos 7 días al cierre</Text>
                    </View>
                    <View style={styles.trajectoryMetric}>
                      <Text style={styles.trajectoryValue}>{percentage(trajectory.thirty.consistency_rate)}</Text>
                      <Text style={styles.metricLabel}>últimos 30 días al cierre</Text>
                    </View>
                  </View>
                  <Text style={styles.evidenceCopy}>Solo cuentan oportunidades programadas; descansos planificados quedan fuera del denominador.</Text>
                </View>
              ) : null}

              <View style={styles.commitmentBreakdown}>
                <Text accessibilityRole="header" style={styles.sectionTitle}>Por compromiso</Text>
                {lineageBreakdown.length ? lineageBreakdown.map((item) => (
                    <View key={item.lineage_id} style={styles.breakdownRow}>
                      <View style={styles.breakdownCopy}>
                        <Text style={styles.breakdownName}>{item.habit.name || 'Compromiso'}</Text>
                        <Text style={styles.breakdownMeta}>
                          {item.completed_opportunities} de {item.scheduled_opportunities} · {formatRecoveryStatus(item.recovery_status)}
                        </Text>
                      </View>
                      <Text style={styles.breakdownRate}>{percentage(item.consistency_rate)}</Text>
                    </View>
                  )) : (
                    <Text style={styles.evidenceCopy}>No hubo compromisos programados en esta semana.</Text>
                  )}
              </View>

              <View style={styles.formCard}>
                <Text accessibilityRole="header" style={styles.sectionTitle}>{review ? 'Decisión registrada' : 'Tu lectura de la semana'}</Text>
                <Text style={styles.label}>Reflexión breve</Text>
                <TextInput
                  accessibilityLabel="Reflexión semanal privada"
                  style={[styles.input, styles.multiline]}
                  value={reflection}
                  onChangeText={(value) => {
                    operationIdRef.current = createOperationId();
                    setSaveError('');
                    setReflection(value);
                  }}
                  placeholder="¿Qué facilitó o interrumpió tu práctica?"
                  placeholderTextColor={colors.text.tertiary}
                  multiline
                  maxLength={500}
                  editable={!review}
                  textAlignVertical="top"
                />

                <Text style={styles.label}>Decisión</Text>
                <View accessibilityRole="radiogroup" accessibilityLabel="Decisión semanal" style={styles.decisionList}>
                  {DECISIONS.map((option) => {
                    const selected = decision === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected, disabled: Boolean(review) }}
                        style={[styles.decision, selected && styles.decisionSelected]}
                        onPress={() => {
                          if (!review && decision !== option.value) {
                            operationIdRef.current = createOperationId();
                            setSaveError('');
                            setDecision(option.value);
                          }
                        }}
                        disabled={Boolean(review)}
                      >
                        <Text style={[styles.decisionLabel, selected && styles.decisionLabelSelected]}>{option.label}</Text>
                        <Text style={styles.decisionCopy}>{option.description}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {saveError ? <Text accessibilityRole="alert" style={styles.error}>{saveError}</Text> : null}
                {review ? (
                  <>
                    <View style={styles.confirmedCard}>
                      <Text ref={confirmedTitleRef} accessible accessibilityRole="header" style={styles.confirmedTitle}>Revisión confirmada</Text>
                      <Text style={styles.confirmedCopy}>
                        {sec?.closed
                          ? `Semana cerrada con ${sec.evidence_date_count} fechas de evidencia.`
                          : `Semana revisada. Se requerían ${sec?.required_evidence_dates ?? 0} fechas y hay ${sec?.evidence_date_count ?? 0}.`}
                      </Text>
                    </View>
                    <TouchableOpacity
                      accessibilityRole="button"
                      style={styles.adjustButton}
                      onPress={() => navigation.navigate('Habits')}
                    >
                      <Text style={styles.adjustButtonText}>
                        {review.decision === 'keep' ? 'Ver protocolo' : 'Aplicar ajuste en Disciplina'}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Guardar revisión semanal"
                    accessibilityState={{ disabled: saving || unsyncedCount > 0, busy: saving }}
                    style={[styles.primaryButton, (saving || unsyncedCount > 0) && styles.disabled]}
                    onPress={saveReview}
                    disabled={saving || unsyncedCount > 0}
                  >
                    {saving ? <ActivityIndicator color={colors.text.inverse} /> : <Text style={styles.primaryButtonText}>Guardar revisión</Text>}
                  </TouchableOpacity>
                )}
              </View>
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
  subtitle: { color: colors.text.secondary, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm, marginTop: spacing.sm },
  periodMeta: { color: colors.text.tertiary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.xs, marginTop: spacing.xs },
  periodStatus: { alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.border.default, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, marginTop: spacing.md },
  periodStatusEligible: { borderColor: colors.accent.primary, backgroundColor: colors.accent.muted },
  periodStatusText: { color: colors.text.secondary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.xs },
  periodStatusTextEligible: { color: colors.accent.light },
  centerState: { minHeight: 260, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.error, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm },
  retryButton: { minHeight: 48, justifyContent: 'center', marginTop: spacing.sm },
  retryText: { color: colors.text.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.sm },
  eligibilityCard: { borderWidth: 1, borderColor: colors.border.default, borderRadius: 18, backgroundColor: colors.background.card, padding: spacing.lg },
  eligibilityTitle: { color: colors.text.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.lg, lineHeight: typography.lineHeights.lg, marginTop: spacing.sm },
  eligibilityCopy: { color: colors.text.secondary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm, marginTop: spacing.sm },
  eligibilityDate: { color: colors.accent.light, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.md, lineHeight: typography.lineHeights.md, marginTop: spacing.md },
  syncCard: { borderWidth: 1, borderColor: colors.warning, borderRadius: 14, padding: spacing.md, marginBottom: spacing.md },
  syncTitle: { color: colors.warning, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.sm },
  syncCopy: { color: colors.text.secondary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm, marginTop: spacing.xs },
  summaryGrid: { flexDirection: 'row', gap: spacing.sm },
  metricCard: { flex: 1, borderRadius: 16, backgroundColor: colors.background.secondary, padding: spacing.md },
  metricValue: { color: colors.text.primary, fontFamily: typography.fonts.bold, fontSize: typography.sizes.xl },
  metricLabel: { color: colors.text.tertiary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.xs, lineHeight: typography.lineHeights.xs, marginTop: spacing.xs },
  evidenceCard: { borderWidth: 1, borderColor: colors.border.default, borderRadius: 18, padding: spacing.lg, marginTop: spacing.md },
  cardLabel: { color: colors.accent.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.xs, letterSpacing: 1.4 },
  evidenceValue: { color: colors.text.primary, fontFamily: typography.fonts.bold, fontSize: typography.sizes.xxl, marginTop: spacing.sm },
  evidenceCopy: { color: colors.text.secondary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm, marginTop: spacing.xs },
  trajectoryCard: { borderRadius: 18, backgroundColor: colors.background.secondary, padding: spacing.lg, marginTop: spacing.md },
  trajectoryRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  trajectoryMetric: { flex: 1 },
  trajectoryValue: { color: colors.text.primary, fontFamily: typography.fonts.bold, fontSize: typography.sizes.xl },
  commitmentBreakdown: { marginTop: spacing.xl },
  sectionTitle: { color: colors.text.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.lg },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border.subtle, paddingVertical: spacing.md },
  breakdownCopy: { flex: 1, paddingRight: spacing.md },
  breakdownName: { color: colors.text.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.sm },
  breakdownMeta: { color: colors.text.tertiary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.xs, marginTop: spacing.xs },
  breakdownRate: { color: colors.accent.light, fontFamily: typography.fonts.bold, fontSize: typography.sizes.lg },
  formCard: { borderWidth: 1, borderColor: colors.border.default, borderRadius: 18, backgroundColor: colors.background.card, padding: spacing.lg, marginTop: spacing.xl },
  label: { color: colors.text.secondary, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.border.default, borderRadius: 12, backgroundColor: colors.background.secondary, color: colors.text.primary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  multiline: { minHeight: 104 },
  decisionList: { gap: spacing.sm },
  decision: { borderWidth: 1, borderColor: colors.border.default, borderRadius: 12, padding: spacing.md },
  decisionSelected: { borderColor: colors.accent.primary, backgroundColor: colors.accent.muted },
  decisionLabel: { color: colors.text.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.sm },
  decisionLabelSelected: { color: colors.accent.light },
  decisionCopy: { color: colors.text.secondary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.xs, lineHeight: typography.lineHeights.xs, marginTop: spacing.xs },
  primaryButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.accent.primary, marginTop: spacing.lg },
  primaryButtonText: { color: colors.text.inverse, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.md },
  disabled: { opacity: 0.55 },
  confirmedCard: { borderRadius: 12, backgroundColor: colors.accent.muted, padding: spacing.md, marginTop: spacing.lg },
  confirmedTitle: { color: colors.accent.light, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.sm },
  confirmedCopy: { color: colors.text.secondary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm, marginTop: spacing.xs },
  adjustButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border.strong, borderRadius: 12, marginTop: spacing.sm },
  adjustButtonText: { color: colors.text.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.sm },
});
