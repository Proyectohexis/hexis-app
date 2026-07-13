import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import AppNavigator from './src/navigation/AppNavigator';
import AppErrorBoundary from './src/components/AppErrorBoundary';
import { configureLocalNotificationPresentation } from './src/notifications/localReminders';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Fast Refresh can call this after the splash screen is already hidden.
});

configureLocalNotificationPresentation();

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontError, fontsLoaded]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AppErrorBoundary>
        <AppNavigator />
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}
