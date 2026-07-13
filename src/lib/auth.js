import { supabase } from './supabase';
import { asyncStorageCheckInQueue } from '../data/sync/asyncStorageCheckInQueue';
import { disableUserHabitReminders } from '../notifications/localReminders';
const {
  PASSWORD_RECOVERY_REDIRECT_URL,
  normalizeRecoveryEmail,
  parsePasswordRecoveryUrl,
  validateNewPassword,
  validateRecoveryEmail,
} = require('../screens/auth/passwordRecovery.cjs');

function createAuthFlowError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function configurationError() {
  return createAuthFlowError('auth_not_configured', 'Supabase no está configurado.');
}

export async function getCurrentUser() {
  if (!supabase) throw new Error('Supabase no está configurado.');
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
}

export async function signOut() {
  if (!supabase) return { error: new Error('Supabase no está configurado.') };

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) return { data: null, error: sessionError };

  const authenticatedUserId = sessionData.session?.user?.id ?? null;
  if (authenticatedUserId) {
    const cleanupErrors = [];
    try {
      await disableUserHabitReminders(authenticatedUserId);
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await asyncStorageCheckInQueue.clearForUser(authenticatedUserId);
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (cleanupErrors.length) {
      return { data: null, error: cleanupErrors[0] };
    }
  }

  return supabase.auth.signOut();
}

export async function requestPasswordReset(email) {
  if (!supabase) return { data: null, error: configurationError() };

  const validationError = validateRecoveryEmail(email);
  if (validationError) {
    return {
      data: null,
      error: createAuthFlowError('invalid_recovery_email', validationError),
    };
  }

  return supabase.auth.resetPasswordForEmail(normalizeRecoveryEmail(email), {
    redirectTo: PASSWORD_RECOVERY_REDIRECT_URL,
  });
}

export async function consumePasswordRecoveryUrl(url) {
  if (!supabase) return { data: null, error: configurationError() };

  const parsed = parsePasswordRecoveryUrl(url);
  if (parsed.errorCode) {
    return {
      data: null,
      error: createAuthFlowError(
        parsed.errorCode,
        'El enlace de recuperación no es válido o ya expiró.',
      ),
    };
  }

  try {
    const result = await supabase.auth.exchangeCodeForSession(parsed.code);

    if (result.error) return result;
    if (!result.data?.session) {
      return {
        data: null,
        error: createAuthFlowError(
          'missing_recovery_session',
          'No se pudo crear una sesión de recuperación.',
        ),
      };
    }
    return result;
  } catch {
    return {
      data: null,
      error: createAuthFlowError(
        'recovery_callback_failed',
        'No se pudo procesar el enlace de recuperación.',
      ),
    };
  }
}

export async function completePasswordReset(password) {
  if (!supabase) return { data: null, error: configurationError() };

  const validationError = validateNewPassword({ password, confirmation: password });
  if (validationError) {
    return {
      data: null,
      error: createAuthFlowError('invalid_new_password', validationError),
    };
  }

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) return { data: null, error: sessionError };
    if (!sessionData.session) {
      return {
        data: null,
        error: createAuthFlowError(
          'missing_recovery_session',
          'La sesión de recuperación no está disponible.',
        ),
      };
    }

    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) return { data: null, error };

    try {
      await asyncStorageCheckInQueue.clearForUser(sessionData.session.user.id);
    } catch {
      // Password replacement continues; the UI reports remote revocation separately.
    }

    let remoteSessionRevocationConfirmed = true;
    try {
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' });
      if (signOutError) {
        remoteSessionRevocationConfirmed = false;
        await supabase.auth.signOut({ scope: 'local' });
      }
    } catch {
      remoteSessionRevocationConfirmed = false;
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        // The password update already succeeded. The caller reports the revocation warning.
      }
    }

    return {
      data: {
        user: data.user,
        passwordUpdated: true,
        remoteSessionRevocationConfirmed,
      },
      error: null,
    };
  } catch {
    return {
      data: null,
      error: createAuthFlowError(
        'password_reset_failed',
        'No se pudo actualizar la contraseña.',
      ),
    };
  }
}

export function onAuthStateChange(callback) {
  if (!supabase) return null;
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null);
  });
}

export { PASSWORD_RECOVERY_REDIRECT_URL };
