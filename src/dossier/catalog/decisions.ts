import { inCategory, LONG, YES_NO } from './helpers.ts'

export const DECISIONS = inCategory('decisions', [
  {
    id: 'decisions.best',
    type: 'text',
    maxLength: LONG,
    prompt: 'Quelle est la meilleure décision que tu aies prise ?',
  },
  {
    id: 'decisions.best_date',
    type: 'date',
    prompt: 'Quand as-tu pris cette bonne décision ?',
    condition: { answered: 'decisions.best' },
    timeline: { label: 'Meilleure décision', detailFrom: 'decisions.best' },
  },
  {
    id: 'decisions.regret',
    type: 'single',
    prompt: 'Y a-t-il un choix que tu regrettes ?',
    options: YES_NO,
  },
  {
    id: 'decisions.regret_text',
    type: 'text',
    maxLength: LONG,
    prompt: 'Quel est ce choix regretté ?',
    help: 'Tu peux rester vague.',
    condition: { is: 'decisions.regret', options: ['yes'] },
  },
  {
    id: 'decisions.regret_domain',
    type: 'single',
    prompt: 'Ce regret concerne surtout…',
    condition: { is: 'decisions.regret', options: ['yes'] },
    options: [
      { id: 'studies', label: 'Les études' },
      { id: 'work', label: 'Le travail' },
      { id: 'love', label: 'La vie amoureuse' },
      { id: 'friends', label: 'Les amitiés' },
      { id: 'family', label: 'La famille' },
      { id: 'health', label: 'La santé' },
      { id: 'money', label: 'L’argent' },
      { id: 'other', label: 'Autre chose' },
    ],
  },
  {
    id: 'decisions.regret_date',
    type: 'date',
    prompt: 'À quel moment as-tu fait ce choix ?',
    condition: { is: 'decisions.regret', options: ['yes'] },
    timeline: { label: 'Choix regretté', detailFrom: 'decisions.regret_text' },
  },
  {
    id: 'decisions.redo',
    type: 'single',
    prompt: 'Si tu pouvais revenir à ce moment, tu…',
    condition: { is: 'decisions.regret', options: ['yes'] },
    options: [
      { id: 'change', label: 'Ferais un autre choix' },
      { id: 'unsure', label: 'Hésiterais encore' },
      { id: 'keep', label: 'Referais le même choix' },
    ],
  },
  {
    id: 'decisions.crossroad',
    type: 'text',
    maxLength: LONG,
    prompt: 'À quel carrefour de ta vie aimerais-tu voir ce qui se serait passé autrement ?',
  },
  {
    id: 'decisions.advice',
    type: 'text',
    maxLength: LONG,
    prompt: 'Quel conseil donnerais-tu à la personne que tu étais à 15 ans ?',
  },
])
