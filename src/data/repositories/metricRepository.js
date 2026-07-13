import { supabase } from '../../lib/supabase';
import { createOperationId } from '../../lib/operationId';

const METRIC_COLUMNS = [
  'id',
  'user_id',
  'plan_id',
  'kind',
  'label',
  'unit',
  'min_value',
  'max_value',
  'status',
  'created_at',
  'updated_at',
].join(',');

const ENTRY_COLUMNS = [
  'id',
  'user_id',
  'metric_id',
  'value',
  'local_date',
  'recorded_at',
  'note',
  'created_at',
  'updated_at',
].join(',');

function configurationError() {
  return new Error('Supabase no está configurado.');
}

export function getMetricRepositoryErrorMessage(error) {
  if (['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error?.code)) {
    return 'El backend de desarrollo todavía no tiene el modelo de transformación.';
  }
  if (error?.code === 'HX409' || error?.message?.includes('HX409')) {
    return 'La operación ya existe con otro contenido. Recarga antes de reintentar.';
  }
  return 'No pudimos confirmar el registro con el servidor. Revisa la conexión e inténtalo de nuevo.';
}

export async function getActiveMetric({ userId, planId }) {
  if (!supabase) return { data: null, error: configurationError() };
  const { data, error } = await supabase
    .from('transformation_metrics')
    .select(METRIC_COLUMNS)
    .eq('user_id', userId)
    .eq('plan_id', planId)
    .eq('status', 'active')
    .maybeSingle();
  return { data, error };
}

export async function getMetricEntries({ userId, metricId, limit = 100 }) {
  if (!supabase) return { data: [], error: configurationError() };
  const { data, error } = await supabase
    .from('metric_entries')
    .select(ENTRY_COLUMNS)
    .eq('user_id', userId)
    .eq('metric_id', metricId)
    .order('local_date', { ascending: false })
    .order('recorded_at', { ascending: false })
    .limit(limit);
  return { data: data || [], error };
}

export async function createTransformationMetric({
  planId,
  kind,
  label,
  unit,
  clientOperationId = createOperationId(),
}) {
  if (!supabase) return { data: null, error: configurationError() };
  const { data, error } = await supabase.rpc('create_transformation_metric', {
    p_plan_id: planId,
    p_kind: kind,
    p_label: label.trim(),
    p_unit: unit.trim(),
    p_client_operation_id: clientOperationId,
  });
  return { data, error, clientOperationId };
}

export async function recordMetricEntry({
  metricId,
  value,
  localDate,
  note,
  recordedAt = new Date().toISOString(),
  clientOperationId = createOperationId(),
}) {
  if (!supabase) return { data: null, error: configurationError() };
  const { data, error } = await supabase.rpc('record_metric_entry', {
    p_metric_id: metricId,
    p_value: value,
    p_local_date: localDate,
    p_recorded_at: recordedAt,
    p_note: note.trim() || null,
    p_client_operation_id: clientOperationId,
  });
  return { data, error, clientOperationId };
}

export async function updateMetricEntry({
  entryId,
  value,
  localDate,
  note,
  clientOperationId = createOperationId(),
}) {
  if (!supabase) return { data: null, error: configurationError() };
  const { data, error } = await supabase.rpc('update_metric_entry', {
    p_entry_id: entryId,
    p_value: value,
    p_local_date: localDate,
    p_note: note.trim() || null,
    p_client_operation_id: clientOperationId,
  });
  return { data, error, clientOperationId };
}

export async function deleteMetricEntry({
  entryId,
  clientOperationId = createOperationId(),
}) {
  if (!supabase) return { data: null, error: configurationError() };
  const { data, error } = await supabase.rpc('delete_metric_entry', {
    p_entry_id: entryId,
    p_client_operation_id: clientOperationId,
  });
  return { data, error, clientOperationId };
}
