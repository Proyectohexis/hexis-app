import { supabase } from '../../lib/supabase';
import { createOperationId } from '../../lib/operationId';
const { buildInitialHabitPayload } = require('./planPayload.cjs');

const PLAN_COLUMNS = [
  'id',
  'user_id',
  'identity_statement',
  'outcome_statement',
  'why_statement',
  'timezone',
  'status',
  'starts_on',
  'ends_on',
  'created_at',
  'updated_at',
].join(',');

function configurationError() {
  return new Error('Supabase no está configurado.');
}

export function isTargetSchemaUnavailable(error) {
  return ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error?.code);
}

export function getPlanRepositoryErrorMessage(error) {
  if (isTargetSchemaUnavailable(error)) {
    return 'Los planes no están disponibles en esta instalación de HEXIS. Inténtalo más tarde.';
  }

  if (error?.code === 'HX409' || error?.message?.includes('HX409')) {
    return 'Encontramos una versión diferente de este cambio. Actualiza la pantalla antes de volver a intentarlo.';
  }

  return 'No pudimos confirmar el plan. Revisa tu conexión e inténtalo de nuevo.';
}

export async function getActivePlan(userId) {
  if (!supabase) return { data: null, error: configurationError() };
  if (!userId) return { data: null, error: new Error('Falta el usuario autenticado.') };

  const { data, error } = await supabase
    .from('plans')
    .select(PLAN_COLUMNS)
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return { data, error };
}

export async function createInitialPlan({
  identityStatement,
  outcomeStatement,
  whyStatement,
  timeZone,
  startsOn,
  habits,
  clientOperationId = createOperationId(),
}) {
  if (!supabase) return { data: null, error: configurationError() };

  const payload = buildInitialHabitPayload(habits);

  const { data, error } = await supabase.rpc('create_initial_plan', {
    p_identity_statement: identityStatement.trim(),
    p_outcome_statement: outcomeStatement.trim(),
    p_why_statement: whyStatement.trim(),
    p_timezone: timeZone,
    p_habits: payload,
    p_client_operation_id: clientOperationId,
    p_starts_on: startsOn,
    p_ends_on: null,
  });

  return { data, error, clientOperationId };
}
