import { inCategory, SHORT, YES_NO } from './helpers.ts'

export const RELATIONSHIPS = inCategory('relationships', [
  {
    id: 'relationships.best_friend',
    type: 'single',
    prompt: 'Enfant ou adolescent·e, avais-tu un·e meilleur·e ami·e ?',
    options: YES_NO,
  },
  {
    id: 'relationships.best_friend_met',
    type: 'date',
    prompt: 'Quand as-tu rencontré cette personne ?',
    condition: { is: 'relationships.best_friend', options: ['yes'] },
    plausibleAge: [2, 20],
    timeline: { label: 'Rencontre avec ton ou ta meilleur·e ami·e' },
  },
  {
    id: 'relationships.still_in_touch',
    type: 'single',
    prompt: 'Êtes-vous toujours en contact ?',
    condition: { is: 'relationships.best_friend', options: ['yes'] },
    options: YES_NO,
  },
  {
    id: 'relationships.group_size',
    type: 'single',
    prompt: 'Avec les amis, tu préfères…',
    options: [
      { id: 'few', label: 'Un ou deux amis proches' },
      { id: 'small', label: 'Un petit groupe' },
      { id: 'large', label: 'Une grande bande' },
    ],
  },
  {
    id: 'relationships.social_ease',
    type: 'single',
    prompt: 'Te faire de nouveaux amis, c’est…',
    options: [
      { id: 'easy', label: 'Facile' },
      { id: 'rather_easy', label: 'Plutôt facile' },
      { id: 'rather_hard', label: 'Plutôt difficile' },
      { id: 'hard', label: 'Difficile' },
    ],
  },
  {
    id: 'relationships.first_love',
    type: 'single',
    prompt: 'As-tu déjà vécu une relation amoureuse ?',
    help: 'Aucun détail n’est demandé.',
    sensitive: true,
    options: YES_NO,
  },
  {
    id: 'relationships.first_love_date',
    type: 'date',
    prompt: 'Quand a commencé ta première relation amoureuse ?',
    help: 'Une année ou un âge suffit.',
    sensitive: true,
    condition: { is: 'relationships.first_love', options: ['yes'] },
    plausibleAge: [10, 60],
    timeline: { label: 'Première relation amoureuse' },
  },
  {
    id: 'relationships.mentor',
    type: 'single',
    prompt: 'En dehors de ta famille, une personne plus âgée t’a-t-elle guidé·e ?',
    options: YES_NO,
  },
  {
    id: 'relationships.mentor_role',
    type: 'text',
    maxLength: SHORT,
    prompt: 'Quel rôle cette personne jouait-elle dans ta vie ?',
    help: 'Inutile de donner son nom.',
    condition: { is: 'relationships.mentor', options: ['yes'] },
  },
])
