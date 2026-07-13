import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { supabase } from '../../lib/supabase';
import { createOperationId } from '../../lib/operationId';
import { asyncStorageCheckInQueue } from '../sync/asyncStorageCheckInQueue';
import { disableUserHabitReminders } from '../../notifications/localReminders';
const {
  DELETE_CONFIRMATION,
  exportFileName,
  serializeExportSnapshot,
  shouldRetryDeletionRequest,
  validateDeletionInput,
} = require('./privacyOperations.cjs');

export { DELETE_CONFIRMATION };

function privacyError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function configurationError() {
  return privacyError('not_configured', 'Supabase no está configurado.');
}

async function readFunctionError(error) {
  try {
    const response = error?.context;
    if (response && typeof response.clone === 'function') {
      const payload = await response.clone().json();
      if (typeof payload?.code === 'string') return payload.code;
    }
  } catch {
    // A generic message is safer than exposing an unexpected server body.
  }
  return error?.code || 'function_failed';
}

export function getPrivacyErrorMessage(error) {
  switch (error?.code) {
    case 'invalid_confirmation':
      return 'Confirma la frase exacta y vuelve a escribir tu contraseña.';
    case 'reauthentication_failed':
      return 'La contraseña no es correcta. La cuenta no fue eliminada.';
    case 'authentication_required':
      return 'Tu sesión ya no es válida. Inicia sesión y vuelve a intentarlo.';
    case 'sharing_unavailable':
      return 'Este dispositivo no permite guardar o compartir el archivo de exportación.';
    case 'invalid_export_snapshot':
      return 'El servidor devolvió una exportación inválida. No se guardó ningún archivo.';
    default:
      return 'No pudimos completar esta operación de privacidad. Inténtalo de nuevo.';
  }
}

export async function getAccountExport() {
  if (!supabase) return { data: null, error: configurationError() };
  const { data, error } = await supabase.rpc('export_current_account');
  return { data, error };
}

export async function shareAccountExport(snapshot) {
  if (!(await Sharing.isAvailableAsync())) {
    return { error: privacyError('sharing_unavailable', 'Sharing is unavailable.') };
  }

  let file;
  try {
    const contents = serializeExportSnapshot(snapshot);
    file = new File(Paths.cache, exportFileName(snapshot.generated_at));
    file.create({ overwrite: true, intermediates: true });
    file.write(contents);
    await Sharing.shareAsync(file.uri, {
      dialogTitle: 'Guardar exportación de HEXIS',
      mimeType: 'application/json',
      UTI: 'public.json',
    });
    return { error: null };
  } catch (error) {
    if (error?.message === 'invalid_export_snapshot') {
      return { error: privacyError('invalid_export_snapshot', error.message) };
    }
    return { error };
  } finally {
    try {
      file?.delete();
    } catch {
      // The temporary export must not block the user's completed share action.
    }
  }
}

export async function deleteCurrentAccount({
  password,
  confirmation,
  operationId = createOperationId(),
}) {
  if (!supabase) return { data: null, error: configurationError(), operationId };

  const validationError = validateDeletionInput({ password, confirmation });
  if (validationError) {
    return {
      data: null,
      error: privacyError('invalid_confirmation', validationError),
      operationId,
    };
  }

  const body = { password, confirmation, operationId };
  let { data, error } = await supabase.functions.invoke('delete-account', { body });
  if (error && shouldRetryDeletionRequest(error)) {
    ({ data, error } = await supabase.functions.invoke('delete-account', { body }));
  }
  if (!error && data?.deleted === true) {
    return { data, error: null, operationId };
  }

  const code = await readFunctionError(error);
  return {
    data: null,
    error: privacyError(code, error?.message || 'Account deletion failed.'),
    operationId,
  };
}

export async function finalizeDeletedAccount(userId) {
  const warnings = [];
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) warnings.push('local_session');
  } catch {
    warnings.push('local_session');
  }
  try {
    await disableUserHabitReminders(userId);
  } catch {
    warnings.push('local_reminders');
  }
  try {
    await asyncStorageCheckInQueue.clearForUser(userId);
  } catch {
    warnings.push('offline_queue');
  }
  return { warnings };
}
