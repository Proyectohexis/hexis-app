import { supabase } from './supabase';

const USER_ID = 'user_001';

export async function getProgress() {
  const { data, error } = await supabase
    .from('progress')
    .select('*')
    .eq('user_id', USER_ID)
    .order('date', { ascending: false });
  return { data, error };
}

export async function addProgress(weight, notes) {
  const { data, error } = await supabase
    .from('progress')
    .insert([{ user_id: USER_ID, weight, notes }])
    .select();
  return { data, error };
}