import { supabase } from './supabase';

export async function getProgress(userId) {
  const { data, error } = await supabase
    .from('progress')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });
  return { data, error };
}

export async function addProgress(userId, weight, notes) {
  const { data, error } = await supabase
    .from('progress')
    .insert([{ user_id: userId, weight, notes }])
    .select();
  return { data, error };
}
