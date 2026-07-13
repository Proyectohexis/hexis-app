import { useRef, useState } from 'react';
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
import { supabase } from '../../lib/supabase';
import { getAuthErrorMessage } from '../../lib/errors';
const { validateCredentials } = require('../../lib/validation.cjs');

export default function NameScreen({ navigation, route }) {
  const passwordInputRef = useRef(null);
  const confirmationInputRef = useRef(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const goal = route?.params?.goal || 'discipline';
  const identity = route?.params?.identity || 'Cumplo los compromisos que hago conmigo.';

  async function handleRegister() {
    if (loading) return;
    const validationError = validateCredentials({ email, password, confirmation });
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            goal_code: goal,
          },
        },
      });

      if (signUpError) {
        setError(getAuthErrorMessage(signUpError));
        return;
      }

      if (!data.session) {
        navigation.replace('CheckEmail', { email: normalizedEmail });
      }
      // A valid session switches the root navigator automatically.
    } catch {
      setError('No pudimos crear la cuenta. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
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
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Volver a elegir identidad"
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              disabled={loading}
            >
              <Text style={styles.backButtonText}>← Volver</Text>
            </TouchableOpacity>
            <Text style={styles.step}>02 · TU CUENTA</Text>
            <Text accessibilityRole="header" style={styles.title}>Crea tu acceso.</Text>
            <Text style={styles.subtitle}>{identity}</Text>
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
                accessibilityLabel="Correo electrónico"
                style={styles.input}
                placeholder="tu@correo.com"
                placeholderTextColor={colors.text.tertiary}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                keyboardType="email-address"
                maxLength={254}
                returnKeyType="next"
                onSubmitEditing={() => passwordInputRef.current?.focus()}
              />
            </View>

            <View>
              <Text style={styles.label}>Contraseña</Text>
              <TextInput
                ref={passwordInputRef}
                accessibilityLabel="Contraseña, mínimo 12 caracteres"
                style={styles.input}
                placeholder="Mínimo 12 caracteres"
                placeholderTextColor={colors.text.tertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                maxLength={128}
                returnKeyType="next"
                onSubmitEditing={() => confirmationInputRef.current?.focus()}
              />
            </View>

            <View>
              <Text style={styles.label}>Confirmar contraseña</Text>
              <TextInput
                ref={confirmationInputRef}
                accessibilityLabel="Confirmar contraseña"
                style={styles.input}
                placeholder="Repite tu contraseña"
                placeholderTextColor={colors.text.tertiary}
                value={confirmation}
                onChangeText={setConfirmation}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                maxLength={128}
                returnKeyType="done"
                onSubmitEditing={handleRegister}
              />
            </View>

            <Text style={styles.privacyCopy}>
              Tu correo se usa para crear y proteger tu acceso. Mientras HEXIS esté en pruebas,
              utiliza una cuenta y contenido destinados solo a probar la app.
            </Text>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Crear cuenta"
              accessibilityState={{ disabled: loading, busy: loading }}
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.text.inverse} />
              ) : (
                <Text style={styles.buttonText}>Crear cuenta</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              style={styles.link}
              onPress={() => navigation.navigate('Login')}
            >
              <Text style={styles.linkText}>Ya tengo cuenta</Text>
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
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  backButton: { alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center' },
  backButtonText: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.medium,
    fontSize: typography.sizes.sm,
  },
  step: {
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
    marginBottom: spacing.sm,
  },
  subtitle: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.regular,
    fontSize: typography.sizes.md,
    lineHeight: typography.lineHeights.md,
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
    paddingVertical: spacing.sm,
  },
  privacyCopy: {
    color: colors.text.tertiary,
    fontFamily: typography.fonts.regular,
    fontSize: typography.sizes.xs,
    lineHeight: typography.lineHeights.xs,
  },
  button: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.accent.primary,
    marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.55 },
  buttonText: {
    color: colors.text.inverse,
    fontFamily: typography.fonts.semibold,
    fontSize: typography.sizes.md,
  },
  link: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  linkText: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.medium,
    fontSize: typography.sizes.sm,
  },
});
