import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { colors, typography, spacing } from '../../theme';
import { supabase } from '../../lib/supabase';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin() {
    if (!email || !password) return;
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <Text style={styles.logo}>HEXIS</Text>
        <Text style={styles.subtitle}>Inicia sesion para continuar.</Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.text.tertiary}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Contrasena"
          placeholderTextColor={colors.text.tertiary}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color={colors.text.primary} /> : <Text style={styles.buttonText}>Entrar</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.link} onPress={() => navigation.navigate('Register')}>
          <Text style={styles.linkText}>No tienes cuenta? Registrate</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.primary, paddingHorizontal: spacing.lg, justifyContent: 'center' },
  top: { marginBottom: spacing.xxl, alignItems: 'center' },
  logo: { fontSize: typography.sizes.xxxl, fontWeight: typography.weights.bold, color: colors.text.primary, letterSpacing: 8, marginBottom: spacing.sm },
  subtitle: { fontSize: typography.sizes.sm, color: colors.text.secondary },
  error: { fontSize: typography.sizes.sm, color: colors.error, marginBottom: spacing.md, textAlign: 'center' },
  form: { gap: spacing.md },
  input: { borderWidth: 1, borderColor: colors.border.default, borderRadius: 12, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, fontSize: typography.sizes.md, color: colors.text.primary, backgroundColor: colors.background.card },
  button: { backgroundColor: colors.accent.primary, paddingVertical: spacing.md, borderRadius: 12, alignItems: 'center' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.text.primary, letterSpacing: 1 },
  link: { alignItems: 'center', paddingVertical: spacing.sm },
  linkText: { fontSize: typography.sizes.sm, color: colors.text.secondary },
});