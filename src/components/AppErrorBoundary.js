import { Component } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors, spacing, typography } from '../theme';

export default class AppErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <ScrollView style={styles.safeArea} contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>HEXIS</Text>
        <Text accessibilityRole="header" style={styles.title}>Algo interrumpió la app.</Text>
        <Text style={styles.copy}>
          No pudimos confirmar el estado actual. Reintenta y la app volverá a cargar los datos disponibles.
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          style={styles.button}
          onPress={() => this.setState({ failed: false })}
        >
          <Text style={styles.buttonText}>Reintentar</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background.primary },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    backgroundColor: colors.background.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  eyebrow: {
    color: colors.accent.primary,
    fontFamily: typography.fonts.semibold,
    fontSize: typography.sizes.xs,
    letterSpacing: 3,
    marginBottom: spacing.md,
  },
  title: {
    color: colors.text.primary,
    fontFamily: typography.fonts.bold,
    fontSize: typography.sizes.xxl,
    lineHeight: typography.lineHeights.xxl,
  },
  copy: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.regular,
    fontSize: typography.sizes.md,
    lineHeight: typography.lineHeights.md,
    marginTop: spacing.sm,
  },
  button: {
    minHeight: 52,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.accent.primary,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  buttonText: {
    color: colors.text.inverse,
    fontFamily: typography.fonts.semibold,
    fontSize: typography.sizes.md,
  },
});
