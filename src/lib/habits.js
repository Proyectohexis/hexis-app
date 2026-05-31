import { supabase } from './supabase';

export async function getHabits(userId) {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('habits')
    .select('*')
    .eq('user_id', userId);

  if (error) return { data: [], error };

  // Marcar como no completado si la fecha de completado no es hoy
  const habits = (data || []).map(habit => ({
    ...habit,
    completed: habit.completed_date === today,
  }));

  return { data: habits, error: null };
}

export async function toggleHabit(habitId, completed) {
  const today = new Date().toISOString().split('T')[0];

  const { error } = await supabase
    .from('habits')
    .update({
      completed,
      completed_date: completed ? today : null,
    })
    .eq('id', habitId);

  return { error };
}

export async function createHabit(userId, name) {
  const { data, error } = await supabase
    .from('habits')
    .insert([{ user_id: userId, name, completed: false, completed_date: null }])
    .select();

  return { data, error };
}