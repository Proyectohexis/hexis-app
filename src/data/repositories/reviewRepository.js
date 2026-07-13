import { supabase } from '../../lib/supabase';
import { createOperationId } from '../../lib/operationId';

const REVIEW_COLUMNS = [
  'id',
  'user_id',
  'plan_id',
  'week_start',
  'reflection',
  'decision',
  'client_operation_id',
  'created_at',
  'updated_at',
].join(',');

function configurationError() {
  return new Error('Supabase no está configurado.');
}

export function getReviewRepositoryErrorMessage(error) {
  if (['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error?.code)) {
    return 'Las revisiones no están disponibles en esta instalación de HEXIS. Inténtalo más tarde.';
  }
  if (error?.code === 'HX409' || error?.message?.includes('HX409')) {
    return 'Esta revisión ya existe con otro contenido. Recarga antes de reintentar.';
  }
  return 'No pudimos confirmar la revisión. Revisa tu conexión e inténtalo de nuevo.';
}

export async function getWeeklyReview({ userId, planId, weekStart }) {
  if (!supabase) return { data: null, error: configurationError() };

  const { data, error } = await supabase
    .from('weekly_reviews')
    .select(REVIEW_COLUMNS)
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('week_start', weekStart)
    .maybeSingle();

  return { data, error };
}

export async function completeWeeklyReview({
  planId,
  weekStart,
  reflection,
  decision,
  clientOperationId = createOperationId(),
}) {
  if (!supabase) return { data: null, error: configurationError() };

  const { data, error } = await supabase.rpc('complete_weekly_review', {
    p_plan_id: planId,
    p_week_start: weekStart,
    p_reflection: reflection.trim(),
    p_decision: decision,
    p_client_operation_id: clientOperationId,
  });

  return { data, error, clientOperationId };
}
