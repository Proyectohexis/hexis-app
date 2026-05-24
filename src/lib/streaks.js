import { supabase } from './supabase';

const USER_ID = 'user_001';

export async function getStreak() {
  const { data, error } = await supabase
    .from('streaks')
    .select('*')
    .eq('user_id', USER_ID)
    .single();
  return { data, error };
}

export async function updateStreak() {
  const today = new Date().toISOString().split('T')[0];

  const { data: existing } = await getStreak();

  if (!existing) {
    await supabase.from('streaks').insert([{
      user_id: USER_ID,
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
  }).eq('user_id', USER_ID);

  return newStreak;
}