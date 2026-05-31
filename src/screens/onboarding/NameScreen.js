import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { colors, typography, spacing } from '../../theme';
import { supabase } from '../../lib/supabase';

export default function NameScreen({ navigation, route }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const goal = route?.params?.goal || '';

  async function handleRegister() {
    if (!name || !email || !password) return;
    setLoading(true);
    setError('');

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, goal }
      }
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    if (data?.user) {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Main', params: { name } }],
      });
    }

    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <Text style={styles.title}>Crea tu cuenta</Text>
        <Text style={styles.subtitle}>Tu transformación empieza aquí.</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Tu nombre"
          placeholderTextColor={colors.text.tertiary}
          value={name}
          onChangeText={setName}
          autoFocus
        />
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
          placeholder="Contraseña"
          placeholderTextColor={colors.text.tertiary}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TouchableOpacity
          style={[styles.button, (!name || !email || !password || loading) && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={!name || !email || !password || loading}
        >
          {loading
            ? <ActivityIndicator color={colors.text.primary} />
            : <Text style={styles.buttonText}>Entrar a HEXIS</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity style={styles.link} onPress={() => navigation.navigate('Login')}>
          <Text style={styles.linkText}>¿Ya tienes cuenta? Inicia sesión</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.primary, paddingHorizontal: spacing.lg, justifyContent: 'center' },
  top: { marginBottom: spacing.xxl },
  title: { fontSize: typography.sizes.xxl, fontWeight: typography.weights.bold, color: colors.text.primary, marginBottom: spacing.xs },
  subtitle: { fontSize: typography.sizes.md, color: colors.text.secondary },
  error: { fontSize: typography.sizes.sm, color: colors.error, marginBottom: spacing.md, textAlign: 'center' },
  form: { gap: spacing.md },
  input: { borderWidth: 1, borderColor: colors.border.default, borderRadius: 12, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, fontSize: typography.sizes.md, color: colors.text.primary, backgroundColor: colors.background.card },
  button: { backgroundColor: colors.accent.primary, paddingVertical: spacing.md, borderRadius: 12, alignItems: 'center', marginTop: spacing.sm },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold, color: colors.text.primary, letterSpacing: 1 },
  link: { alignItems: 'center', paddingVertical: spacing.sm },
  linkText: { fontSize: typography.sizes.sm, color: colors.text.secondary },
});