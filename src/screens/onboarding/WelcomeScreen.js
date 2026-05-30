import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { colors, typography, spacing } from '../../theme';

export default function WelcomeScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <View style={styles.center}>
        <Text style={styles.logo}>HEXIS</Text>
        <Text style={styles.slogan}>Compromiso. Disciplina. Transformacion.</Text>
      </View>
      <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('Goal')}>
        <Text style={styles.buttonText}>Comenzar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.primary, paddingHorizontal: spacing.lg, justifyContent: 'space-between', paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { fontSize: typography.sizes.xxxl, fontWeight: typography.weights.bold, color: colors.text.primary, letterSpacing: 8, marginBottom: spacing.sm },
  slogan: { fontSize: typography.sizes.sm, color: colors.accent.primary, letterSpacing: 2, textAlign: 'center' },
  button: { backgroundColor: colors.accent.primary, paddingVertical: spacing.md, borderRadius: 12, alignItems: 'center' },
  buttonText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.text.primary, letterSpacing: 1 },
});