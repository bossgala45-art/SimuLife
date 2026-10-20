import { inCategory, LONG, SHORT, YES_NO } from './helpers.ts'

export const IDENTITY = inCategory('identity', [
  {
    id: 'identity.first_name',
    type: 'text',
    maxLength: 40,
    prompt: 'Quel prénom veux-tu donner à ton personnage ?',
    help: 'Ce n’est pas forcément ton vrai prénom.',
  },
  {
    id: 'identity.birth_place_type',
    type: 'single',
    prompt: 'Dans quel type de lieu es-tu né·e ?',
    help: 'Le nom de la ville n’est pas demandé.',
    options: [
      { id: 'big_city', label: 'Une grande ville' },
      { id: 'town', label: 'Une ville moyenne' },
      { id: 'small_town', label: 'Une petite ville' },
      { id: 'countryside', label: 'À la campagne' },
    ],
  },
  {
    id: 'identity.birth_story',
    type: 'text',
    maxLength: LONG,
    prompt: 'Connais-tu une anecdote sur ta naissance ?',
  },
  {
    id: 'identity.same_country',
    type: 'single',
    prompt: 'Vis-tu aujourd’hui dans le pays où tu es né·e ?',
    options: YES_NO,
  },
  {
    id: 'identity.home_languages',
    type: 'single',
    prompt: 'Enfant, combien de langues parlait-on chez toi ?',
    options: [
      { id: 'one', label: 'Une seule' },
      { id: 'two', label: 'Deux' },
      { id: 'more', label: 'Trois ou plus' },
    ],
  },
  {
    id: 'identity.languages_count',
    type: 'number',
    min: 1,
    max: 10,
    prompt: 'Combien de langues parles-tu couramment aujourd’hui ?',
  },
  {
    id: 'identity.nickname',
    type: 'text',
    maxLength: SHORT,
    prompt: 'Quel surnom te donnait-on quand tu étais petit·e ?',
  },
])
