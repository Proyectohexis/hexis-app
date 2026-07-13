export const WEEKDAYS = [
  { value: 1, short: 'L', label: 'Lunes' },
  { value: 2, short: 'M', label: 'Martes' },
  { value: 3, short: 'X', label: 'Miércoles' },
  { value: 4, short: 'J', label: 'Jueves' },
  { value: 5, short: 'V', label: 'Viernes' },
  { value: 6, short: 'S', label: 'Sábado' },
  { value: 0, short: 'D', label: 'Domingo' },
];

export function formatScheduledWeekdays(values) {
  const unique = new Set(values || []);
  if (unique.size === 7) return 'Todos los días';
  return WEEKDAYS.filter((day) => unique.has(day.value)).map((day) => day.short).join(' · ');
}
