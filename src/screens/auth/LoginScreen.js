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

export default function LoginScreen({ navigation }) {
  const passwordInputRef = useRef(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin() {
    if (loading) return;
    if (!/^\S+@\S+\.\S+$/.test(email.trim()) || !password) {
      setError('Escribe tu correo y contraseña.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signInError) setError(getAuthErrorMessage(signInError));
    } catch {
      setError('No pudimos iniciar sesión. Revisa tu conexión e inténtalo de nuevo.');
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
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View>
            <Text style={styles.logo}>HEXIS</Text>
            <Text accessibilityRole="header" style={styles.title}>Continúa donde lo dejaste.</Text>
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
                returnKeyType="next"
                onSubmitEditing={() => passwordInputRef.current?.focus()}
              />
            </View>

            <View>
              <Text style={styles.label}>Contraseña</Text>
              <TextInput
                ref={passwordInputRef}
                accessibilityLabel="Contraseña"
                style={styles.input}
                placeholder="Tu contraseña"
                placeholderTextColor={colors.text.tertiary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                maxLength={128}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
            </View>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Entrar"
              accessibilityState={{ disabled: loading, busy: loading }}
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.text.inverse} />
              ) : (
                <Text style={styles.buttonText}>Entrar</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Recuperar contraseña"
              style={styles.recoveryLink}
              onPress={() => navigation.navigate('RequestPasswordReset', { email })}
            >
              <Text style={styles.recoveryLinkText}>¿Olvidaste tu contraseña?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              style={styles.link}
              onPress={() => navigation.navigate('Goal')}
            >
              <Text style={styles.linkText}>Crear una cuenta</Text>
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
  logo: {
    color: colors.accent.primary,
    fontFamily: typography.fonts.bold,
    fontSize: typography.sizes.sm,
    letterSpacing: 5,
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.text.primary,
    fontFamily: typography.fonts.bold,
    fontSize: typography.sizes.xxl,
    lineHeight: typography.lineHeights.xxl,
    marginBottom: spacing.xl,
  },
  form: { gap: spacing.md },
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
  recoveryLink: {
    minHeight: 44,
    alignSelf: 'flex-end',
    justifyContent: 'center',
  },
  recoveryLinkText: {
    color: colors.accent.light,
    fontFamily: typography.fonts.medium,
    fontSize: typography.sizes.sm,
  },
  linkText: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.medium,
    fontSize: typography.sizes.sm,
  },
});
