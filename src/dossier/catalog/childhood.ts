import { inCategory, LONG, SHORT, YES_NO } from './helpers.ts'

export const CHILDHOOD = inCategory('childhood', [
  {
    id: 'childhood.first_memory',
    type: 'text',
    maxLength: LONG,
    prompt: 'Quel est ton plus ancien souvenir ?',
  },
  {
    id: 'childhood.first_memory_date',
    type: 'date',
    prompt: 'À quel âge, environ, remonte ce souvenir ?',
    help: 'Tu peux répondre par un âge.',
    condition: { answered: 'childhood.first_memory' },
    plausibleAge: [1, 10],
    timeline: { label: 'Plus ancien souvenir', detailFrom: 'childhood.first_memory' },
  },
  {
    id: 'childhood.temperament',
    type: 'single',
    prompt: 'Enfant, tu étais plutôt…',
    options: [
      { id: 'calm', label: 'Calme' },
      { id: 'curious', label: 'Curieux ou curieuse' },
      { id: 'lively', label: 'Turbulent·e' },
      { id: 'shy', label: 'Timide' },
    ],
  },
  {
    id: 'childhood.favorite_game',
    type: 'text',
    maxLength: SHORT,
    prompt: 'Quel était ton jeu préféré ?',
  },
  {
    id: 'childhood.dream_job',
    type: 'text',
    maxLength: SHORT,
    prompt: 'Quel métier rêvais-tu d’exercer quand tu étais enfant ?',
  },
  {
    id: 'childhood.bike',
    type: 'single',
    prompt: 'As-tu appris à faire du vélo ?',
    options: YES_NO,
  },
  {
    id: 'childhood.bike_date',
    type: 'date',
    prompt: 'Quand as-tu roulé à vélo sans roulettes pour la première fois ?',
    condition: { is: 'childhood.bike', options: ['yes'] },
    plausibleAge: [2, 15],
    timeline: { label: 'Premier tour de vélo sans roulettes' },
  },
  {
    id: 'childhood.summers',
    type: 'single',
    prompt: 'Pendant les vacances d’été, tu étais le plus souvent…',
    options: [
      { id: 'home', label: 'À la maison' },
      { id: 'family', label: 'Chez de la famille' },
      { id: 'camp', label: 'En colonie ou en centre de loisirs' },
      { id: 'travel', label: 'En voyage' },
    ],
  },
  {
    id: 'childhood.place',
    type: 'text',
    maxLength: SHORT,
    prompt: 'Quel lieu de ton enfance aimerais-tu revoir ?',
  },
  {
    id: 'childhood.fear',
    type: 'text',
    maxLength: SHORT,
    prompt: 'De quoi avais-tu peur quand tu étais petit·e ?',
  },
])
