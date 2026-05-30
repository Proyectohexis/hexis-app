import { supabase } from './supabase';

export async function getStreak(userId) {
  const { data, error } = await supabase
    .from('streaks')
    .select('*')
    .eq('user_id', userId)
    .single();
  return { data, error };
}

export async function updateStreak(userId) {
  const today = new Date().toISOString().split('T')[0];
  const { data: existing } = await getStreak(userId);

  if (!existing) {
    await supabase.from('streaks').insert([{
      user_id: userId,
      current_streak: 1,
      last_completed: today,
    }]);
    return 1;
  }

  const last = existing.last_completed;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  let newStreak;
  if (last === today) {
    newStreak = existing.current_streak;
  } else if (last === yesterdayStr) {
    newStreak = existing.current_streak + 1;
  } else {
    newStreak = 1;
  }

  await supabase.from('streaks').update({
    current_streak: newStreak,
    last_completed: today,
  }).eq('user_id', userId);

  return newStreak;
}
