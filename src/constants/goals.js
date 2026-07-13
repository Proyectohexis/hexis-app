export const GOALS = [
  {
    id: 'physical',
    title: 'Un cuerpo más fuerte',
    identity: 'Soy una persona que cuida y entrena su cuerpo.',
  },
  {
    id: 'discipline',
    title: 'Disciplina constante',
    identity: 'Cumplo los compromisos que hago conmigo.',
  },
  {
    id: 'focus',
    title: 'Atención con intención',
    identity: 'Protejo mi atención y actúo con propósito.',
  },
  {
    id: 'whole',
    title: 'Transformación integral',
    identity: 'Construyo una vida coherente, una acción a la vez.',
  },
];

export function getGoalDefinition(goalId) {
  return GOALS.find((goal) => goal.id === goalId) || GOALS[1];
}
