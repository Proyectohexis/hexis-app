import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '../../theme';
import { trackProductEvent } from '../../analytics/analytics';

export default function WelcomeScreen({ navigation }) {
  function startOnboarding() {
    void trackProductEvent('onboarding_started', { entry_point: 'signup' });
    navigation.navigate('Goal');
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>COMPROMISO · DISCIPLINA · TRANSFORMACIÓN</Text>
          <Text accessibilityRole="header" style={styles.logo}>HEXIS</Text>
          <Text style={styles.title}>Convierte tus decisiones en evidencia.</Text>
          <Text style={styles.description}>
            Define quién estás construyendo. Cumple lo que importa. Revisa lo que realmente cambia.
          </Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Comenzar mi compromiso"
            style={styles.primaryButton}
            onPress={startOnboarding}
          >
            <Text style={styles.primaryButtonText}>Comenzar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.secondaryButtonText}>Ya tengo cuenta</Text>
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
  copy: { flex: 1, justifyContent: 'center' },
  eyebrow: {
    color: colors.accent.primary,
    fontFamily: typography.fonts.semibold,
    fontSize: typography.sizes.xs,
    lineHeight: typography.lineHeights.xs,
    letterSpacing: 1.8,
    marginBottom: spacing.lg,
  },
  logo: {
    color: colors.text.primary,
    fontFamily: typography.fonts.bold,
    fontSize: 48,
    lineHeight: 56,
    letterSpacing: 10,
    marginBottom: spacing.xl,
  },
  title: {
    color: colors.text.primary,
    fontFamily: typography.fonts.bold,
    fontSize: typography.sizes.xxl,
    lineHeight: typography.lineHeights.xxl,
    marginBottom: spacing.md,
    maxWidth: 420,
  },
  description: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.regular,
    fontSize: typography.sizes.md,
    lineHeight: typography.lineHeights.md,
    maxWidth: 440,
  },
  actions: { gap: spacing.sm },
  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.accent.primary,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonText: {
    color: colors.text.inverse,
    fontFamily: typography.fonts.semibold,
    fontSize: typography.sizes.md,
  },
  secondaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.medium,
    fontSize: typography.sizes.sm,
  },
});
