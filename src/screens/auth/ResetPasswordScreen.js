import { useEffect, useRef, useState } from 'react';
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
import { completePasswordReset } from '../../lib/auth';
import { colors, spacing, typography } from '../../theme';
import { focusAccessibilityElement } from '../../lib/accessibility';
const { MIN_PASSWORD_LENGTH, validateNewPassword } = require('./passwordRecovery.cjs');

function getPasswordResetErrorMessage(error) {
  const code = error?.code || '';
  if (code === 'weak_password') {
    return `La contraseña no cumple la política de seguridad. Usa al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (code === 'same_password') {
    return 'Elige una contraseña diferente a la actual.';
  }
  if (
    code === 'missing_recovery_session' ||
    code === 'session_not_found' ||
    code === 'reauthentication_needed' ||
    code === 'reauthentication_not_valid'
  ) {
    return 'El enlace ya no autoriza este cambio. Solicita uno nuevo desde el inicio de sesión.';
  }
  return 'No pudimos actualizar la contraseña. Revisa tu conexión o solicita un enlace nuevo.';
}

export default function ResetPasswordScreen({ navigation, onExitRecovery }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [revocationWarning, setRevocationWarning] = useState(false);
  const [error, setError] = useState('');
  const completedTitleRef = useRef(null);
  const confirmationInputRef = useRef(null);

  useEffect(() => {
    if (completed) focusAccessibilityElement(completedTitleRef);
  }, [completed]);

  function exitRecovery() {
    if (typeof onExitRecovery === 'function') {
      onExitRecovery();
    } else {
      navigation.navigate('Login');
    }
  }

  async function handleUpdate() {
    if (loading) return;

    const validationError = validateNewPassword({ password, confirmation });
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data, error: updateError } = await completePasswordReset(password);
      if (updateError) {
        setError(getPasswordResetErrorMessage(updateError));
        return;
      }

      setPassword('');
      setConfirmation('');
      setRevocationWarning(!data.remoteSessionRevocationConfirmed);
      setCompleted(true);
    } catch {
      setError('No pudimos actualizar la contraseña. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  if (completed) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.resultContainer}>
          <View>
            <Text style={styles.eyebrow}>ACCESO RESTAURADO</Text>
            <Text ref={completedTitleRef} accessible accessibilityRole="header" style={styles.title}>Contraseña actualizada.</Text>
            <Text accessibilityLiveRegion="polite" style={styles.description}>
              Tu contraseña cambió. Vuelve a iniciar sesión con la nueva contraseña.
            </Text>
            {revocationWarning ? (
              <Text accessibilityRole="alert" style={styles.warning}>
                Cerramos la sesión de este dispositivo, pero no pudimos confirmar el cierre remoto
                de las demás sesiones. Revisa la seguridad de tu cuenta después de entrar.
              </Text>
            ) : null}
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            style={styles.primaryButton}
            onPress={exitRecovery}
          >
            <Text style={styles.primaryButtonText}>Iniciar sesión</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View>
            <Text style={styles.eyebrow}>RECUPERACIÓN</Text>
            <Text accessibilityRole="header" style={styles.title}>Crea una nueva contraseña.</Text>
            <Text style={styles.description}>
              Usa al menos {MIN_PASSWORD_LENGTH} caracteres. Puedes combinar palabras y espacios;
              evita datos personales o contraseñas que uses en otros servicios.
            </Text>
          </View>

          <View style={styles.form}>
            {error ? (
              <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>
                {error}
              </Text>
            ) : null}

            <View>
              <Text style={styles.label}>Nueva contraseña</Text>
              <TextInput
                accessibilityLabel="Nueva contraseña"
                style={styles.input}
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  setError('');
                }}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                maxLength={128}
                returnKeyType="next"
                onSubmitEditing={() => confirmationInputRef.current?.focus()}
                editable={!loading}
              />
            </View>

            <View>
              <Text style={styles.label}>Confirma la contraseña</Text>
              <TextInput
                ref={confirmationInputRef}
                accessibilityLabel="Confirmar nueva contraseña"
                style={styles.input}
                value={confirmation}
                onChangeText={(value) => {
                  setConfirmation(value);
                  setError('');
                }}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                maxLength={128}
                returnKeyType="done"
                onSubmitEditing={handleUpdate}
                editable={!loading}
              />
            </View>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={loading ? 'Actualizando contraseña' : 'Actualizar contraseña'}
              accessibilityState={{ disabled: loading, busy: loading }}
              style={[styles.primaryButton, loading && styles.disabled]}
              onPress={handleUpdate}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.text.inverse} />
              ) : (
                <Text style={styles.primaryButtonText}>Actualizar contraseña</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: colors.background.primary },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  resultContainer: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  eyebrow: {
    color: colors.accent.primary,
    fontFamily: typography.fonts.semibold,
    fontSize: typography.sizes.xs,
    letterSpacing: 2,
    marginBottom: spacing.md,
  },
  title: {
    color: colors.text.primary,
    fontFamily: typography.fonts.bold,
    fontSize: typography.sizes.xxl,
    lineHeight: typography.lineHeights.xxl,
    marginBottom: spacing.md,
  },
  description: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.regular,
    fontSize: typography.sizes.md,
    lineHeight: typography.lineHeights.md,
  },
  warning: {
    color: colors.warning,
    fontFamily: typography.fonts.medium,
    fontSize: typography.sizes.sm,
    lineHeight: typography.lineHeights.sm,
    marginTop: spacing.lg,
  },
  form: { gap: spacing.md, marginTop: spacing.xl },
  error: {
    color: colors.error,
    fontFamily: typography.fonts.medium,
    fontSize: typography.sizes.sm,
    lineHeight: typography.lineHeights.sm,
  },
  label: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.medium,
    fontSize: typography.sizes.sm,
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
  },
  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.accent.primary,
    paddingHorizontal: spacing.md,
  },
  primaryButtonText: {
    color: colors.text.inverse,
    fontFamily: typography.fonts.semibold,
    fontSize: typography.sizes.md,
  },
  disabled: { opacity: 0.55 },
});
