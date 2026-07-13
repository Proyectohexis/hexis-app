import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createNavigationContainerRef, DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import WelcomeScreen from '../screens/onboarding/WelcomeScreen';
import GoalScreen from '../screens/onboarding/GoalScreen';
import NameScreen from '../screens/onboarding/NameScreen';
import CheckEmailScreen from '../screens/auth/CheckEmailScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import RequestPasswordResetScreen from '../screens/auth/RequestPasswordResetScreen';
import ResetPasswordScreen from '../screens/auth/ResetPasswordScreen';
import PlanSetupScreen from '../screens/onboarding/PlanSetupScreen';
import TodayScreen from '../screens/today/TodayScreen';
import DisciplineScreen from '../screens/discipline/DisciplineScreen';
import TransformationScreen from '../screens/transformation/TransformationScreen';
import WeeklyReviewScreen from '../screens/review/WeeklyReviewScreen';
import AccountScreen from '../screens/account/AccountScreen';
import { colors, spacing, typography } from '../theme';
import { supabase, supabaseConfigurationError } from '../lib/supabase';
import { AppSessionProvider } from '../context/AppSessionContext';
import {
  reconcileUserHabitReminders,
  subscribeToLocalNotificationNavigation,
  suspendUserRemindersForTimezoneChange,
} from '../notifications/localReminders';
import { getActivePlan, getPlanRepositoryErrorMessage } from '../data/repositories/planRepository';
import { getPlanHabits, getScheduleExceptions } from '../data/repositories/practiceRepository';
import {
  PASSWORD_RECOVERY_REDIRECT_URL,
  consumePasswordRecoveryUrl,
  signOut,
} from '../lib/auth';
const { isRetryableTransportError } = require('../lib/networkErrors.cjs');
const { getDateKeyInTimeZone } = require('../lib/date.cjs');
const { selectHabitTimelineForDate } = require('../domain/habitVersionTimeline.cjs');
const { addDays } = require('../domain/dateKeys.cjs');
const { REMINDER_HORIZON_DAYS } = require('../notifications/localReminderCoordinator.cjs');

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const rootNavigationRef = createNavigationContainerRef();

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent.primary,
    background: colors.background.primary,
    card: colors.background.secondary,
    text: colors.text.primary,
    border: colors.border.subtle,
    notification: colors.error,
  },
};

const tabIcons = {
  Today: ['home', 'home-outline'],
  Habits: ['checkmark-circle', 'checkmark-circle-outline'],
  Progress: ['trending-up', 'trending-up-outline'],
  Review: ['reader', 'reader-outline'],
  Account: ['person', 'person-outline'],
};

function TabNavigator() {
  const { fontScale, width } = useWindowDimensions();
  const compactTabs = fontScale >= 1.5 || width < 360;
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarShowLabel: !compactTabs,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.accent.light,
        tabBarInactiveTintColor: colors.text.tertiary,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ color, focused, size }) => {
          const names = tabIcons[route.name];
          return <Ionicons name={names[focused ? 0 : 1]} color={color} size={size} />;
        },
      })}
    >
      <Tab.Screen name="Today" component={TodayScreen} options={{ tabBarLabel: 'Hoy', tabBarAccessibilityLabel: 'Hoy' }} />
      <Tab.Screen name="Habits" component={DisciplineScreen} options={{ tabBarLabel: 'Hábitos', tabBarAccessibilityLabel: 'Disciplina y hábitos' }} />
      <Tab.Screen name="Review" component={WeeklyReviewScreen} options={{ tabBarLabel: 'Revisión', tabBarAccessibilityLabel: 'Revisión semanal' }} />
      <Tab.Screen name="Progress" component={TransformationScreen} options={{ tabBarLabel: 'Métrica', tabBarAccessibilityLabel: 'Evidencia de transformación' }} />
      <Tab.Screen name="Account" component={AccountScreen} options={{ tabBarLabel: 'Cuenta', tabBarAccessibilityLabel: 'Cuenta' }} />
    </Tab.Navigator>
  );
}

