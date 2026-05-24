import { StyleSheet, Text, View, TouchableOpacity, TextInput } from 'react-native';
import { useState } from 'react';
import { colors, typography, spacing } from '../../theme';

export default function NameScreen({ navigation }) {
  const [name, setName] = useState('');

  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <Text style={styles.title}>¿Como te llamas?</Text>
        <Text style={styles.subtitle}>Tu transformacion empieza con tu identidad.</Text>
      </View>
      <TextInput
        style={styles.input}
        placeholder='Tu nombre'
        placeholderTextColor={colors.text.tertiary}
        value={name}
        onChangeText={setName}
        autoFocus
      />
      <TouchableOpacity
        style={[styles.button, !name && styles.buttonDisabled]}
        onPress={() => name && navigation.navigate('Dashboard')}
      >
        <Text style={styles.buttonText}>Entrar a HEXIS</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.primary, paddingHorizontal: spacing.lg, justifyContent: 'space-between', paddingBottom: spacing.xxl, paddingTop: spacing.xxl },
  top: { marginBottom: spacing.xl },
  title: { fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold, color: colors.text.primary, marginBottom: spacing.sm },
  subtitle: { fontSize: typography.sizes.md, color: colors.text.secondary },
  input: { borderWidth: 1, borderColor: colors.border.default, borderRadius: 12, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, fontSize: typography.sizes.md, color: colors.text.primary, backgroundColor: colors.background.card },
  button: { backgroundColor: colors.accent.primary, paddingVertical: spacing.md, borderRadius: 12, alignItems: 'center' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.text.primary, letterSpacing: 1 },
});