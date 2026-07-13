import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing, typography } from '../theme';

export default function QueueRecoveryNotice({
  notice,
  unavailable = false,
  acknowledging = false,
  error = '',
  onAcknowledge,
  style,
}) {
  if (!notice && !unavailable) return null;
  const repairedDiagnostic = notice?.reason === 'recovery_notice_unreadable';

  return (
    <View style={[styles.card, style]}>
      <View accessibilityRole="alert" accessibilityLiveRegion="assertive">
        <Text style={styles.title}>
          {unavailable
            ? 'No pudimos verificar los cambios pendientes'
            : repairedDiagnostic
              ? 'Revisa un aviso de sincronización'
              : 'Revisa tu evidencia reciente'}
        </Text>
        <Text style={styles.copy}>
          {unavailable
            ? 'HEXIS no puede comprobar ahora el estado del registro local. Evita cerrar sesión o eliminar la app y vuelve a intentarlo antes de depender de cambios sin conexión.'
            : repairedDiagnostic
              ? 'HEXIS reparó un aviso local que no podía leer. La cola actual no se descartó por esta reparación, pero no podemos confirmar si ya se había revisado una recuperación anterior. Comprueba lo que aparece en la app antes de confirmar.'
              : 'HEXIS restableció el registro local de cambios pendientes de este dispositivo porque no pudo leerlo. Es posible que alguna evidencia aún no sincronizada falte. Revisa lo que aparece en la app antes de confirmar este aviso.'}
        </Text>
        <Text style={styles.reference}>
          Referencia de diagnóstico: {notice?.diagnostic_code || 'SYNC-Q00'}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
      {!unavailable ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Confirmar que entiendo que puede faltar evidencia"
          accessibilityState={{ busy: acknowledging, disabled: acknowledging }}
          style={[styles.button, acknowledging && styles.disabled]}
          onPress={onAcknowledge}
          disabled={acknowledging}
        >
          {acknowledging ? (
            <ActivityIndicator size="small" color={colors.text.primary} />
          ) : (
            <Text style={styles.buttonText}>Entiendo el posible cambio faltante</Text>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: 14,
    backgroundColor: colors.background.secondary,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.warning,
    fontFamily: typography.fonts.semibold,
    fontSize: typography.sizes.sm,
  },
  copy: {
    color: colors.text.secondary,
    fontFamily: typography.fonts.regular,
    fontSize: typography.sizes.sm,
    lineHeight: typography.lineHeights.sm,
    marginTop: spacing.xs,
  },
  reference: {
    color: colors.text.tertiary,
    fontFamily: typography.fonts.medium,
    fontSize: typography.sizes.xs,
    marginTop: spacing.sm,
  },
  error: {
    color: colors.error,
    fontFamily: typography.fonts.medium,
    fontSize: typography.sizes.sm,
    lineHeight: typography.lineHeights.sm,
    marginTop: spacing.sm,
  },
  button: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
  },
  buttonText: {
    color: colors.text.primary,
    fontFamily: typography.fonts.semibold,
    fontSize: typography.sizes.sm,
  },
  disabled: { opacity: 0.55 },
});