function StatusScreen({ title, message, onRetry, retryLabel = 'Reintentar', onSecondary, secondaryLabel }) {
  return (
    <SafeAreaView style={styles.statusSafeArea}>
      <ScrollView contentContainerStyle={styles.statusContainer}>
        <Text style={styles.statusEyebrow}>HEXIS</Text>
        <Text accessibilityRole="header" style={styles.statusTitle}>{title}</Text>
        <Text style={styles.statusMessage}>{message}</Text>
        {onRetry ? (
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.retryButton}
            onPress={onRetry}
          >
            <Text style={styles.retryText}>{retryLabel}</Text>
          </TouchableOpacity>
        ) : null}
        {onSecondary ? (
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.secondaryAction}
            onPress={onSecondary}
          >
            <Text style={styles.secondaryActionText}>{secondaryLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function AppNavigator() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initializationError, setInitializationError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [activePlan, setActivePlan] = useState(null);
  const [planStatus, setPlanStatus] = useState('idle');
  const [planError, setPlanError] = useState('');
  const [planRetryCount, setPlanRetryCount] = useState(0);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryProcessing, setRecoveryProcessing] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const processedRecoveryUrlsRef = useRef(new Set());
  const recoveryInFlightRef = useRef(false);
  const retryRecoveryRef = useRef(null);
  const pendingNotificationRouteRef = useRef(null);

  const openNotificationRoute = useCallback((route) => {
    if (route !== 'Today') return;
    if (rootNavigationRef.isReady() && session && planStatus === 'ready') {
      pendingNotificationRouteRef.current = null;
      rootNavigationRef.navigate('Main', { screen: 'Today' });
    } else {
      pendingNotificationRouteRef.current = route;
    }
  }, [planStatus, session]);

  const flushPendingNotificationRoute = useCallback(() => {
    if (pendingNotificationRouteRef.current) {
      openNotificationRoute(pendingNotificationRouteRef.current);
    }
  }, [openNotificationRoute]);

  useEffect(() => subscribeToLocalNotificationNavigation(openNotificationRoute), [openNotificationRoute]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return undefined;
    const suspendIfTimezoneChanged = () => {
      suspendUserRemindersForTimezoneChange(userId).catch(() => {});
    };
    suspendIfTimezoneChanged();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') suspendIfTimezoneChanged();
    });
    return () => subscription.remove();
  }, [session?.user?.id]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || planStatus !== 'ready' || !activePlan?.id) return undefined;

    let disposed = false;
    let inFlight = false;
    let lastReconciledDate = null;

    const reconcileEffectiveReminders = async ({ force = false } = {}) => {
      if (disposed || inFlight) return;
      inFlight = true;
      try {
        await suspendUserRemindersForTimezoneChange(userId);
        const localDate = getDateKeyInTimeZone(new Date(), activePlan.timezone);
        if (!force && localDate === lastReconciledDate) return;

        const result = await getPlanHabits({
          userId,
          planId: activePlan.id,
          includeArchived: true,
        });
        if (disposed || result.error) return;

        const timeline = selectHabitTimelineForDate(result.data, localDate)
          .filter((habit) => !['archived', 'ended', 'scheduled'].includes(habit.effective_status));
        const exceptionsResult = await getScheduleExceptions({
          userId,
          habitIds: timeline.map((habit) => habit.id),
          from: localDate,
          through: addDays(localDate, REMINDER_HORIZON_DAYS - 1),
        });
        if (disposed || exceptionsResult.error) return;

        const habits = timeline.map((habit) => ({
          ...habit,
          status: habit.effective_status,
          excluded_dates: exceptionsResult.data
            .filter((exception) => exception.habit_id === habit.id)
            .map((exception) => exception.local_date),
        }));
        await reconcileUserHabitReminders({ userId, habits });
        lastReconciledDate = localDate;
      } catch {
        // La pantalla de Disciplina ofrece recuperación visible; aquí el sync es oportunista.
      } finally {
        inFlight = false;
      }
    };

    reconcileEffectiveReminders({ force: true });
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') reconcileEffectiveReminders({ force: true });
    });
    const dateBoundaryPoll = setInterval(() => reconcileEffectiveReminders(), 60 * 1000);

    return () => {
      disposed = true;
      subscription.remove();
      clearInterval(dateBoundaryPoll);
    };
  }, [activePlan?.id, activePlan?.timezone, planStatus, session?.user?.id]);

  useEffect(() => {
    flushPendingNotificationRoute();
  }, [flushPendingNotificationRoute, planStatus, session]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return undefined;
    }

    let active = true;

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setInitializationError('No se pudo restaurar la sesión. Revisa tu conexión e inténtalo de nuevo.');
        } else {
          setSession(data.session);
          setInitializationError(null);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setInitializationError('No se pudo leer la sesión segura. Reintenta; si continúa, reinicia la app.');
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
        setInitializationError(null);
        setPlanStatus(nextSession ? 'loading' : 'idle');
        if (!nextSession) {
          setActivePlan(null);
          setPlanError('');
        }
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [retryCount]);

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;

    async function handleRecoveryUrl(url, { force = false } = {}) {
      if (!url?.startsWith(PASSWORD_RECOVERY_REDIRECT_URL)) return;
      retryRecoveryRef.current = () => handleRecoveryUrl(url, { force: true });
      if ((!force && processedRecoveryUrlsRef.current.has(url)) || recoveryInFlightRef.current) return;
      recoveryInFlightRef.current = true;
      setRecoveryProcessing(true);
      setRecoveryError('');
      let error;
      try {
        ({ error } = await consumePasswordRecoveryUrl(url));
      } catch {
        error = { code: 'recovery_callback_failed' };
      }
      if (active) {
        if (error) {
          const retryable = error.code === 'recovery_callback_failed' || isRetryableTransportError(error);
          if (!retryable) processedRecoveryUrlsRef.current.add(url);
          setRecoveryMode(false);
          setRecoveryError(retryable
            ? 'No pudimos verificar el enlace por un problema temporal. Puedes reintentar el mismo enlace.'
            : 'El enlace de recuperación no es válido o ya expiró. Puedes reintentarlo o solicitar uno nuevo.');
        } else {
          processedRecoveryUrlsRef.current.add(url);
          setRecoveryMode(true);
        }
        setRecoveryProcessing(false);
      }
      recoveryInFlightRef.current = false;
    }

    Linking.getInitialURL()
      .then(handleRecoveryUrl)
      .catch(() => {
        if (active) setRecoveryError('No pudimos leer el enlace de recuperación. Solicita uno nuevo.');
      });
    const subscription = Linking.addEventListener('url', ({ url }) => handleRecoveryUrl(url));

    return () => {
      active = false;
      retryRecoveryRef.current = null;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setActivePlan(null);
      setPlanError('');
      setPlanStatus('idle');
      return undefined;
    }

    let active = true;
    setPlanStatus('loading');
    setPlanError('');

    getActivePlan(userId)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setActivePlan(null);
          setPlanError(getPlanRepositoryErrorMessage(error));
          setPlanStatus('error');
          return;
        }

        setActivePlan(data || null);
        setPlanStatus(data ? 'ready' : 'missing');
      })
      .catch((error) => {
        if (!active) return;
        setActivePlan(null);
        setPlanError(getPlanRepositoryErrorMessage(error));
        setPlanStatus('error');
      });

    return () => {
      active = false;
    };
  }, [planRetryCount, session?.user?.id]);

  const sessionContext = useMemo(() => ({
    session,
    user: session?.user || null,
    activePlan,
    setActivePlan,
    refreshPlan: () => setPlanRetryCount((value) => value + 1),
  }), [activePlan, session]);

  if (supabaseConfigurationError) {
    return (
      <StatusScreen
        title="Configuración pendiente"
        message={`${supabaseConfigurationError} Copia .env.example a .env, completa los valores y reinicia Expo.`}
      />
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer} accessible accessibilityLabel="Cargando HEXIS">
        <ActivityIndicator color={colors.accent.primary} />
      </View>
    );
  }

  if (initializationError) {
    return (
      <StatusScreen
        title="No pudimos iniciar HEXIS"
        message={initializationError}
        onRetry={() => {
          setLoading(true);
          setRetryCount((value) => value + 1);
        }}
      />
    );
  }

  if (recoveryProcessing) {
    return (
      <View style={styles.loadingContainer} accessible accessibilityLabel="Verificando enlace de recuperación">
        <ActivityIndicator color={colors.accent.primary} />
      </View>
    );
  }

  if (recoveryError) {
    return (
      <StatusScreen
        title="Enlace no disponible"
        message={recoveryError}
        onRetry={() => retryRecoveryRef.current?.()}
        retryLabel="Reintentar enlace"
        onSecondary={() => setRecoveryError('')}
        secondaryLabel="Volver"
      />
    );
  }

  if (recoveryMode) {
    return (
      <NavigationContainer theme={navigationTheme}>
        <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: styles.stackContent }}>
          <Stack.Screen name="ResetPassword">
            {(props) => (
              <ResetPasswordScreen
                {...props}
                onExitRecovery={() => {
                  setRecoveryMode(false);
                  setRecoveryError('');
                }}
              />
            )}
          </Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  if (session && (planStatus === 'idle' || planStatus === 'loading')) {
    return (
      <View style={styles.loadingContainer} accessible accessibilityLabel="Cargando tu plan activo">
        <ActivityIndicator color={colors.accent.primary} />
      </View>
    );
  }

  if (session && planStatus === 'error') {
    return (
      <StatusScreen
        title="Backend pendiente"
        message={planError}
        onRetry={() => setPlanRetryCount((value) => value + 1)}
        onSecondary={() => signOut()}
        secondaryLabel="Cerrar sesión"
      />
    );
  }

  return (
    <NavigationContainer ref={rootNavigationRef} theme={navigationTheme} onReady={flushPendingNotificationRoute}>
      <AppSessionProvider value={sessionContext}>
        <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: styles.stackContent }}>
          {session ? (
            planStatus === 'missing' ? (
              <Stack.Screen name="PlanSetup">
                {() => (
                  <PlanSetupScreen
                    user={session.user}
                    onPlanCreated={(plan) => {
                      setActivePlan(plan);
                      setPlanStatus('ready');
                    }}
                  />
                )}
              </Stack.Screen>
            ) : (
              <Stack.Screen name="Main" component={TabNavigator} />
            )
          ) : (
            <>
              <Stack.Screen name="Welcome" component={WelcomeScreen} />
              <Stack.Screen name="Goal" component={GoalScreen} />
              <Stack.Screen name="Name" component={NameScreen} />
              <Stack.Screen name="CheckEmail" component={CheckEmailScreen} />
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="RequestPasswordReset" component={RequestPasswordResetScreen} />
            </>
          )}
        </Stack.Navigator>
      </AppSessionProvider>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  stackContent: { backgroundColor: colors.background.primary },
  tabBar: {
    backgroundColor: colors.background.secondary,
    borderTopColor: colors.border.default,
    paddingTop: spacing.xs,
  },
  tabLabel: {
    fontFamily: typography.fonts.medium,
    fontSize: typography.sizes.xs,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.primary,
  },
  statusSafeArea: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  statusContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: colors.background.primary,
  },
  statusEyebrow: {
    color: colors.accent.primary,
    fontFamily: typography.fonts.semibold,
    fontSize: typography.sizes.xs,
    letterSpacing: 3,
    marginBottom: spacing.sm,
  },
  statusTitle: {
    color: colors.text.primary,
    fontFamily: typography.fonts.bold,
    fontSize: typography.sizes.xxl,
    lineHeight: typography.lineHeights.xxl,
    marginBottom: spacing.sm,
  },
  statusMessage: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.regular,
    fontSize: typography.sizes.md,
    lineHeight: typography.lineHeights.md,
  },
  retryButton: {
    alignSelf: 'flex-start',
    minHeight: 48,
    justifyContent: 'center',
    backgroundColor: colors.accent.primary,
    borderRadius: 12,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  retryText: {
    color: colors.text.inverse,
    fontFamily: typography.fonts.semibold,
    fontSize: typography.sizes.md,
  },
  secondaryAction: {
    alignSelf: 'flex-start',
    minWidth: 44,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    marginTop: spacing.sm,
  },
  secondaryActionText: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.medium,
    fontSize: typography.sizes.sm,
  },
});
