import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '../../theme';
import { supabase } from '../../lib/supabase';
import { getAuthErrorMessage } from '../../lib/errors';

export default function CheckEmailScreen({ navigation, route }) {
  const email = route?.params?.email || '';
  const [resending, setResending] = useState(false);
  const [status, setStatus] = useState('');
  const [isError, setIsError] = useState(false);

  async function resendConfirmation() {
    if (!email || resending) return;
    setResending(true);
    setStatus('');
    setIsError(false);

    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      if (error) {
        setIsError(true);
        setStatus(getAuthErrorMessage(error));
      } else {
        setStatus('Enviamos un nuevo correo de confirmación.');
      }
    } catch {
      setIsError(true);
      setStatus('No pudimos reenviar el correo. Revisa tu conexión.');
    } finally {
      setResending(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View>
          <Text style={styles.eyebrow}>CUENTA PENDIENTE</Text>
          <Text accessibilityRole="header" style={styles.title}>Confirma tu correo.</Text>
          <Text style={styles.description}>
            Enviamos un enlace a {email || 'tu correo'}. Confírmalo en el navegador y vuelve para iniciar sesión.
          </Text>
          <Text style={styles.detail}>Si no lo encuentras, revisa spam o correo no deseado.</Text>
          {status ? (
            <Text
              accessibilityRole={isError ? 'alert' : undefined}
              accessibilityLiveRegion="polite"
              style={[styles.status, isError && styles.error]}
            >
              {status}
            </Text>
          ) : null}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Reenviar correo de confirmación"
            accessibilityState={{ disabled: resending || !email, busy: resending }}
            style={[styles.primaryButton, (resending || !email) && styles.disabled]}
            onPress={resendConfirmation}
            disabled={resending || !email}
          >
            {resending ? (
              <ActivityIndicator color={colors.text.inverse} />
            ) : (
              <Text style={styles.primaryButtonText}>Reenviar correo</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.secondaryButtonText}>Volver a iniciar sesión</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background.primary },
  container: {
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
    marginTop: spacing.xxl,
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
  status: {
    color: colors.success,
    fontFamily: typography.fonts.medium,
    fontSize: typography.sizes.sm,
    lineHeight: typography.lineHeights.sm,
    marginTop: spacing.lg,
  },
  error: { color: colors.error },
  actions: { gap: spacing.sm },
  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.accent.primary,
  },
  disabled: { opacity: 0.5 },
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
});
