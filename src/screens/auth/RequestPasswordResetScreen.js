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
import { requestPasswordReset } from '../../lib/auth';
import { colors, spacing, typography } from '../../theme';
import { focusAccessibilityElement } from '../../lib/accessibility';
const {
  normalizeRecoveryEmail,
  validateRecoveryEmail,
} = require('./passwordRecovery.cjs');

export default function RequestPasswordResetScreen({ navigation, route }) {
  const initialEmail = typeof route?.params?.email === 'string' ? route.params.email : '';
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const resultTitleRef = useRef(null);

  useEffect(() => {
    if (sent) focusAccessibilityElement(resultTitleRef);
  }, [sent]);

  function returnToLogin() {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Login');
    }
  }

  async function handleRequest() {
    if (loading) return;

    const validationError = validateRecoveryEmail(email);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error: requestError } = await requestPasswordReset(normalizeRecoveryEmail(email));
      if (requestError) throw requestError;
      setSent(true);
    } catch {
      setError('No pudimos procesar la solicitud. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.resultContainer}>
          <View>
            <Text style={styles.eyebrow}>RECUPERACIÓN</Text>
            <Text ref={resultTitleRef} accessible accessibilityRole="header" style={styles.title}>Revisa tu correo.</Text>
            <Text accessibilityLiveRegion="polite" style={styles.description}>
              Si existe una cuenta asociada y la solicitud pudo procesarse, recibirás un enlace
              para crear una nueva contraseña. Por seguridad, HEXIS no confirma si el correo está
              registrado.
            </Text>
            <Text style={styles.detail}>
              Revisa también spam o correo no deseado. El enlace puede expirar y debe abrirse en
              este dispositivo.
            </Text>
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            style={styles.primaryButton}
            onPress={returnToLogin}
          >
            <Text style={styles.primaryButtonText}>Volver a iniciar sesión</Text>
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
            <Text accessibilityRole="header" style={styles.title}>Recupera tu acceso.</Text>
            <Text style={styles.description}>
              Escribe el correo que utilizas en HEXIS. Si está asociado a una cuenta, enviaremos
              un enlace de recuperación.
            </Text>
          </View>

          <View style={styles.form}>
            {error ? (
              <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>
                {error}
              </Text>
            ) : null}

            <View>
              <Text style={styles.label}>Correo</Text>
              <TextInput
                accessibilityLabel="Correo electrónico para recuperar la contraseña"
                style={styles.input}
                placeholder="tu@correo.com"
                placeholderTextColor={colors.text.tertiary}
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  setError('');
                }}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                keyboardType="email-address"
                returnKeyType="send"
                onSubmitEditing={handleRequest}
                editable={!loading}
              />
            </View>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={loading ? 'Enviando solicitud' : 'Enviar enlace de recuperación'}
              accessibilityState={{ disabled: loading, busy: loading }}
              style={[styles.primaryButton, loading && styles.disabled]}
              onPress={handleRequest}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.text.inverse} />
              ) : (
                <Text style={styles.primaryButtonText}>Enviar enlace</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              style={styles.secondaryButton}
              onPress={returnToLogin}
              disabled={loading}
            >
              <Text style={styles.secondaryButtonText}>Volver</Text>
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
  detail: {
    color: colors.text.tertiary,
    fontFamily: typography.fonts.regular,
    fontSize: typography.sizes.sm,
    lineHeight: typography.lineHeights.sm,
    marginTop: spacing.md,
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
  secondaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.medium,
    fontSize: typography.sizes.sm,
  },
  disabled: { opacity: 0.55 },
});
