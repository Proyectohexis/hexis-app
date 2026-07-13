import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, typography } from '../../theme';
import QueueRecoveryNotice from '../../components/QueueRecoveryNotice';
import { signOut } from '../../lib/auth';
import { useAppSession } from '../../context/AppSessionContext';
import { asyncStorageCheckInQueue } from '../../data/sync/asyncStorageCheckInQueue';
import { createOperationId } from '../../lib/operationId';
import { trackProductEvent } from '../../analytics/analytics';
import {
  DELETE_CONFIRMATION,
  deleteCurrentAccount,
  finalizeDeletedAccount,
  getAccountExport,
  getPrivacyErrorMessage,
  shareAccountExport,
} from '../../data/repositories/privacyRepository';

export default function AccountScreen({ navigation }) {
  const { activePlan, user } = useAppSession();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [queueReady, setQueueReady] = useState(false);
  const [queueRecoveryNotice, setQueueRecoveryNotice] = useState(null);
  const [queueUnavailable, setQueueUnavailable] = useState(false);
  const [queueRecoveryError, setQueueRecoveryError] = useState('');
  const [acknowledgingQueueRecovery, setAcknowledgingQueueRecovery] = useState(false);
  const [privacyAction, setPrivacyAction] = useState('');
  const [privacyMessage, setPrivacyMessage] = useState('');
  const [showDeletion, setShowDeletion] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const deleteOperationRef = useRef(createOperationId());

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') setDeletePassword('');
    });
    return () => subscription.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setQueueReady(false);
      asyncStorageCheckInQueue.list({ userId: user?.id })
        .then(({ items, recoveryNotice }) => {
          if (active) {
            setPendingCount(items.filter((item) => item.user_id === user?.id).length);
            setQueueRecoveryNotice(recoveryNotice);
            setQueueUnavailable(false);
            setQueueRecoveryError('');
            setQueueReady(true);
          }
        })
        .catch(() => {
          if (active) {
            setQueueRecoveryNotice(null);
            setQueueUnavailable(true);
            setError('No pudimos verificar los cambios guardados sin conexión antes de cerrar sesión.');
          }
        });
      return () => { active = false; };
    }, [user?.id])
  );

  async function performSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError('');
    try {
      const { error: signOutError } = await signOut();
      if (signOutError) setError('No pudimos cerrar la sesión. Inténtalo de nuevo.');
    } catch {
      setError('No pudimos cerrar la sesión. Inténtalo de nuevo.');
    } finally {
      setSigningOut(false);
    }
  }

  function handleSignOut() {
    if (signingOut) return;
    if (!queueReady) {
      setError('No cerraremos la sesión hasta verificar los cambios guardados sin conexión en este dispositivo.');
      return;
    }
    if (!pendingCount) {
      performSignOut();
      return;
    }

    Alert.alert(
      'Hay evidencia sin sincronizar',
      `Cerrar sesión descartará ${pendingCount} ${pendingCount === 1 ? 'cambio local pendiente' : 'cambios locales pendientes'} de este dispositivo.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Ir a Hoy', onPress: () => navigation.navigate('Today') },
        { text: 'Cerrar y descartar', style: 'destructive', onPress: performSignOut },
      ],
    );
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

  async function exportAccount() {
    if (privacyAction) return;
    void trackProductEvent('export_requested', { network_state: 'unknown' });
    setPrivacyAction('export');
    setPrivacyMessage('');
    setError('');
    try {
      const result = await getAccountExport();
      if (result.error) throw result.error;
      const shared = await shareAccountExport(result.data);
      if (shared.error) throw shared.error;
      setPrivacyMessage('El menú del dispositivo se cerró. Si elegiste un destino, revisa allí si la copia se guardó o compartió.');
    } catch (exportError) {
      setError(getPrivacyErrorMessage(exportError));
    } finally {
      setPrivacyAction('');
    }
  }

  function updateDeletionField(setter, value) {
    deleteOperationRef.current = createOperationId();
    setError('');
    setter(value);
  }

  async function performAccountDeletion() {
    if (privacyAction || !user?.id) return;
    setPrivacyAction('delete');
    setPrivacyMessage('');
    setError('');
    try {
      const result = await deleteCurrentAccount({
        password: deletePassword,
        confirmation: deleteConfirmation,
        operationId: deleteOperationRef.current,
      });
      if (result.error) throw result.error;
      setDeletePassword('');
      setDeleteConfirmation('');
      setShowDeletion(false);
      const cleanup = await finalizeDeletedAccount(user.id);
      void trackProductEvent('account_deleted', {
        local_cleanup: cleanup.warnings.length ? 'residuals_detected' : 'complete',
      });
      if (cleanup.warnings.length) {
        Alert.alert(
          'Cuenta eliminada con limpieza pendiente',
          'Tu acceso y el contenido de tu cuenta fueron eliminados, pero este dispositivo no pudo borrar toda la información local. Cierra HEXIS y elimina los datos de la app desde los ajustes antes de prestarlo o compartirlo. Para reconocer reintentos, se conserva un comprobante mínimo sin tu correo ni contenido; todavía no podemos garantizar cuándo se eliminará.',
        );
      } else {
        Alert.alert(
          'Cuenta eliminada',
          'Tu acceso, el contenido de tu cuenta y la información local de este dispositivo fueron eliminados. Para reconocer reintentos, se conserva un comprobante mínimo sin tu correo ni contenido; todavía no podemos garantizar cuándo se eliminará.',
        );
      }
    } catch (deletionError) {
      setError(getPrivacyErrorMessage(deletionError));
    } finally {
      setDeletePassword('');
      setPrivacyAction('');
    }
  }

  function confirmAccountDeletion() {
    if (privacyAction) return;
    if (!queueReady) {
      setError('Espera mientras verificamos los cambios guardados sin conexión antes de eliminar la cuenta.');
      return;
    }
    if (pendingCount) {
      setError('Conéctate para enviar tus cambios pendientes o descártalos antes de eliminar la cuenta.');
      return;
    }
    if (!deletePassword || deleteConfirmation !== DELETE_CONFIRMATION) {
      setError(`Escribe tu contraseña y la frase exacta ${DELETE_CONFIRMATION}.`);
      return;
    }
    Alert.alert(
      'Eliminar cuenta',
      'Esta acción elimina tu acceso y el contenido de tu cuenta; no se puede deshacer. Para reconocer un reintento, queda un comprobante mínimo sin tu correo ni contenido. Todavía no podemos garantizar cuándo se eliminará ni cómo se tratan las copias de respaldo, así que usa solo datos de prueba.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar cuenta', style: 'destructive', onPress: performAccountDeletion },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View>
          <Text style={styles.eyebrow}>CUENTA</Text>
          <Text accessibilityRole="header" style={styles.title}>Tu cuenta</Text>
          <Text style={styles.email}>{user?.email || ''}</Text>
        </View>

        <QueueRecoveryNotice
          notice={queueRecoveryNotice}
          unavailable={queueUnavailable}
          acknowledging={acknowledgingQueueRecovery}
          error={queueRecoveryError}
          onAcknowledge={acknowledgeQueueRecovery}
          style={styles.queueRecoveryNotice}
        />

        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

        {user ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>IDENTIDAD ELEGIDA</Text>
            <Text style={styles.identity}>{activePlan.identity_statement}</Text>
            <View style={styles.divider} />
            <Text style={styles.metaLabel}>Meta prioritaria</Text>
            <Text style={styles.metaValue}>{activePlan.outcome_statement}</Text>
            <Text style={styles.metaLabel}>Zona histórica del ciclo</Text>
            <Text style={styles.metaValue}>{activePlan.timezone}</Text>
          </View>
        ) : null}

        <View style={styles.privacyCard}>
          <Text accessibilityRole="header" style={styles.privacyTitle}>Tus datos</Text>
          <Text style={styles.privacyCopy}>
            Puedes preparar una copia de tus datos o eliminar tu acceso y el contenido de tu cuenta.
            Necesitas conexión para completar cualquiera de las dos acciones.
          </Text>
          {pendingCount ? (
            <Text accessibilityRole="alert" style={styles.pendingWarning}>
              {pendingCount} {pendingCount === 1 ? 'cambio pendiente sin conexión' : 'cambios pendientes sin conexión'}.
            </Text>
          ) : null}
        </View>

        {privacyMessage ? (
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.successMessage}>{privacyMessage}</Text>
        ) : null}

        <View style={styles.privacyControls}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Exportar una copia de mis datos"
            accessibilityState={{ disabled: Boolean(privacyAction), busy: privacyAction === 'export' }}
            style={[styles.dataButton, privacyAction && styles.disabled]}
            onPress={exportAccount}
            disabled={Boolean(privacyAction)}
          >
            {privacyAction === 'export' ? <ActivityIndicator color={colors.text.primary} /> : <Text style={styles.dataButtonText}>Exportar mis datos</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ expanded: showDeletion, disabled: Boolean(privacyAction) }}
            style={styles.deleteToggle}
            onPress={() => {
              setError('');
              if (showDeletion) {
                setDeletePassword('');
                setDeleteConfirmation('');
              }
              setShowDeletion(!showDeletion);
            }}
            disabled={Boolean(privacyAction)}
          >
            <Text style={styles.deleteToggleText}>{showDeletion ? 'Cancelar eliminación' : 'Eliminar mi cuenta'}</Text>
          </TouchableOpacity>

          {showDeletion ? (
            <View style={styles.deletionForm}>
              <Text accessibilityRole="header" style={styles.deletionTitle}>Confirmación reforzada</Text>
              <Text style={styles.deletionCopy}>
                Escribe tu contraseña actual y la frase exacta {DELETE_CONFIRMATION}. La contraseña
                se envía para comprobar que eres tú; no se guarda, registra ni devuelve en la respuesta.
              </Text>
              <Text style={styles.inputLabel}>Contraseña actual</Text>
              <TextInput
                accessibilityLabel="Contraseña actual para eliminar la cuenta"
                style={styles.input}
                value={deletePassword}
                onChangeText={(value) => updateDeletionField(setDeletePassword, value)}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                maxLength={128}
              />
              <Text style={styles.inputLabel}>Frase de confirmación</Text>
              <TextInput
                accessibilityLabel={`Escribe ${DELETE_CONFIRMATION} para confirmar`}
                style={styles.input}
                value={deleteConfirmation}
                onChangeText={(value) => updateDeletionField(setDeleteConfirmation, value)}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={DELETE_CONFIRMATION.length}
                placeholder={DELETE_CONFIRMATION}
                placeholderTextColor={colors.text.tertiary}
              />
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Eliminar cuenta"
                accessibilityState={{ disabled: privacyAction === 'delete' || !queueReady || pendingCount > 0, busy: privacyAction === 'delete' }}
                style={[styles.destructiveButton, (privacyAction === 'delete' || !queueReady || pendingCount > 0) && styles.disabled]}
                onPress={confirmAccountDeletion}
                disabled={privacyAction === 'delete' || !queueReady || pendingCount > 0}
              >
                {privacyAction === 'delete' ? <ActivityIndicator color={colors.text.primary} /> : <Text style={styles.destructiveButtonText}>Eliminar cuenta</Text>}
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Cerrar sesión"
          accessibilityState={{ disabled: signingOut || !queueReady, busy: signingOut }}
          style={[styles.signOutButton, (signingOut || !queueReady) && styles.disabled]}
          onPress={handleSignOut}
          disabled={signingOut || !queueReady}
        >
          {signingOut ? (
            <ActivityIndicator color={colors.text.primary} />
          ) : (
            <Text style={styles.signOutText}>Cerrar sesión</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  email: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.regular,
    fontSize: typography.sizes.sm,
    marginTop: spacing.xs,
  },
  queueRecoveryNotice: { marginTop: spacing.lg },
  error: {
    color: colors.error,
    fontFamily: typography.fonts.medium,
    fontSize: typography.sizes.sm,
    marginTop: spacing.lg,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 16,
    backgroundColor: colors.background.card,
    padding: spacing.lg,
    marginTop: spacing.xl,
  },
  cardLabel: {
    color: colors.accent.primary,
    fontFamily: typography.fonts.semibold,
    fontSize: typography.sizes.xs,
    letterSpacing: 1.5,
  },
  identity: {
    color: colors.text.primary,
    fontFamily: typography.fonts.medium,
    fontSize: typography.sizes.lg,
    lineHeight: typography.lineHeights.lg,
    marginTop: spacing.sm,
  },
  divider: { height: 1, backgroundColor: colors.border.default, marginVertical: spacing.md },
  metaLabel: {
    color: colors.text.tertiary,
    fontFamily: typography.fonts.regular,
    fontSize: typography.sizes.xs,
  },
  metaValue: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.medium,
    fontSize: typography.sizes.sm,
    marginTop: spacing.xs,
  },
  privacyCard: {
    borderRadius: 14,
    backgroundColor: colors.background.secondary,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  privacyTitle: {
    color: colors.text.primary,
    fontFamily: typography.fonts.semibold,
    fontSize: typography.sizes.sm,
    marginBottom: spacing.xs,
  },
  privacyCopy: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.regular,
    fontSize: typography.sizes.sm,
    lineHeight: typography.lineHeights.sm,
  },
  pendingWarning: { color: colors.warning, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.sm, marginTop: spacing.sm },
  successMessage: { color: colors.success, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm, marginTop: spacing.md },
  privacyControls: {
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 14,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  dataButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border.strong,
    borderRadius: 12,
  },
  dataButtonText: {
    color: colors.text.primary,
    fontFamily: typography.fonts.semibold,
    fontSize: typography.sizes.md,
  },
  deleteToggle: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  deleteToggleText: { color: colors.error, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm },
  deletionForm: { borderTopWidth: 1, borderTopColor: colors.border.default, paddingTop: spacing.lg, marginTop: spacing.sm },
  deletionTitle: { color: colors.text.primary, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.lg },
  deletionCopy: { color: colors.text.secondary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.sm, lineHeight: typography.lineHeights.sm, marginTop: spacing.sm },
  inputLabel: { color: colors.text.secondary, fontFamily: typography.fonts.medium, fontSize: typography.sizes.sm, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.border.default, borderRadius: 12, backgroundColor: colors.background.secondary, color: colors.text.primary, fontFamily: typography.fonts.regular, fontSize: typography.sizes.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  destructiveButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.error, borderRadius: 12, marginTop: spacing.lg },
  destructiveButtonText: { color: colors.error, fontFamily: typography.fonts.semibold, fontSize: typography.sizes.md },
  signOutButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border.strong,
    borderRadius: 12,
    marginTop: spacing.xl,
  },
  signOutText: {
    color: colors.text.primary,
    fontFamily: typography.fonts.semibold,
    fontSize: typography.sizes.md,
  },
  disabled: { opacity: 0.55 },
});
