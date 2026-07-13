import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import { createClient, processLock } from '@supabase/supabase-js';
import { secureSessionStorage } from './secureStorage';
const { validateSupabaseConfiguration } = require('./supabaseConfig.cjs');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigurationError = validateSupabaseConfiguration({
  url: supabaseUrl,
  publishableKey: supabasePublishableKey,
  allowLocalDevelopment: process.env.EXPO_PUBLIC_ALLOW_LOCAL_SUPABASE === 'true',
});

export const supabase = supabaseConfigurationError
  ? null
  : createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        storage: secureSessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
        lock: processLock,
      },
    });

if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
