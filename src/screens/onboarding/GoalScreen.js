import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import { colors, typography, spacing } from '../../theme';

const goals = [
  { id: 'fitness', label: 'Mejorar mi condicion fisica' },
  { id: 'habits', label: 'Construir habitos solidos' },
  { id: 'mental', label: 'Fortalecer mi disciplina mental' },
  { id: 'transformation', label: 'Transformacion completa' },
];

export default function GoalScreen({ navigation }) {
  const [selected, setSelected] = useState(null);

  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <Text style={styles.title}>¿Cual es tu meta?</Text>
        <Text style={styles.subtitle}>Define tu proposito. HEXIS hara el resto.</Text>
      </View>
      <View style={styles.options}>
        {goals.map((goal) => (
          <TouchableOpacity
            key={goal.id}
            style={[styles.option, selected === goal.id && styles.optionSelected]}
            onPress={() => setSelected(goal.id)}
          >
            <Text style={[styles.optionText, selected === goal.id && styles.optionTextSelected]}>{goal.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity
        style={[styles.button, !selected && styles.buttonDisabled]}
        onPress={() => selected && navigation.navigate('Name')}
      >
        <Text style={styles.buttonText}>Continuar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.primary, paddingHorizontal: spacing.lg, justifyContent: 'space-between', paddingBottom: spacing.xxl, paddingTop: spacing.xxl },
  top: { marginBottom: spacing.xl },
  title: { fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold, color: colors.text.primary, marginBottom: spacing.sm },
  subtitle: { fontSize: typography.sizes.md, color: colors.text.secondary },
  options: { flex: 1, justifyContent: 'center', gap: spacing.sm },
  option: { borderWidth: 1, borderColor: colors.border.default, borderRadius: 12, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  optionSelected: { borderColor: colors.accent.primary, backgroundColor: colors.accent.muted },
  optionText: { fontSize: typography.sizes.md, color: colors.text.secondary },
  optionTextSelected: { color: colors.accent.light, fontWeight: typography.weights.medium },
  button: { backgroundColor: colors.accent.primary, paddingVertical: spacing.md, borderRadius: 12, alignItems: 'center' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.text.primary, letterSpacing: 1 },
});
