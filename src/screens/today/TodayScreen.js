import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing, typography } from '../../theme';
import QueueRecoveryNotice from '../../components/QueueRecoveryNotice';
import { useAppSession } from '../../context/AppSessionContext';
import {
  getPracticeRepositoryErrorMessage,
  getTodayPractice,
  recordHabitCompletion,
  retractHabitCompletion,
} from '../../data/repositories/practiceRepository';
import { createOperationId } from '../../lib/operationId';
import { asyncStorageCheckInQueue } from '../../data/sync/asyncStorageCheckInQueue';
import { flushPendingCheckIns } from '../../data/sync/flushCheckInQueue';
import { trackProductEvent } from '../../analytics/analytics';
const { getDateKeyInTimeZone } = require('../../lib/date.cjs');
const { isRetryableTransportError } = require('../../lib/networkErrors.cjs');
const { selectStableCheckInOperation } = require('./todayOperations.cjs');

function analyticsFailureClass(error) {
  const status = Number(error?.status || error?.context?.status);
  if (error?.code === 'HX409' || status === 409) return 'conflict';
  if (status >= 500) return 'server';
  if (isRetryableTransportError(error)) return 'network';
  return 'unknown';
}

function formatCivilDate(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function applyQueuedOperations(habits, queuedItems, userId, localDate) {
  const operationsByHabit = new Map();
  for (const item of queuedItems
    .filter((candidate) => (
      candidate.user_id === userId &&
      candidate.local_date === localDate
    ))
    .sort((left, right) => left.occurred_at.localeCompare(right.occurred_at))) {
    const current = operationsByHabit.get(item.habit_id) || [];
    current.push(item);
    operationsByHabit.set(item.habit_id, current);
  }

  return habits.map((habit) => {
    const operations = operationsByHabit.get(habit.id) || [];
    const queued = operations.at(-1);
    if (!queued) return { ...habit, sync_status: 'confirmed', failed_operation_ids: [] };
    const completed = queued.intent === 'record';
    const failedOperationIds = operations
      .filter((item) => item.status === 'failed')
      .map((item) => item.operation_id);
    return {
      ...habit,
      completed,
      sync_status: failedOperationIds.length ? 'sync_failed' : 'pending_offline',
      failed_operation_ids: failedOperationIds,
      completion: {
        ...habit.completion,
        completed,
        completion_level: completed ? queued.completion_level : null,
      },
    };
  });
}

export default function TodayScreen() {
  const { activePlan, user } = useAppSession();
  const timeZone = activePlan.timezone;
  const [localDate, setLocalDate] = useState(() => getDateKeyInTimeZone(new Date(), timeZone));
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingById, setPendingById] = useState({});
  const [actionErrors, setActionErrors] = useState({});
  const [queueRecoveryNotice, setQueueRecoveryNotice] = useState(null);
  const [queueUnavailable, setQueueUnavailable] = useState(false);
  const [queueRecoveryError, setQueueRecoveryError] = useState('');
  const [acknowledgingQueueRecovery, setAcknowledgingQueueRecovery] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const requestIdRef = useRef(0);
  const operationByHabitRef = useRef({});
  const onlineRef = useRef(null);

  const loadPractice = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const nextLocalDate = getDateKeyInTimeZone(new Date(), timeZone);
    setLoading(true);
    setError('');

    try {
      let queue;
      let queueReadable = true;
      let knownRecoveryNotice = null;
      try {
        queue = await asyncStorageCheckInQueue.list({ userId: user.id });
        if (requestId !== requestIdRef.current) return;
        knownRecoveryNotice = queue.recoveryNotice;
        setQueueUnavailable(false);
        setQueueRecoveryError('');
      } catch {
        if (requestId !== requestIdRef.current) return;
        queue = { items: [] };
        queueReadable = false;
        setQueueRecoveryNotice(null);
        setQueueUnavailable(true);
      }
      await flushPendingCheckIns({ userId: user.id }).catch(() => null);
      if (queueReadable) {
        try {
          queue = await asyncStorageCheckInQueue.list({ userId: user.id });
          if (requestId !== requestIdRef.current) return;
          setQueueRecoveryNotice(queue.recoveryNotice);
        } catch {
          if (requestId !== requestIdRef.current) return;
          queue = { items: [] };
          if (knownRecoveryNotice) {
            setQueueRecoveryNotice(knownRecoveryNotice);
            setQueueUnavailable(false);
            setQueueRecoveryError('No pudimos volver a verificar la cola después de recuperarla. El aviso se conserva.');
          } else {
            setQueueRecoveryNotice(null);
            setQueueUnavailable(true);
          }
        }
      }
      const result = await getTodayPractice({
        userId: user.id,
        planId: activePlan.id,
        localDate: nextLocalDate,
      });
      if (result.error) throw result.error;
      if (requestId !== requestIdRef.current) return;
      setLocalDate(nextLocalDate);
      setHabits(applyQueuedOperations(result.data, queue.items, user.id, nextLocalDate));
    } catch (loadError) {
      if (requestId === requestIdRef.current) {
        setError(getPracticeRepositoryErrorMessage(loadError));
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [activePlan.id, timeZone, user.id]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setReloadKey((value) => value + 1);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => NetInfo.addEventListener((state) => {
    const online = state.isConnected === true && state.isInternetReachable !== false;
    if (online && onlineRef.current === false) {
      setReloadKey((value) => value + 1);
    }
    onlineRef.current = online;
  }), []);

  useEffect(() => {
    const timer = setInterval(() => {
      const currentDate = getDateKeyInTimeZone(new Date(), timeZone);
      if (currentDate !== localDate) setReloadKey((value) => value + 1);
    }, 60_000);
    return () => clearInterval(timer);
  }, [localDate, timeZone]);

  useFocusEffect(
    useCallback(() => {
      loadPractice();
      return () => {
        requestIdRef.current += 1;
      };
    }, [loadPractice, reloadKey])
  );

  async function commitEvidence(habit, intendedCompleted, completionLevel = 'full') {
    if (pendingById[habit.id]) return;
    const currentDate = getDateKeyInTimeZone(new Date(), timeZone);
    if (currentDate !== localDate) {
      setActionErrors((current) => ({
        ...current,
        [habit.id]: 'El día civil cambió. Actualizamos tu protocolo antes de registrar.',
      }));
      setReloadKey((value) => value + 1);
      return;
    }

    const operation = selectStableCheckInOperation({
      existing: operationByHabitRef.current[habit.id],
      intendedCompleted,
      completionLevel,
      createId: createOperationId,
      occurredAt: new Date().toISOString(),
    });
    operationByHabitRef.current[habit.id] = operation;

    setPendingById((current) => ({ ...current, [habit.id]: true }));
    setActionErrors((current) => ({ ...current, [habit.id]: '' }));

    try {
      const result = intendedCompleted
        ? await recordHabitCompletion({
            habitId: habit.id,
            localDate,
            timeZone: habit.timezone || timeZone,
            completionLevel,
            occurredAt: operation.occurredAt,
            clientOperationId: operation.id,
          })
        : await retractHabitCompletion({
            habitId: habit.id,
            localDate,
            timeZone: habit.timezone || timeZone,
            occurredAt: operation.occurredAt,
            clientOperationId: operation.id,
          });

      if (result.error) throw result.error;
      if (!result.data?.event) throw new Error('El servidor no devolvió el evento confirmado.');

      setHabits((current) => current.map((item) => (
        item.id === habit.id
          ? {
              ...item,
              completed: intendedCompleted,
              sync_status: 'confirmed',
              completion: {
                ...item.completion,
                completed: intendedCompleted,
                completion_level: intendedCompleted ? completionLevel : null,
                source_event_id: intendedCompleted ? result.data.event.id : null,
                last_event_id: result.data.event.id,
              },
            }
          : item
      )));
      if (intendedCompleted) {
        void trackProductEvent('checkin_recorded', {
          completion_level: completionLevel,
          sync_state: 'confirmed',
        });
      }
      delete operationByHabitRef.current[habit.id];
    } catch (actionError) {
      if (isRetryableTransportError(actionError)) {
        try {
          const queued = await asyncStorageCheckInQueue.enqueue({
            operation_id: operation.id,
            user_id: user.id,
            habit_id: habit.id,
            local_date: localDate,
            timezone: habit.timezone || timeZone,
            intent: intendedCompleted ? 'record' : 'retract',
            completion_level: intendedCompleted ? completionLevel : null,
            occurred_at: operation.occurredAt,
          });
          if (queued.recoveryNotice) {
            setQueueRecoveryNotice(queued.recoveryNotice);
            setQueueUnavailable(false);
          }
          setHabits((current) => current.map((item) => item.id === habit.id
            ? {
                ...item,
                completed: intendedCompleted,
                sync_status: 'pending_offline',
                completion: {
                  ...item.completion,
                  completed: intendedCompleted,
                  completion_level: intendedCompleted ? completionLevel : null,
                },
              }
            : item));
          if (intendedCompleted) {
            void trackProductEvent('checkin_recorded', {
              completion_level: completionLevel,
              sync_state: 'offline_queued',
            });
          }
          delete operationByHabitRef.current[habit.id];
          return;
        } catch {
          void trackProductEvent('checkin_sync_failed', {
            failure_class: 'network',
            retryable: true,
            attempt_bucket: 'first',
          });
          setActionErrors((current) => ({
            ...current,
            [habit.id]: 'No pudimos confirmar ni encolar el cambio. Reinténtalo cuando recuperes conexión.',
          }));
          return;
        }
      }
      void trackProductEvent('checkin_sync_failed', {
        failure_class: analyticsFailureClass(actionError),
        retryable: false,
        attempt_bucket: 'first',
      });
      setActionErrors((current) => ({
        ...current,
        [habit.id]: getPracticeRepositoryErrorMessage(actionError),
      }));
    } finally {
      setPendingById((current) => ({ ...current, [habit.id]: false }));
    }
  }

  async function retryFailedEvidence(habit) {
    if (pendingById[habit.id] || !habit.failed_operation_ids?.length) return;
    setPendingById((current) => ({ ...current, [habit.id]: true }));
    setActionErrors((current) => ({ ...current, [habit.id]: '' }));
    try {
      await asyncStorageCheckInQueue.retryFailed(habit.failed_operation_ids);
      await flushPendingCheckIns({ userId: user.id });
      setReloadKey((value) => value + 1);
    } catch {
      void trackProductEvent('checkin_sync_failed', {
        failure_class: 'unknown',
        retryable: true,
        attempt_bucket: 'retry',
      });
      setActionErrors((current) => ({
        ...current,
        [habit.id]: 'No pudimos reactivar la sincronización. El cambio local sigue conservado.',
      }));
    } finally {
      setPendingById((current) => ({ ...current, [habit.id]: false }));
    }
  }

  async function acknowledgeQueueRecovery() {
    if (acknowledgingQueueRecovery || !queueRecoveryNotice) return;
    setAcknowledgingQueueRecovery(true);
    setQueueRecoveryError('');
    try {
      const result = await asyncStorageCheckInQueue.acknowledgeRecoveryNotice(
        {
          userId: user.id,
          generation: queueRecoveryNotice.generation,
          detectedAt: queueRecoveryNotice.detected_at,
        },
      );
      setQueueRecoveryNotice(result.recoveryNotice);
      if (result.reason === 'notice_changed') {
        setQueueRecoveryError('Detectamos otra recuperación local. Revisa este aviso nuevo antes de confirmarlo.');
      }
    } catch {
      setQueueRecoveryError('No pudimos guardar la confirmación. El aviso seguirá visible para proteger tus cambios.');
    } finally {
      setAcknowledgingQueueRecovery(false);
    }
  }

  const completedCount = habits.filter((habit) => habit.completed).length;
  const completion = habits.length ? Math.round((completedCount / habits.length) * 100) : 0;
  const pendingOfflineCount = habits.filter((habit) => habit.sync_status === 'pending_offline').length;
  const failedOfflineCount = habits.filter((habit) => habit.sync_status === 'sync_failed').length;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.date}>{formatCivilDate(localDate).toUpperCase()}</Text>
          <Text accessibilityRole="header" style={styles.title}>Evidencia de hoy</Text>
          <Text style={styles.identity}>{activePlan.identity_statement}</Text>
        </View>

        <QueueRecoveryNotice
          notice={queueRecoveryNotice}
          unavailable={queueUnavailable}
          acknowledging={acknowledgingQueueRecovery}
          error={queueRecoveryError}
          onAcknowledge={acknowledgeQueueRecovery}
        />

        {loading ? (
          <View style={styles.centerState} accessible accessibilityLabel="Cargando compromisos de hoy">
            <ActivityIndicator color={colors.accent.primary} />
          </View>
        ) : null}

        {!loading && error ? (
          <View style={styles.centerState}>
            <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
            <TouchableOpacity accessibilityRole="button" style={styles.retryButton} onPress={() => setReloadKey((value) => value + 1)}>
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!loading && !error ? (
          <>
            <View style={styles.progressCard}>
              <View style={styles.progressHeader}>
                <View>
                  <Text style={styles.cardLabel}>PRÁCTICA PROGRAMADA</Text>
                  <Text style={styles.progressValue}>{completedCount} de {habits.length}</Text>
                </View>
                <Text accessible={false} importantForAccessibility="no" style={styles.percentage}>{completion}%</Text>
              </View>
              <View accessibilityRole="progressbar" accessibilityLabel="Práctica programada registrada" accessibilityValue={{ min: 0, max: 100, now: completion }} style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${completion}%` }]} />
              </View>
            </View>

            {pendingOfflineCount ? (
              <View style={styles.offlineCard} accessibilityLiveRegion="polite">
                <Text style={styles.offlineTitle}>{pendingOfflineCount} {pendingOfflineCount === 1 ? 'cambio pendiente' : 'cambios pendientes'}</Text>
                <Text style={styles.offlineCopy}>La app volverá a sincronizarlos con el mismo identificador al recuperar conexión.</Text>
              </View>
            ) : null}

            {failedOfflineCount ? (
              <View style={styles.failedSyncCard} accessibilityRole="alert">
                <Text style={styles.failedSyncTitle}>{failedOfflineCount} {failedOfflineCount === 1 ? 'cambio necesita atención' : 'cambios necesitan atención'}</Text>
                <Text style={styles.offlineCopy}>La intención local se conserva, pero todavía no forma parte de la evidencia confirmada.</Text>
              </View>
            ) : null}

            {habits.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Hoy no hay compromisos programados.</Text>
                <Text style={styles.emptyCopy}>Un descanso planificado no rompe tu trayectoria.</Text>
              </View>
            ) : (
              <View style={styles.habitList}>
                {habits.map((habit) => {
                  const pending = Boolean(pendingById[habit.id]);
                  const syncFailed = habit.sync_status === 'sync_failed';
                  const actionError = actionErrors[habit.id];
                  const level = habit.completion?.completion_level;
                  return (
                    <View key={habit.id} style={[styles.habitCard, habit.completed && styles.habitCardCompleted]}>
                      <View style={styles.habitMainRow}>
                        <View style={styles.habitCopy}>
                          <Text style={styles.habitName}>{habit.name}</Text>
                          <Text style={styles.minimumAction}>Mínimo: {habit.minimum_action}</Text>
                          <Text style={styles.habitStatus} accessibilityLiveRegion="polite">
                            {pending
                              ? 'Sincronizando…'
                              : actionError
                                ? 'Cambio no confirmado'
                                : habit.sync_status === 'pending_offline'
                                  ? 'Pendiente de sincronización'
                                : syncFailed
                                  ? 'Sincronización bloqueada'
                                : habit.completed
                                  ? level === 'minimum' ? 'Versión mínima registrada' : 'Registrado'
                                  : 'Pendiente'}
                          </Text>
                        </View>
                        <TouchableOpacity
                          accessibilityRole="checkbox"
                          accessibilityLabel={habit.name}
                          accessibilityHint={habit.completed ? 'Toca dos veces para deshacer este registro' : 'Toca dos veces para registrar la versión completa'}
                          accessibilityState={{ checked: habit.completed, disabled: pending || syncFailed, busy: pending }}
                          style={[styles.checkButton, habit.completed && styles.checkButtonCompleted]}
                          onPress={() => commitEvidence(habit, !habit.completed, 'full')}
                          disabled={pending || syncFailed}
                        >
                          {pending ? (
                            <ActivityIndicator size="small" color={colors.text.primary} />
                          ) : (
                            <Ionicons name={habit.completed ? 'checkmark' : 'add'} size={24} color={habit.completed ? colors.text.inverse : colors.text.primary} />
                          )}
                        </TouchableOpacity>
                      </View>

                      {!habit.completed && !pending && !syncFailed ? (
                        <TouchableOpacity
                          accessibilityRole="button"
                          style={styles.minimumButton}
                          onPress={() => commitEvidence(habit, true, 'minimum')}
                        >
                          <Text style={styles.minimumButtonText}>Registrar solo la versión mínima</Text>
                        </TouchableOpacity>
                      ) : null}

                      {syncFailed ? (
                        <TouchableOpacity
                          accessibilityRole="button"
                          style={styles.minimumButton}
                          onPress={() => retryFailedEvidence(habit)}
                          disabled={pending}
                        >
                          <Text style={styles.minimumButtonText}>Reintentar la misma operación</Text>
                        </TouchableOpacity>
                      ) : null}

                      {actionError ? (
                        <View style={styles.actionErrorCard}>
                          <Text accessibilityRole="alert" style={styles.actionError}>{actionError}</Text>
                          <TouchableOpacity
                            accessibilityRole="button"
                            style={styles.inlineRetry}
                            onPress={() => commitEvidence(habit, operationByHabitRef.current[habit.id]?.intendedCompleted ?? !habit.completed, operationByHabitRef.current[habit.id]?.completionLevel)}
                          >
                            <Text style={styles.inlineRetryText}>Reintentar la misma operación</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}

            <View style={styles.reentryCard}>
              <Text style={styles.reentryTitle}>Una interrupción no borra la evidencia anterior.</Text>
              <Text style={styles.reentryCopy}>Hoy solo cuenta la siguiente acción programada.</Text>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background.primary },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  header: { marginBottom: spacing.xl },
  date: {
    color: colors.accent.primary,
    fontFamily: typography.fonts.semibold,
    fontSize: typography.sizes.xs,
    letterSpacing: 1.6,
    marginBottom: spacing.sm,
  },
  title: { color: colors.text.primary, fontFamily: typography.fonts.bold, fontSize: typography.sizes.xxl, lineHeight: typography.lineHeights.xxl },
  identity: { color: colors.text.secondary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.md, lineHeight: typography.lineHeights.md, marginTop: spacing.sm },
  centerState: { minHeight: 260, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: colors.error, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm, textAlign: 'center' },
  retryButton: { minHeight: 48, justifyContent: 'center', marginTop: spacing.sm },
  retryText: { color: colors.text.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.sm },
  progressCard: { borderRadius: 18, backgroundColor: colors.background.secondary, padding: spacing.lg },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: { color: colors.text.tertiary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.xs, letterSpacing: 1.4 },
  progressValue: { color: colors.text.primary, fontFamily: typography.fonts.bold, fontSize: typography.sizes.xl, marginTop: spacing.xs },
  percentage: { color: colors.accent.light, fontFamily: typography.fonts.bold, fontSize: typography.sizes.xl },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.border.subtle, overflow: 'hidden', marginTop: spacing.md },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: colors.accent.primary },
  offlineCard: { borderRadius: 14, backgroundColor: colors.background.secondary, padding: spacing.md, marginTop: spacing.md },
  offlineTitle: { color: colors.warning, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.sm },
  offlineCopy: { color: colors.text.secondary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm, marginTop: spacing.xs },
  failedSyncCard: { borderWidth: 1, borderColor: colors.error, borderRadius: 14, padding: spacing.md, marginTop: spacing.md },
  failedSyncTitle: { color: colors.error, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.sm },
  habitList: { marginTop: spacing.md },
  habitCard: { borderWidth: 1, borderColor: colors.border.default, borderRadius: 18, backgroundColor: colors.background.card, padding: spacing.lg, marginBottom: spacing.md },
  habitCardCompleted: { borderColor: colors.accent.dark, backgroundColor: colors.accent.muted },
  habitMainRow: { flexDirection: 'row', alignItems: 'center' },
  habitCopy: { flex: 1, paddingRight: spacing.md },
  habitName: { color: colors.text.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.lg, lineHeight: typography.lineHeights.lg },
  minimumAction: { color: colors.text.secondary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm, marginTop: spacing.xs },
  habitStatus: { color: colors.text.tertiary, fontFamily: typography.fonts.medium, fontSize: typography.sizes.xs, marginTop: spacing.sm },
  checkButton: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border.strong, borderRadius: 26, backgroundColor: colors.background.secondary },
  checkButtonCompleted: { borderColor: colors.accent.primary, backgroundColor: colors.accent.primary },
  minimumButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginTop: spacing.sm },
  minimumButtonText: { color: colors.accent.light, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm },
  actionErrorCard: { borderTopWidth: 1, borderTopColor: colors.border.default, marginTop: spacing.sm, paddingTop: spacing.sm },
  actionError: { color: colors.error, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm },
  inlineRetry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  inlineRetryText: { color: colors.text.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.sm },
  emptyCard: { borderWidth: 1, borderColor: colors.border.default, borderRadius: 18, padding: spacing.lg, marginTop: spacing.md },
  emptyTitle: { color: colors.text.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.md },
  emptyCopy: { color: colors.text.secondary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm, marginTop: spacing.xs },
  reentryCard: { borderLeftWidth: 2, borderLeftColor: colors.accent.primary, paddingLeft: spacing.md, marginTop: spacing.lg },
  reentryTitle: { color: colors.text.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm },
  reentryCopy: { color: colors.text.secondary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm, marginTop: spacing.xs },
});
