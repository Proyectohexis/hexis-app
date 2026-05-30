import { supabase } from './supabase';

export async function getHabits(userId) {
  const { data, error } = await supabase
    .from('habits')
    .select('*')
    .eq('user_id', userId);
  return { data, error };
}

export async function createHabit(userId, name) {
  const { data, error } = await supabase
    .from('habits')
    .insert([{ user_id: userId, name, completed: false }])
    .select();
  return { data, error };
}

export async function toggleHabit(id, completed) {
  const { data, error } = await supabase
    .from('habits')
    .update({ completed })
    .eq('id', id)
    .select();
  return { data, error };
}
