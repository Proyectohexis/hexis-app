import { StatusBar } from 'expo-status-bar'; 
import { StyleSheet, Text, View } from 'react-native'; 
import { colors, typography, spacing } from './src/theme'; 
 
export default function App() { 
  return ( 
    <View style={styles.container}> 
      <StatusBar style="light" /> 
      <Text style={styles.logo}>HEXIS</Text> 
      <Text style={styles.slogan}>Compromiso. Disciplina. Transformacion.</Text> 
    </View> 
  ); 
} 
 
const styles = StyleSheet.create({ 
  container: { 
    flex: 1, 
    backgroundColor: colors.background.primary, 
    alignItems: 'center', 
    justifyContent: 'center', 
    paddingHorizontal: spacing.lg, 
  }, 
  logo: { 
    fontSize: typography.sizes.xxxl, 
    fontWeight: typography.weights.bold, 
    color: colors.text.primary, 
    letterSpacing: 8, 
    marginBottom: spacing.sm, 
  }, 
    fontSize: typography.sizes.sm, 
    fontWeight: typography.weights.regular, 
    color: colors.accent.primary, 
    letterSpacing: 2, 
    textAlign: 'center', 
  }, 
}); 
