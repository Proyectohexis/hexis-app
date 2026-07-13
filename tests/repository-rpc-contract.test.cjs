'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migrationDirectory = path.join(root, 'supabase', 'migrations');
const sql = fs.readdirSync(migrationDirectory)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => fs.readFileSync(path.join(migrationDirectory, name), 'utf8'))
  .join('\n');
const repositorySource = [
  'planRepository.js',
  'practiceRepository.js',
  'reviewRepository.js',
  'metricRepository.js',
  'privacyRepository.js',
].map((name) => fs.readFileSync(path.join(root, 'src', 'data', 'repositories', name), 'utf8')).join('\n');

const contracts = {
  create_initial_plan: ['p_identity_statement', 'p_outcome_statement', 'p_why_statement', 'p_timezone', 'p_habits', 'p_client_operation_id', 'p_starts_on', 'p_ends_on'],
  create_habit: ['p_plan_id', 'p_name', 'p_minimum_action', 'p_scheduled_weekdays', 'p_timezone', 'p_client_operation_id', 'p_effective_on', 'p_cue_type', 'p_cue_value', 'p_reminder_time', 'p_position'],
  replace_habit_configuration: ['p_habit_id', 'p_name', 'p_minimum_action', 'p_scheduled_weekdays', 'p_timezone', 'p_effective_on', 'p_client_operation_id', 'p_cue_type', 'p_cue_value', 'p_reminder_time', 'p_position'],
  set_habit_status: ['p_habit_id', 'p_status', 'p_effective_on', 'p_client_operation_id'],
  record_habit_completion: ['p_habit_id', 'p_local_date', 'p_occurred_at', 'p_timezone', 'p_client_operation_id', 'p_completion_level', 'p_source'],
  retract_habit_completion: ['p_habit_id', 'p_local_date', 'p_occurred_at', 'p_timezone', 'p_client_operation_id', 'p_source'],
  set_habit_schedule_exception: ['p_habit_id', 'p_local_date', 'p_kind', 'p_reason', 'p_client_operation_id'],
  remove_habit_schedule_exception: ['p_exception_id', 'p_client_operation_id'],
  create_transformation_metric: ['p_plan_id', 'p_kind', 'p_label', 'p_unit', 'p_client_operation_id'],
  record_metric_entry: ['p_metric_id', 'p_value', 'p_local_date', 'p_recorded_at', 'p_note', 'p_client_operation_id'],
  update_metric_entry: ['p_entry_id', 'p_value', 'p_local_date', 'p_note', 'p_client_operation_id'],
  delete_metric_entry: ['p_entry_id', 'p_client_operation_id'],
  complete_weekly_review: ['p_plan_id', 'p_week_start', 'p_reflection', 'p_decision', 'p_client_operation_id'],
  export_current_account: [],
};

function sqlParameters(functionName) {
  const match = new RegExp(`create function public\\.${functionName}\\(([\\s\\S]*?)\\)\\s*returns`, 'i').exec(sql);
  assert.ok(match, `falta la función SQL ${functionName}`);
  return [...match[1].matchAll(/^\s*(p_[a-z0-9_]+)\s+/gim)].map((item) => item[1]);
}

test('los 14 RPC del cliente conservan exactamente la firma versionada en SQL', () => {
  for (const [functionName, parameters] of Object.entries(contracts)) {
    assert.deepEqual(sqlParameters(functionName), parameters, `firma distinta para ${functionName}`);
    assert.match(repositorySource, new RegExp(`\\.rpc\\('${functionName}'`), `el cliente no consume ${functionName}`);
    for (const parameter of parameters) {
      assert.match(repositorySource, new RegExp(`\\b${parameter}\\b`), `el cliente no envía ${functionName}.${parameter}`);
    }
  }
});
