import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Modal,
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
import { WEEKDAYS, formatScheduledWeekdays } from '../../constants/weekdays';
import {
  createPlanHabit,
  getPlanHabits,
  getPracticeRepositoryErrorMessage,
  getScheduleExceptions,
  removeHabitScheduleException,
  replaceHabitConfiguration,
  setHabitScheduleException,
  setHabitStatus,
} from '../../data/repositories/practiceRepository';
import { createOperationId } from '../../lib/operationId';
import { focusAccessibilityElement } from '../../lib/accessibility';
import { trackProductEvent } from '../../analytics/analytics';
import {
  acknowledgeUserReminderTimezone,
  getUserReminderPreferences,
  lineageIdOf,
  reconcileHabitReminder,
  reconcileUserHabitReminders,
  setHabitReminderEnabled,
  setUserReminderQuietHours,
  setUserRemindersGlobalEnabled,
} from '../../notifications/localReminders';
const { getDateKeyInTimeZone } = require('../../lib/date.cjs');
const { validateInitialPlan } = require('../../domain/plan.cjs');
const { firstAvailableActivePosition } = require('./disciplineSlots.cjs');
const { addDays } = require('../../domain/dateKeys.cjs');
const { isCommitmentScheduled } = require('../../domain/plans.cjs');
const { selectHabitTimelineForDate } = require('../../domain/habitVersionTimeline.cjs');
const { REMINDER_HORIZON_DAYS } = require('../../notifications/localReminderCoordinator.cjs');

const ALL_WEEKDAYS = WEEKDAYS.map((day) => day.value);
const DEFAULT_REMINDER_PREFERENCES = {
  globalEnabled: true,
  quietHours: { start: '22:00', end: '07:00' },
  acknowledgedTimezone: null,
  deviceTimezone: null,
  timezoneChangeRequired: false,
};

function emptyForm(position) {
  return {
    name: '',
    minimum_action: '',
    scheduled_weekdays: [...ALL_WEEKDAYS],
    reminder_time: '',
    position,
  };
}

function habitForEffectiveStatus(habit) {
  return { ...habit, status: habit.effective_status || habit.status };
}

function reminderStatusLabel(status) {
  switch (status?.code) {
    case 'active': return 'Activo · usa la hora local del dispositivo';
    case 'paused': return 'En pausa; se reactivará con el compromiso';
    case 'permission_denied': return 'Bloqueado en los ajustes del dispositivo';
    case 'permission_required': return 'Pendiente de permiso';
    case 'pending': return 'Pendiente de programación';
    case 'not_configured': return 'Sin horario válido';
    case 'globally_disabled': return 'Pausado por el control global';
    case 'quiet_hours': return 'Dentro de tus horas de silencio';
    case 'timezone_change_required': return 'Confirma la nueva zona antes de reprogramar';
    case 'weekday_limit': return 'Límite de dos avisos para ese día';
    default: return 'Horario guardado · inactivo';
  }
}

