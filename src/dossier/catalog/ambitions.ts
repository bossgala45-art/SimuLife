import { inCategory, LONG, SHORT } from './helpers.ts'

export const AMBITIONS = inCategory('ambitions', [
  {
    id: 'ambitions.dream',
    type: 'text',
    maxLength: LONG,
    prompt: 'Quel est ton plus grand rêve ?',
  },
  {
    id: 'ambitions.values',
    type: 'multi',
    prompt: 'Qu’est-ce qui compte le plus pour toi dans la vie ?',
    help: 'Jusqu’à trois choix.',
    maxChoices: 3,
    options: [
      { id: 'family', label: 'La famille' },
      { id: 'career', label: 'La carrière' },
      { id: 'friendship', label: 'L’amitié' },
      { id: 'freedom', label: 'La liberté' },
      { id: 'creation', label: 'Créer' },
      { id: 'security', label: 'La sécurité' },
      { id: 'adventure', label: 'L’aventure' },
      { id: 'recognition', label: 'La reconnaissance' },
      { id: 'health', label: 'La santé' },
      { id: 'learning', label: 'Apprendre' },
    ],
  },
  {
    id: 'ambitions.career',
    type: 'text',
    maxLength: SHORT,
    prompt: 'Quel métier ou quelle activité aimerais-tu exercer ?',
  },
  {
    id: 'ambitions.place',
    type: 'single',
    prompt: 'Où aimerais-tu vivre ?',
    options: [
      { id: 'big_city', label: 'Dans une grande ville' },
      { id: 'town', label: 'Dans une ville moyenne' },
      { id: 'countryside', label: 'À la campagne' },
      { id: 'abroad', label: 'À l’étranger' },
      { id: 'anywhere', label: 'Peu importe' },
    ],
  },
  {
    id: 'ambitions.family_project',
    type: 'single',
    prompt: 'Fonder une famille fait-il partie de tes projets ?',
    help: 'Question facultative.',
    sensitive: true,
    options: [
      { id: 'yes', label: 'Oui' },
      { id: 'maybe', label: 'Peut-être' },
      { id: 'no', label: 'Non' },
    ],
  },
  {
    id: 'ambitions.horizon',
    type: 'number',
    min: 1,
    max: 50,
    unit: 'ans',
    prompt: 'Dans combien d’années aimerais-tu atteindre ton objectif principal ?',
  },
  {
    id: 'ambitions.other_life',
    type: 'text',
    maxLength: LONG,
    prompt: 'Dans une autre vie, qui aurais-tu aimé être ?',
  },
])
