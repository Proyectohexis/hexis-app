import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '../../theme';
import { GOALS } from '../../constants/goals';
import { trackProductEvent } from '../../analytics/analytics';

export default function GoalScreen({ navigation }) {
  const [selected, setSelected] = useState(null);
  const selectedGoal = GOALS.find((goal) => goal.id === selected);

  function continueWithIdentity() {
    if (!selectedGoal) return;
    void trackProductEvent('identity_defined', { definition_mode: 'preset' });
    navigation.navigate('Name', {
      goal: selectedGoal.id,
      identity: selectedGoal.identity,
    });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Volver a la bienvenida"
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>← Volver</Text>
          </TouchableOpacity>
          <Text style={styles.step}>01 · COMPROMISO</Text>
          <Text accessibilityRole="header" style={styles.title}>¿Qué identidad estás construyendo?</Text>
          <Text style={styles.subtitle}>Elige una dirección inicial. Podrás hacerla más específica después.</Text>
        </View>

        <View accessibilityRole="radiogroup" style={styles.options}>
          {GOALS.map((goal) => {
            const isSelected = selected === goal.id;
            return (
              <TouchableOpacity
                key={goal.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected }}
                accessibilityLabel={`${goal.title}. ${goal.identity}`}
                style={[styles.option, isSelected && styles.optionSelected]}
                onPress={() => setSelected(goal.id)}
              >
                <View style={[styles.radio, isSelected && styles.radioSelected]} />
                <View style={styles.optionCopy}>
                  <Text style={[styles.optionTitle, isSelected && styles.optionTitleSelected]}>{goal.title}</Text>
                  <Text style={styles.optionDescription}>{goal.identity}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ disabled: !selectedGoal }}
          style={[styles.button, !selectedGoal && styles.buttonDisabled]}
          onPress={continueWithIdentity}
          disabled={!selectedGoal}
        >
          <Text style={styles.buttonText}>Continuar</Text>
        </TouchableOpacity>
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
  options: { gap: spacing.sm, marginVertical: spacing.xl },
  option: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 14,
    backgroundColor: colors.background.card,
    padding: spacing.md,
  },
  optionSelected: { borderColor: colors.accent.primary, backgroundColor: colors.accent.muted },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.text.tertiary,
    marginRight: spacing.md,
  },
  radioSelected: { borderWidth: 6, borderColor: colors.accent.primary },
  optionCopy: { flex: 1 },
  optionTitle: {
    color: colors.text.primary,
    fontFamily: typography.fonts.semibold,
    fontSize: typography.sizes.md,
    lineHeight: typography.lineHeights.md,
    marginBottom: spacing.xs,
  },
  optionTitleSelected: { color: colors.accent.light },
  optionDescription: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.regular,
    fontSize: typography.sizes.sm,
    lineHeight: typography.lineHeights.sm,
  },
  button: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.accent.primary,
  },
  buttonDisabled: { opacity: 0.45 },
  buttonText: {
    color: colors.text.inverse,
    fontFamily: typography.fonts.semibold,
    fontSize: typography.sizes.md,
  },
});