export default function DisciplineScreen({ navigation }) {
  const { activePlan, user } = useAppSession();
  const [effectiveOn, setEffectiveOn] = useState(() => (
    getDateKeyInTimeZone(new Date(), activePlan.timezone)
  ));
  const nextEffectiveOn = addDays(effectiveOn, 1);
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingHabit, setEditingHabit] = useState(null);
  const [form, setForm] = useState(emptyForm(0));
  const [formErrors, setFormErrors] = useState([]);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingHabitId, setPendingHabitId] = useState(null);
  const [actionErrors, setActionErrors] = useState({});
  const [tomorrowExceptions, setTomorrowExceptions] = useState({});
  const [reminderStatuses, setReminderStatuses] = useState({});
  const [reminderNotice, setReminderNotice] = useState('');
  const [pendingReminderLineage, setPendingReminderLineage] = useState(null);
  const [reminderPreferences, setReminderPreferences] = useState(DEFAULT_REMINDER_PREFERENCES);
  const [quietHoursDraft, setQuietHoursDraft] = useState(DEFAULT_REMINDER_PREFERENCES.quietHours);
  const [savingReminderPreferences, setSavingReminderPreferences] = useState(false);
  const requestIdRef = useRef(0);
  const formOperationIdRef = useRef(createOperationId());
  const actionOperationsRef = useRef({});
  const modalTitleRef = useRef(null);
  const lastModalTriggerRef = useRef(null);
  const listTitleRef = useRef(null);
  const minimumInputRef = useRef(null);
  const focusListAfterReloadRef = useRef(false);

  useEffect(() => {
    const refreshDateBoundary = () => {
      const currentDate = getDateKeyInTimeZone(new Date(), activePlan.timezone);
      setEffectiveOn((previous) => previous === currentDate ? previous : currentDate);
    };
    refreshDateBoundary();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshDateBoundary();
    });
    const interval = setInterval(refreshDateBoundary, 60 * 1000);
    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [activePlan.id, activePlan.timezone]);

  const loadHabits = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');
    try {
      const result = await getPlanHabits({
        userId: user.id,
        planId: activePlan.id,
        includeArchived: true,
      });
      if (result.error) throw result.error;
      const current = selectHabitTimelineForDate(result.data, effectiveOn)
        .filter((habit) => !['archived', 'ended'].includes(habit.effective_status));
      const exceptionsResult = await getScheduleExceptions({
        userId: user.id,
        habitIds: current.map((habit) => habit.id),
        from: effectiveOn,
        through: addDays(effectiveOn, REMINDER_HORIZON_DAYS - 1),
      });
      if (exceptionsResult.error) throw exceptionsResult.error;
      if (requestId !== requestIdRef.current) return;
      const currentWithExclusions = current.map((habit) => ({
        ...habit,
        excluded_dates: exceptionsResult.data
          .filter((exception) => exception.habit_id === habit.id)
          .map((exception) => exception.local_date),
      }));
      setHabits(currentWithExclusions);
      setTomorrowExceptions(Object.fromEntries(
        exceptionsResult.data
          .filter((exception) => exception.local_date === nextEffectiveOn)
          .map((exception) => [exception.habit_id, exception]),
      ));
      try {
        const statuses = await reconcileUserHabitReminders({
          userId: user.id,
          habits: currentWithExclusions.map(habitForEffectiveStatus),
        });
        const preferences = await getUserReminderPreferences(user.id);
        if (requestId === requestIdRef.current) {
          setReminderStatuses(statuses);
          setReminderPreferences(preferences);
          setQuietHoursDraft(preferences.quietHours);
        }
      } catch {
        if (requestId === requestIdRef.current) {
          setReminderNotice('Los compromisos se cargaron, pero no pudimos verificar los recordatorios locales.');
        }
      }
    } catch (loadError) {
      if (requestId === requestIdRef.current) setError(getPracticeRepositoryErrorMessage(loadError));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [activePlan.id, effectiveOn, nextEffectiveOn, user.id]);

  useFocusEffect(
    useCallback(() => {
      loadHabits();
      return () => {
        requestIdRef.current += 1;
      };
    }, [loadHabits, reloadKey])
  );

  useEffect(() => {
    navigation.setOptions({ tabBarStyle: modalVisible ? { display: 'none' } : undefined });
    return () => navigation.setOptions({ tabBarStyle: undefined });
  }, [modalVisible, navigation]);

  useEffect(() => {
    if (!loading && focusListAfterReloadRef.current) {
      focusListAfterReloadRef.current = false;
      focusAccessibilityElement(listTitleRef, 120);
    }
  }, [loading]);

  function rememberModalTrigger(event) {
    lastModalTriggerRef.current = event?.currentTarget || null;
  }

  function restoreModalTrigger() {
    if (lastModalTriggerRef.current) focusAccessibilityElement(lastModalTriggerRef.current, 120);
  }

  function openCreate(event) {
    const position = availablePosition;
    if (position == null) return;
    rememberModalTrigger(event);
    setEditingHabit(null);
    setForm(emptyForm(position));
    setFormErrors([]);
    setSaveError('');
    formOperationIdRef.current = createOperationId();
    setModalVisible(true);
  }

  function openEdit(habit, event) {
    rememberModalTrigger(event);
    setEditingHabit(habit);
    setForm({
      name: habit.name,
      minimum_action: habit.minimum_action,
      scheduled_weekdays: [...habit.scheduled_weekdays],
      reminder_time: habit.reminder_time || '',
      position: habit.position,
    });
    setFormErrors([]);
    setSaveError('');
    formOperationIdRef.current = createOperationId();
    setModalVisible(true);
  }

  function updateForm(field, value) {
    if (saveError) {
      formOperationIdRef.current = createOperationId();
      setSaveError('');
    }
    setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleWeekday(weekday) {
    const selected = form.scheduled_weekdays.includes(weekday);
    updateForm(
      'scheduled_weekdays',
      selected
        ? form.scheduled_weekdays.filter((value) => value !== weekday)
        : [...form.scheduled_weekdays, weekday],
    );
  }

  function closeModal() {
    if (saving) return;
    setModalVisible(false);
    setFormErrors([]);
    setSaveError('');
    restoreModalTrigger();
  }

  async function saveHabit() {
    if (saving) return;
    const validation = validateInitialPlan({
      identity_statement: activePlan.identity_statement,
      outcome_statement: activePlan.outcome_statement,
      why_statement: activePlan.why_statement,
      timezone: activePlan.timezone,
      starts_on: effectiveOn,
      commitments: [form],
    });
    if (!validation.valid) {
      setFormErrors(validation.errors.map((issue) => issue.message));
      return;
    }

    setSaving(true);
    setFormErrors([]);
    setSaveError('');
    try {
      const habitPayload = { ...form, timezone: activePlan.timezone };
      const result = editingHabit
        ? await replaceHabitConfiguration({
            habitId: editingHabit.id,
            habit: habitPayload,
            effectiveOn: nextEffectiveOn,
            clientOperationId: formOperationIdRef.current,
          })
        : await createPlanHabit({
            planId: activePlan.id,
            habit: habitPayload,
            effectiveOn,
            clientOperationId: formOperationIdRef.current,
          });
      if (result.error) throw result.error;
      if (!result.data?.habit) throw new Error('El servidor no devolvió el compromiso confirmado.');
      void trackProductEvent('plan_adjusted', {
        adjustment_type: 'schedule',
        active_commitment_count: Math.min(3, activeCount + (editingHabit ? 0 : 1)),
      });
      if (editingHabit) {
        try {
          await reconcileHabitReminder({
            userId: user.id,
            previousHabit: habitForEffectiveStatus(editingHabit),
            nextHabit: {
              ...editingHabit,
              status: 'active',
              effective_status: 'active',
              ends_on: effectiveOn,
            },
          });
        } catch {
          setReminderNotice('El cambio se guardó, pero no pudimos acotar el recordatorio vigente. Revisa los avisos antes de cerrar la app.');
        }
      }
      focusListAfterReloadRef.current = true;
      setModalVisible(false);
      setReloadKey((value) => value + 1);
    } catch (mutationError) {
      setSaveError(getPracticeRepositoryErrorMessage(mutationError));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(habit, status) {
    if (pendingHabitId) return;
    const currentStatus = habit.effective_status || habit.status;
    const statusEffectiveOn = currentStatus === 'active' && status !== 'active'
      ? nextEffectiveOn
      : effectiveOn;
    const operationKey = `${habit.id}:${status}:${statusEffectiveOn}`;
    const operationId = actionOperationsRef.current[operationKey] || createOperationId();
    actionOperationsRef.current[operationKey] = operationId;
    setPendingHabitId(habit.id);
    setActionErrors((current) => ({ ...current, [habit.id]: '' }));
    try {
      const result = await setHabitStatus({
        habitId: habit.id,
        status,
        effectiveOn: statusEffectiveOn,
        clientOperationId: operationId,
      });
      if (result.error) throw result.error;
      if (!result.data?.habit) throw new Error('El servidor no devolvió el compromiso confirmado.');
      const activeDelta = currentStatus !== 'active' && status === 'active'
        ? 1
        : currentStatus === 'active' && status !== 'active' ? -1 : 0;
      void trackProductEvent('plan_adjusted', {
        adjustment_type: status === 'active' ? 'reactivate' : status === 'paused' ? 'pause' : 'archive',
        active_commitment_count: Math.max(0, Math.min(3, activeCount + activeDelta)),
      });
      try {
        const futureTransition = statusEffectiveOn > effectiveOn;
        await reconcileHabitReminder({
          userId: user.id,
          previousHabit: habitForEffectiveStatus(habit),
          nextHabit: futureTransition
            ? { ...result.data.habit, status: 'active', effective_status: 'active' }
            : { ...result.data.habit, effective_status: result.data.habit.status },
        });
      } catch {
        setReminderNotice('El estado se guardó, pero no pudimos acotar el recordatorio local. Revisa los avisos antes de cerrar la app.');
      }
      delete actionOperationsRef.current[operationKey];
      setReloadKey((value) => value + 1);
    } catch (mutationError) {
      setActionErrors((current) => ({
        ...current,
        [habit.id]: getPracticeRepositoryErrorMessage(mutationError),
      }));
    } finally {
      setPendingHabitId(null);
    }
  }

  async function toggleHabitReminder(habit) {
    const lineageId = lineageIdOf(habit);
    if (!lineageId || pendingReminderLineage) return;
    const current = reminderStatuses[lineageId];
    const enabled = current?.code === 'permission_required'
      ? true
      : current?.enabled !== true;
    setPendingReminderLineage(lineageId);
    setReminderNotice('');
    try {
      const status = await setHabitReminderEnabled({
        userId: user.id,
        habit: habitForEffectiveStatus(habit),
        enabled,
      });
      setReminderStatuses((statuses) => ({ ...statuses, [lineageId]: status }));
      if (status.code === 'permission_denied') {
        setReminderNotice('El permiso está bloqueado. Puedes habilitar notificaciones para HEXIS desde los ajustes del dispositivo.');
      } else if (status.code === 'permission_required') {
        setReminderNotice('El dispositivo no concedió el permiso; el horario permanece guardado pero inactivo.');
      } else if (status.code === 'active') {
        setReminderNotice(`${status.scheduledCount} ${status.scheduledCount === 1 ? 'aviso próximo quedó programado' : 'avisos próximos quedaron programados'} de forma segura.`);
      } else if (status.code === 'paused') {
        setReminderNotice('El recordatorio quedó habilitado y volverá a programarse cuando reactives el compromiso.');
      } else if (status.code === 'inactive') {
        setReminderNotice('Recordatorio desactivado; el horario sigue guardado en el compromiso.');
      } else if (status.code === 'quiet_hours') {
        setReminderNotice('Ese horario cae dentro de tus horas de silencio. Ajusta la hora o la ventana de silencio.');
      } else if (status.code === 'weekday_limit') {
        setReminderNotice('Ya existen dos avisos activos en al menos uno de esos días. Desactiva otro o cambia la frecuencia.');
      } else if (status.code === 'globally_disabled') {
        setReminderNotice('La preferencia individual quedó guardada; activa primero los recordatorios globales.');
      } else if (status.code === 'timezone_change_required') {
        setReminderNotice('Detectamos una zona horaria distinta. Confirma el cambio antes de reprogramar.');
      }
    } catch {
      setReminderNotice('No pudimos cambiar el recordatorio local. El compromiso no fue modificado.');
    } finally {
      setPendingReminderLineage(null);
    }
  }

  async function toggleGlobalReminders() {
    if (savingReminderPreferences) return;
    setSavingReminderPreferences(true);
    setReminderNotice('');
    try {
      const result = await setUserRemindersGlobalEnabled({
        userId: user.id,
        habits: habits.map(habitForEffectiveStatus),
        enabled: !reminderPreferences.globalEnabled,
      });
      setReminderPreferences(result.preferences);
      setReminderStatuses(result.statuses);
      setReminderNotice(result.preferences.globalEnabled
        ? 'Recordatorios globales activados; se respetan tus horas de silencio y el máximo diario.'
        : 'Todos los avisos locales quedaron pausados; las preferencias individuales se conservaron.');
    } catch {
      setReminderNotice('No pudimos cambiar el control global de recordatorios.');
    } finally {
      setSavingReminderPreferences(false);
    }
  }

  async function saveQuietHours() {
    if (savingReminderPreferences) return;
    setSavingReminderPreferences(true);
    setReminderNotice('');
    try {
      const result = await setUserReminderQuietHours({
        userId: user.id,
        habits: habits.map(habitForEffectiveStatus),
        start: quietHoursDraft.start,
        end: quietHoursDraft.end,
      });
      setReminderPreferences(result.preferences);
      setReminderStatuses(result.statuses);
      setQuietHoursDraft(result.preferences.quietHours);
      setReminderNotice('Horas de silencio guardadas y recordatorios reconciliados.');
    } catch {
      setReminderNotice('Usa el formato HH:MM para ambas horas de silencio.');
    } finally {
      setSavingReminderPreferences(false);
    }
  }

  async function acknowledgeTimezoneChange() {
    if (savingReminderPreferences) return;
    setSavingReminderPreferences(true);
    setReminderNotice('');
    try {
      const result = await acknowledgeUserReminderTimezone({
        userId: user.id,
        habits: habits.map(habitForEffectiveStatus),
      });
      setReminderPreferences(result.preferences);
      setReminderStatuses(result.statuses);
      setReminderNotice(`Recordatorios recalculados para ${result.preferences.deviceTimezone}.`);
    } catch {
      setReminderNotice('No pudimos confirmar la zona horaria actual del dispositivo.');
    } finally {
      setSavingReminderPreferences(false);
    }
  }

  function confirmArchive(habit) {
    Alert.alert(
      'Archivar compromiso',
      `La evidencia anterior se conservará. Si está activo, el archivo será efectivo el ${nextEffectiveOn}.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Archivar', style: 'destructive', onPress: () => changeStatus(habit, 'archived') },
      ],
    );
  }

  async function toggleTomorrowRest(habit) {
    if (pendingHabitId) return;
    const existing = tomorrowExceptions[habit.id];
    const operationKey = `${habit.id}:${existing ? 'remove-rest' : 'set-rest'}:${nextEffectiveOn}`;
    const operationId = actionOperationsRef.current[operationKey] || createOperationId();
    actionOperationsRef.current[operationKey] = operationId;
    setPendingHabitId(habit.id);
    setActionErrors((current) => ({ ...current, [habit.id]: '' }));
    try {
      const result = existing
        ? await removeHabitScheduleException({
            exceptionId: existing.id,
            clientOperationId: operationId,
          })
        : await setHabitScheduleException({
            habitId: habit.id,
            localDate: nextEffectiveOn,
            kind: 'rest',
            reason: null,
            clientOperationId: operationId,
          });
      if (result.error) throw result.error;
      if (!result.data?.exception) throw new Error('El servidor no devolvió el descanso confirmado.');
      void trackProductEvent('plan_adjusted', {
        adjustment_type: 'schedule',
        active_commitment_count: activeCount,
      });
      try {
        const excludedDates = existing
          ? (habit.excluded_dates || []).filter((dateKey) => dateKey !== nextEffectiveOn)
          : [...new Set([...(habit.excluded_dates || []), nextEffectiveOn])];
        await reconcileHabitReminder({
          userId: user.id,
          previousHabit: habitForEffectiveStatus(habit),
          nextHabit: habitForEffectiveStatus({ ...habit, excluded_dates: excludedDates }),
        });
      } catch {
        setReminderNotice('El descanso se guardó, pero no pudimos reconciliar su aviso local. Revisa los recordatorios antes de cerrar la app.');
      }
      delete actionOperationsRef.current[operationKey];
      setReloadKey((value) => value + 1);
    } catch (mutationError) {
      setActionErrors((current) => ({
        ...current,
        [habit.id]: getPracticeRepositoryErrorMessage(mutationError),
      }));
    } finally {
      setPendingHabitId(null);
    }
  }

  const activeCount = habits.filter((habit) => habit.effective_status === 'active').length;
  const scheduledCount = habits.filter((habit) => habit.effective_status === 'scheduled').length;
  const availablePosition = firstAvailableActivePosition(habits);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.flex}>
        <ScrollView accessibilityElementsHidden={modalVisible} importantForAccessibility={modalVisible ? 'no-hide-descendants' : 'auto'} contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>02 · DISCIPLINA</Text>
            <Text accessibilityRole="header" style={styles.title}>Tu protocolo</Text>
            <Text style={styles.subtitle}>{activePlan.outcome_statement}</Text>
          </View>

          <View style={styles.identityCard}>
            <Text style={styles.cardLabel}>IDENTIDAD</Text>
            <Text style={styles.identity}>{activePlan.identity_statement}</Text>
            <Text style={styles.why}>{activePlan.why_statement}</Text>
          </View>

          <View style={styles.reminderPolicyCard}>
            <View style={styles.reminderPolicyHeader}>
              <View style={styles.reminderPolicyCopy}>
                <Text accessibilityRole="header" style={styles.reminderPolicyTitle}>Política de avisos</Text>
                <Text style={styles.reminderPolicyDescription}>Máximo dos avisos por día. Sin contenido privado en pantalla bloqueada.</Text>
              </View>
              <TouchableOpacity
                accessibilityRole="switch"
                accessibilityLabel={`${reminderPreferences.globalEnabled ? 'Desactivar' : 'Activar'} todos los recordatorios`}
                accessibilityState={{ checked: reminderPreferences.globalEnabled, disabled: savingReminderPreferences }}
                style={[styles.reminderButton, reminderPreferences.globalEnabled && styles.reminderButtonEnabled, savingReminderPreferences && styles.disabled]}
                onPress={toggleGlobalReminders}
                disabled={savingReminderPreferences}
              >
                <Text style={styles.reminderButtonText}>{reminderPreferences.globalEnabled ? 'Global activo' : 'Global pausado'}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.quietHoursLabel}>Horas de silencio</Text>
            <View style={styles.quietHoursRow}>
              <TextInput
                accessibilityLabel="Inicio de horas de silencio"
                style={styles.quietHoursInput}
                value={quietHoursDraft.start}
                onChangeText={(start) => setQuietHoursDraft((current) => ({ ...current, start }))}
                maxLength={5}
                keyboardType="numbers-and-punctuation"
                placeholder="22:00"
                placeholderTextColor={colors.text.tertiary}
              />
              <Text style={styles.quietHoursSeparator}>a</Text>
              <TextInput
                accessibilityLabel="Fin de horas de silencio"
                style={styles.quietHoursInput}
                value={quietHoursDraft.end}
                onChangeText={(end) => setQuietHoursDraft((current) => ({ ...current, end }))}
                maxLength={5}
                keyboardType="numbers-and-punctuation"
                placeholder="07:00"
                placeholderTextColor={colors.text.tertiary}
              />
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Guardar horas de silencio"
                style={[styles.quietHoursSave, savingReminderPreferences && styles.disabled]}
                onPress={saveQuietHours}
                disabled={savingReminderPreferences}
              >
                {savingReminderPreferences ? <ActivityIndicator size="small" color={colors.text.primary} /> : <Text style={styles.quietHoursSaveText}>Guardar</Text>}
              </TouchableOpacity>
            </View>

            {reminderPreferences.timezoneChangeRequired ? (
              <View style={styles.timezoneWarning}>
                <Text accessibilityRole="alert" style={styles.timezoneWarningText}>
                  El dispositivo cambió de {reminderPreferences.acknowledgedTimezone} a {reminderPreferences.deviceTimezone}. Los avisos están pausados.
                </Text>
                <TouchableOpacity accessibilityRole="button" style={styles.timezoneButton} onPress={acknowledgeTimezoneChange} disabled={savingReminderPreferences}>
                  <Text style={styles.timezoneButtonText}>Recalcular en esta zona</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          {reminderNotice ? (
            <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.reminderNotice}>
              {reminderNotice}
            </Text>
          ) : null}

          {loading ? (
            <View style={styles.centerState} accessible accessibilityLabel="Cargando protocolo">
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

          {!loading && !error ? (
            <View style={styles.list}>
              <View style={styles.listHeader}>
                <View style={styles.listHeaderCopy}>
                  <Text ref={listTitleRef} accessible accessibilityRole="header" style={styles.sectionTitle}>Compromisos vigentes</Text>
                  <Text style={styles.count}>
                    {activeCount} activos{scheduledCount ? ` · ${scheduledCount} ${scheduledCount === 1 ? 'programado' : 'programados'}` : ''} · máximo 3
                  </Text>
                </View>
                {availablePosition != null ? (
                  <TouchableOpacity accessibilityRole="button" style={styles.addButton} onPress={openCreate}>
                    <Text style={styles.addButtonText}>Añadir</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {habits.map((habit, index) => {
                const pending = pendingHabitId === habit.id;
                const actionError = actionErrors[habit.id];
                const tomorrowRest = tomorrowExceptions[habit.id];
                const reminderLineageId = lineageIdOf(habit);
                const reminderStatus = reminderStatuses[reminderLineageId];
                const reminderPending = pendingReminderLineage === reminderLineageId;
                const effectiveStatus = habit.effective_status || habit.status;
                const hasPendingChange = Boolean(habit.pending_change);
                const canDisableCurrentReminder = reminderStatus?.enabled === true
                  && reminderStatus?.code !== 'permission_required';
                const reminderToggleDisabled = reminderPending
                  || (hasPendingChange && !canDisableCurrentReminder);
                const scheduledTomorrow = effectiveStatus === 'active'
                  && isCommitmentScheduled(habit, nextEffectiveOn);
                return (
                  <View key={habit.id} style={styles.habitCard}>
                    <View style={styles.habitHeader}>
                      <Text style={styles.habitIndex}>0{index + 1}</Text>
                      <Text style={styles.status}>{effectiveStatus === 'active' ? 'ACTIVO' : effectiveStatus === 'scheduled' ? 'PROGRAMADO' : 'PAUSADO'}</Text>
                    </View>
                    <Text style={styles.habitName}>{habit.name}</Text>
                    <Text style={styles.minimum}>Versión mínima · {habit.minimum_action}</Text>
                    <View style={styles.metaRow}>
                      <Text style={styles.metaLabel}>FRECUENCIA</Text>
                      <Text style={styles.metaValue}>{formatScheduledWeekdays(habit.scheduled_weekdays)}</Text>
                    </View>
                    {habit.reminder_time ? (
                      <>
                        <View style={styles.metaRow}>
                          <Text style={styles.metaLabel}>HORARIO ELEGIDO</Text>
                          <Text style={styles.metaValue}>{habit.reminder_time}</Text>
                        </View>
                        <View style={styles.reminderCard}>
                          <View style={styles.reminderCopy}>
                            <Text style={styles.reminderTitle}>Recordatorio local</Text>
                            <Text style={styles.reminderStatus}>{reminderStatusLabel(reminderStatus)}</Text>
                          </View>
                          <TouchableOpacity
                            accessibilityRole="switch"
                            accessibilityLabel={`${reminderStatus?.code === 'permission_required' ? 'Solicitar permiso para' : reminderStatus?.enabled ? 'Desactivar' : 'Activar'} recordatorio para ${habit.name}`}
                            accessibilityState={{ checked: reminderStatus?.enabled === true, disabled: reminderToggleDisabled }}
                            style={[styles.reminderButton, reminderStatus?.enabled && styles.reminderButtonEnabled, reminderPending && styles.disabled]}
                            onPress={() => toggleHabitReminder(habit)}
                            disabled={reminderToggleDisabled}
                          >
                            {reminderPending ? (
                              <ActivityIndicator size="small" color={colors.text.primary} />
                            ) : (
                              <Text style={styles.reminderButtonText}>{reminderStatus?.code === 'permission_required' ? 'Dar permiso' : reminderStatus?.enabled ? 'Desactivar' : 'Activar'}</Text>
                            )}
                          </TouchableOpacity>
                          {reminderStatus?.code === 'permission_denied' ? (
                            <TouchableOpacity accessibilityRole="button" style={styles.settingsButton} onPress={() => Linking.openSettings().catch(() => {})}>
                              <Text style={styles.settingsButtonText}>Abrir ajustes</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </>
                    ) : null}

                    <View style={styles.actionsRow}>
                      {effectiveStatus === 'active' ? (
                        <>
                          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Editar ${habit.name}`} style={styles.textAction} onPress={(event) => openEdit(habit, event)} disabled={pending || hasPendingChange}>
                            <Text style={styles.textActionPrimary}>Editar</Text>
                          </TouchableOpacity>
                          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Pausar ${habit.name}`} style={styles.textAction} onPress={() => changeStatus(habit, 'paused')} disabled={pending || hasPendingChange}>
                            <Text style={styles.textActionText}>Pausar</Text>
                          </TouchableOpacity>
                        </>
                      ) : effectiveStatus === 'paused' ? (
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Reactivar ${habit.name}`} style={styles.textAction} onPress={() => changeStatus(habit, 'active')} disabled={pending || hasPendingChange || availablePosition == null}>
                          <Text style={styles.textActionPrimary}>Reactivar</Text>
                        </TouchableOpacity>
                      ) : null}
                      {effectiveStatus !== 'scheduled' ? (
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Archivar ${habit.name}`} style={styles.textAction} onPress={() => confirmArchive(habit)} disabled={pending || hasPendingChange}>
                          <Text style={styles.archiveText}>Archivar</Text>
                        </TouchableOpacity>
                      ) : null}
                      {scheduledTomorrow || tomorrowRest ? (
                        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${tomorrowRest ? 'Quitar descanso de' : 'Planificar descanso para'} ${habit.name}, ${nextEffectiveOn}`} style={styles.textAction} onPress={() => toggleTomorrowRest(habit)} disabled={pending || hasPendingChange}>
                          <Text style={styles.textActionText}>{tomorrowRest ? 'Quitar descanso' : `Descanso ${nextEffectiveOn}`}</Text>
                        </TouchableOpacity>
                      ) : null}
                      {pending ? <ActivityIndicator size="small" color={colors.accent.primary} /> : null}
                    </View>

                    {hasPendingChange ? (
                      <Text accessibilityLiveRegion="polite" style={styles.pendingChangeText}>
                        Cambio programado para {habit.pending_change_effective_on}. Podrás volver a ajustar este compromiso cuando entre en vigor.
                      </Text>
                    ) : null}

                    {effectiveStatus === 'paused' && availablePosition == null ? (
                      <Text style={styles.slotLimitText}>
                        Para reactivarlo, primero libera uno de los tres cupos activos o programados.
                      </Text>
                    ) : null}

                    {actionError ? (
                      <View style={styles.actionErrorCard}>
                        <Text accessibilityRole="alert" style={styles.error}>{actionError}</Text>
                        <Text style={styles.retryHint}>Repite la misma acción para reutilizar su identificador seguro.</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}
        </ScrollView>

        <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={closeModal} onShow={() => focusAccessibilityElement(modalTitleRef)}>
          <SafeAreaView style={styles.modalSafeArea}>
            <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View accessibilityViewIsModal importantForAccessibility="yes" style={styles.modalCard}>
                <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
                  <Text style={styles.modalEyebrow}>{editingHabit ? 'NUEVA VERSIÓN' : 'NUEVO COMPROMISO'}</Text>
                  <Text ref={modalTitleRef} accessible accessibilityRole="header" style={styles.modalTitle}>{editingHabit ? 'Ajusta sin reescribir.' : 'Define una acción.'}</Text>
                  {editingHabit ? <Text style={styles.modalDescription}>El cambio será efectivo el {nextEffectiveOn}; la configuración anterior conservará intacta la evidencia de hoy.</Text> : null}

                  {formErrors.length ? (
                    <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.formErrorList}>
                      {formErrors.map((message, index) => <Text key={`${index}-${message}`} style={styles.error}>• {message}</Text>)}
                    </View>
                  ) : null}

                  <Text style={styles.label}>Acción observable</Text>
                  <TextInput accessibilityLabel="Acción observable" style={styles.input} value={form.name} onChangeText={(value) => updateForm('name', value)} maxLength={80} placeholder="Ej. Caminar 20 minutos" placeholderTextColor={colors.text.tertiary} returnKeyType="next" onSubmitEditing={() => minimumInputRef.current?.focus()} />
                  <Text style={styles.label}>Versión mínima</Text>
                  <TextInput ref={minimumInputRef} accessibilityLabel="Versión mínima" style={styles.input} value={form.minimum_action} onChangeText={(value) => updateForm('minimum_action', value)} maxLength={120} placeholder="Ej. Caminar cinco minutos" placeholderTextColor={colors.text.tertiary} returnKeyType="done" />
                  <Text style={styles.label}>Días programados</Text>
                  <View style={styles.weekdays}>
                    {WEEKDAYS.map((day) => {
                      const selected = form.scheduled_weekdays.includes(day.value);
                      return (
                        <TouchableOpacity key={day.value} accessibilityRole="checkbox" accessibilityLabel={day.label} accessibilityState={{ checked: selected }} style={[styles.weekday, selected && styles.weekdaySelected]} onPress={() => toggleWeekday(day.value)}>
                          <Text style={[styles.weekdayText, selected && styles.weekdayTextSelected]}>{day.short}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={styles.label}>Horario deseado · opcional</Text>
                  <TextInput accessibilityLabel="Horario opcional, formato veinticuatro horas" style={styles.input} value={form.reminder_time} onChangeText={(value) => updateForm('reminder_time', value)} maxLength={5} keyboardType="numbers-and-punctuation" placeholder="HH:MM" placeholderTextColor={colors.text.tertiary} />

                  {saveError ? <Text accessibilityRole="alert" style={[styles.error, styles.saveError]}>{saveError}</Text> : null}

                  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Guardar configuración" accessibilityState={{ disabled: saving, busy: saving }} style={[styles.primaryButton, saving && styles.disabled]} onPress={saveHabit} disabled={saving}>
                    {saving ? <ActivityIndicator color={colors.text.inverse} /> : <Text style={styles.primaryButtonText}>Guardar</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity accessibilityRole="button" style={styles.cancelButton} onPress={closeModal} disabled={saving}>
                    <Text style={styles.cancelButtonText}>Cancelar</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: colors.background.primary },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  header: { marginBottom: spacing.lg },
  eyebrow: { color: colors.accent.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.xs, letterSpacing: 2, marginBottom: spacing.sm },
  title: { color: colors.text.primary, fontFamily: typography.fonts.bold, fontSize: typography.sizes.xxl, lineHeight: typography.lineHeights.xxl },
  subtitle: { color: colors.text.secondary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.md, lineHeight: typography.lineHeights.md, marginTop: spacing.sm },
  identityCard: { borderLeftWidth: 2, borderLeftColor: colors.accent.primary, paddingLeft: spacing.md, marginBottom: spacing.lg },
  cardLabel: { color: colors.accent.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.xs, letterSpacing: 1.4 },
  identity: { color: colors.text.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.lg, lineHeight: typography.lineHeights.lg, marginTop: spacing.xs },
  why: { color: colors.text.secondary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm, marginTop: spacing.sm },
  centerState: { minHeight: 220, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.error, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm, textAlign: 'left' },
  retryButton: { minHeight: 48, justifyContent: 'center', marginTop: spacing.sm },
  retryText: { color: colors.text.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.sm },
  reminderNotice: { color: colors.text.secondary, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm, borderWidth: 1, borderColor: colors.border.default, borderRadius: 12, padding: spacing.md, marginBottom: spacing.md },
  reminderPolicyCard: { borderWidth: 1, borderColor: colors.border.default, borderRadius: 14, backgroundColor: colors.background.secondary, padding: spacing.md, marginBottom: spacing.md },
  reminderPolicyHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  reminderPolicyCopy: { flexGrow: 1, flexShrink: 1, minWidth: 180 },
  reminderPolicyTitle: { color: colors.text.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.sm },
  reminderPolicyDescription: { color: colors.text.secondary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.xs, lineHeight: typography.lineHeights.xs, marginTop: spacing.xs },
  quietHoursLabel: { color: colors.text.secondary, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm, marginTop: spacing.md, marginBottom: spacing.xs },
  quietHoursRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  quietHoursInput: { width: 82, minHeight: 44, borderWidth: 1, borderColor: colors.border.default, borderRadius: 10, color: colors.text.primary, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm, textAlign: 'center', paddingHorizontal: spacing.sm },
  quietHoursSeparator: { color: colors.text.tertiary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.sm },
  quietHoursSave: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border.strong, borderRadius: 10, paddingHorizontal: spacing.md },
  quietHoursSaveText: { color: colors.text.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.sm },
  timezoneWarning: { borderTopWidth: 1, borderTopColor: colors.border.default, marginTop: spacing.md, paddingTop: spacing.md },
  timezoneWarningText: { color: colors.warning, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm },
  timezoneButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginTop: spacing.xs },
  timezoneButtonText: { color: colors.accent.light, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.sm },
  list: { marginTop: spacing.sm },
  listHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.md },
  listHeaderCopy: { flexShrink: 1 },
  sectionTitle: { flexShrink: 1, color: colors.text.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.lg },
  count: { color: colors.text.tertiary, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm, marginTop: spacing.xs },
  addButton: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: colors.border.strong, borderRadius: 10, paddingHorizontal: spacing.md },
  addButtonText: { color: colors.text.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.sm },
  habitCard: { borderWidth: 1, borderColor: colors.border.default, borderRadius: 18, backgroundColor: colors.background.card, padding: spacing.lg, marginBottom: spacing.md },
  habitHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  habitIndex: { color: colors.accent.primary, fontFamily: typography.fonts.bold, fontSize: typography.sizes.lg },
  status: { color: colors.text.tertiary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.xs, letterSpacing: 1.2 },
  habitName: { color: colors.text.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.lg, lineHeight: typography.lineHeights.lg, marginTop: spacing.md },
  minimum: { color: colors.text.secondary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm, marginTop: spacing.xs },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border.subtle, paddingTop: spacing.sm, marginTop: spacing.md },
  metaLabel: { color: colors.text.tertiary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.xs, letterSpacing: 1 },
  metaValue: { flexShrink: 1, color: colors.text.secondary, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm, textAlign: 'right' },
  reminderCard: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border.subtle, paddingTop: spacing.md, marginTop: spacing.md },
  reminderCopy: { flexGrow: 1, flexShrink: 1, minWidth: 150 },
  reminderTitle: { color: colors.text.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.sm },
  reminderStatus: { color: colors.text.tertiary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.xs, lineHeight: typography.lineHeights.xs, marginTop: spacing.xs },
  reminderButton: { minWidth: 96, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border.strong, borderRadius: 12, paddingHorizontal: spacing.sm },
  reminderButtonEnabled: { borderColor: colors.accent.primary, backgroundColor: colors.accent.muted },
  reminderButtonText: { color: colors.text.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.sm },
  settingsButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  settingsButtonText: { color: colors.accent.light, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm },
  actionsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.border.subtle, marginTop: spacing.md, paddingTop: spacing.sm },
  textAction: { minWidth: 44, minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs },
  textActionPrimary: { color: colors.accent.light, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.sm },
  textActionText: { color: colors.text.secondary, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm },
  archiveText: { color: colors.error, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm },
  pendingChangeText: { color: colors.warning, fontFamily: typography.fonts.medium, fontSize: typography.sizes.xs, lineHeight: typography.lineHeights.xs, marginTop: spacing.sm },
  slotLimitText: { color: colors.text.tertiary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.xs, lineHeight: typography.lineHeights.xs, marginTop: spacing.xs },
  actionErrorCard: { borderTopWidth: 1, borderTopColor: colors.border.default, paddingTop: spacing.sm, marginTop: spacing.sm },
  retryHint: { color: colors.text.tertiary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.xs, lineHeight: typography.lineHeights.xs, marginTop: spacing.xs },
  modalSafeArea: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalCard: { maxHeight: '92%', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.background.secondary, overflow: 'hidden' },
  modalContent: { padding: spacing.lg, paddingBottom: spacing.xl },
  modalEyebrow: { color: colors.accent.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.xs, letterSpacing: 1.5, marginBottom: spacing.xs },
  modalTitle: { color: colors.text.primary, fontFamily: typography.fonts.bold, fontSize: typography.sizes.xl, lineHeight: typography.lineHeights.xl },
  modalDescription: { color: colors.text.secondary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm, marginTop: spacing.xs },
  formErrorList: { marginTop: spacing.md },
  label: { color: colors.text.secondary, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.border.default, borderRadius: 12, backgroundColor: colors.background.card, color: colors.text.primary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  weekdays: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  weekday: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border.default, borderRadius: 22, backgroundColor: colors.background.card },
  weekdaySelected: { borderColor: colors.accent.primary, backgroundColor: colors.accent.muted },
  weekdayText: { color: colors.text.secondary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.sm },
  weekdayTextSelected: { color: colors.accent.light },
  saveError: { marginTop: spacing.md },
  primaryButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.accent.primary, marginTop: spacing.lg },
  primaryButtonText: { color: colors.text.inverse, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.md },
  cancelButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  cancelButtonText: { color: colors.text.secondary, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm },
  disabled: { opacity: 0.55 },
});
