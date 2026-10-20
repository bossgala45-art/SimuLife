import { inCategory, YES_NO } from './helpers.ts'

// Catégorie volontairement générale : aucun diagnostic, traitement ni handicap n'est demandé.
export const HEALTH = inCategory('health', [
  {
    id: 'health.first_steps',
    type: 'date',
    prompt: 'À quel âge as-tu fait tes premiers pas ?',
    help: 'Si on te l’a raconté. Un âge approximatif suffit.',
    plausibleAge: [0, 3],
    timeline: { label: 'Premiers pas' },
  },
  {
    id: 'health.general',
    type: 'single',
    prompt: 'Pendant ton enfance, ta santé était plutôt…',
    help: 'Une impression générale suffit. Aucun diagnostic n’est demandé.',
    sensitive: true,
    options: [
      { id: 'very_good', label: 'Très bonne' },
      { id: 'good', label: 'Bonne' },
      { id: 'average', label: 'Moyenne' },
      { id: 'fragile', label: 'Fragile' },
    ],
  },
  {
    id: 'health.hospital',
    type: 'single',
    prompt: 'As-tu été hospitalisé·e avant tes 18 ans ?',
    help: 'Le motif n’est pas demandé.',
    sensitive: true,
    options: YES_NO,
  },
  {
    id: 'health.hospital_date',
    type: 'date',
    prompt: 'Quand a eu lieu cette hospitalisation ?',
    help: 'S’il y en a eu plusieurs, indique la plus marquante.',
    sensitive: true,
    condition: { is: 'health.hospital', options: ['yes'] },
    plausibleAge: [0, 18],
    timeline: { label: 'Hospitalisation' },
  },
  {
    id: 'health.growth',
    type: 'single',
    prompt: 'Par rapport aux enfants de ton âge, tu étais plutôt…',
    options: [
      { id: 'smaller', label: 'Plus petit·e' },
      { id: 'average', label: 'Dans la moyenne' },
      { id: 'taller', label: 'Plus grand·e' },
    ],
  },
  {
    id: 'health.glasses',
    type: 'single',
    prompt: 'Portes-tu des lunettes ou des lentilles ?',
    options: YES_NO,
  },
  {
    id: 'health.glasses_date',
    type: 'date',
    prompt: 'Quand as-tu eu tes premières lunettes ou lentilles ?',
    condition: { is: 'health.glasses', options: ['yes'] },
    timeline: { label: 'Premières lunettes' },
  },
  {
    id: 'health.activity_level',
    type: 'single',
    prompt: 'Au quotidien, tu es…',
    options: [
      { id: 'very_active', label: 'Très actif ou active' },
      { id: 'active', label: 'Assez actif·ve' },
      { id: 'low', label: 'Peu actif·ve' },
      { id: 'sedentary', label: 'Sédentaire' },
    ],
  },
  {
    id: 'health.sleep_hours',
    type: 'number',
    min: 3,
    max: 14,
    unit: 'heures',
    prompt: 'Combien d’heures dors-tu en moyenne par nuit ?',
  },
])
