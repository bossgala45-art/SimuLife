import { inCategory, SHORT } from './helpers.ts'

export const PERSONALITY = inCategory('personality', [
  {
    id: 'personality.traits',
    type: 'multi',
    prompt: 'Choisis jusqu’à trois mots qui te décrivent.',
    maxChoices: 3,
    options: [
      { id: 'curious', label: 'Curieux·se' },
      { id: 'organized', label: 'Organisé·e' },
      { id: 'sociable', label: 'Sociable' },
      { id: 'calm', label: 'Calme' },
      { id: 'creative', label: 'Créatif·ve' },
      { id: 'determined', label: 'Déterminé·e' },
      { id: 'cautious', label: 'Prudent·e' },
      { id: 'spontaneous', label: 'Spontané·e' },
      { id: 'caring', label: 'À l’écoute' },
      { id: 'independent', label: 'Indépendant·e' },
      { id: 'funny', label: 'Drôle' },
    ],
  },
  {
    id: 'personality.morning_evening',
    type: 'single',
    prompt: 'Es-tu plutôt du matin ou du soir ?',
    options: [
      { id: 'morning', label: 'Du matin' },
      { id: 'evening', label: 'Du soir' },
      { id: 'neither', label: 'Ni l’un ni l’autre' },
    ],
  },
  {
    id: 'personality.stress_reaction',
    type: 'single',
    prompt: 'Face au stress, tu as tendance à…',
    options: [
      { id: 'act', label: 'Agir tout de suite' },
      { id: 'step_back', label: 'Prendre du recul' },
      { id: 'talk', label: 'En parler à quelqu’un' },
      { id: 'withdraw', label: 'T’isoler' },
    ],
  },
  {
    id: 'personality.decision_style',
    type: 'single',
    prompt: 'Pour une décision importante, tu écoutes surtout…',
    options: [
      { id: 'reason', label: 'Ta raison' },
      { id: 'intuition', label: 'Ton intuition' },
      { id: 'others', label: 'L’avis des autres' },
    ],
  },
  {
    id: 'personality.risk',
    type: 'single',
    prompt: 'Face à l’inconnu, tu es plutôt…',
    options: [
      { id: 'cautious', label: 'Prudent·e' },
      { id: 'measured', label: 'Mesuré·e' },
      { id: 'bold', label: 'Audacieux·se' },
    ],
  },
  {
    id: 'personality.order',
    type: 'single',
    prompt: 'Ton espace personnel est en général…',
    options: [
      { id: 'very_tidy', label: 'Très rangé' },
      { id: 'tidy', label: 'Plutôt rangé' },
      { id: 'messy', label: 'Plutôt en désordre' },
      { id: 'very_messy', label: 'Très en désordre' },
    ],
  },
  {
    id: 'personality.recharge',
    type: 'single',
    prompt: 'Après une journée chargée, tu te ressources plutôt…',
    options: [
      { id: 'alone', label: 'Seul·e' },
      { id: 'company', label: 'Avec d’autres' },
      { id: 'depends', label: 'Ça dépend' },
    ],
  },
  {
    id: 'personality.habit',
    type: 'text',
    maxLength: SHORT,
    prompt: 'Quelle habitude quotidienne te ressemble le plus ?',
  },
])
