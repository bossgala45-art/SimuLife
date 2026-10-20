import { inCategory, SHORT, YES_NO } from './helpers.ts'

// Aucun montant (revenus, salaires, dettes) n'est demandé : seulement des impressions générales.
export const ECONOMY = inCategory('economy', [
  {
    id: 'economy.childhood_comfort',
    type: 'single',
    prompt: 'Pendant ton enfance, ta famille vivait plutôt…',
    help: 'Une impression générale suffit ; aucun montant n’est demandé.',
    sensitive: true,
    options: [
      { id: 'very_comfortable', label: 'Très à l’aise' },
      { id: 'comfortable', label: 'À l’aise' },
      { id: 'tight', label: 'Avec un budget serré' },
      { id: 'hard', label: 'Difficilement' },
    ],
  },
  {
    id: 'economy.pocket_money',
    type: 'single',
    prompt: 'Recevais-tu de l’argent de poche ?',
    options: YES_NO,
  },
  {
    id: 'economy.first_job',
    type: 'single',
    prompt: 'Avant l’âge de départ, as-tu eu un emploi (même un job d’été) ?',
    options: YES_NO,
  },
  {
    id: 'economy.first_job_kind',
    type: 'text',
    maxLength: SHORT,
    prompt: 'Quel a été ce premier emploi ?',
    condition: { is: 'economy.first_job', options: ['yes'] },
  },
  {
    id: 'economy.first_job_date',
    type: 'date',
    prompt: 'Quand as-tu commencé ce premier emploi ?',
    condition: { is: 'economy.first_job', options: ['yes'] },
    plausibleAge: [13, 40],
    timeline: { label: 'Premier emploi', detailFrom: 'economy.first_job_kind' },
  },
  {
    id: 'economy.situation',
    type: 'single',
    prompt: 'À l’âge de départ, quelle est ta situation principale ?',
    options: [
      { id: 'studies', label: 'En études' },
      { id: 'employed', label: 'En emploi' },
      { id: 'apprentice', label: 'En apprentissage ou en alternance' },
      { id: 'searching', label: 'En recherche d’emploi' },
      { id: 'other', label: 'Autre situation' },
    ],
  },
  {
    id: 'economy.own_home',
    type: 'single',
    prompt: 'À l’âge de départ, as-tu ton propre logement ?',
    options: YES_NO,
  },
  {
    id: 'economy.own_home_date',
    type: 'date',
    prompt: 'Quand as-tu emménagé dans ton premier logement indépendant ?',
    condition: { is: 'economy.own_home', options: ['yes'] },
    plausibleAge: [15, 45],
    timeline: { label: 'Premier logement indépendant' },
  },
  {
    id: 'economy.money_style',
    type: 'single',
    prompt: 'Avec l’argent, tu es plutôt…',
    options: [
      { id: 'saver', label: 'Économe' },
      { id: 'balanced', label: 'Équilibré·e' },
      { id: 'spender', label: 'Dépensier ou dépensière' },
    ],
  },
])
