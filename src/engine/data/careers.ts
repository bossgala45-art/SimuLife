/**
 * Catalogues extensibles : diplômes, formations et métiers.
 *
 * Ajouter un métier ou une formation = ajouter une entrée ; le moteur ne
 * contient aucune règle propre à un métier particulier.
 * Salaires et frais : ordres de grandeur NON VÉRIFIÉS (voir `economy.ts`).
 */
import type { SkillId } from '../types.ts'

export interface DiplomaDefinition {
  id: string
  label: string
  /** Niveau de qualification (3 = CAP, 4 = bac, 5 = bac +2, 6 = licence, 7 = master). */
  level: number
}

/** Conditions d'accès : toutes celles d'une même exigence doivent être remplies. */
export interface Requirement {
  minLevel?: number
  /** Au moins un de ces diplômes. */
  diplomas?: string[]
  /** Niveau minimal par compétence. */
  skills?: Partial<Record<SkillId, number>>
  /** Expérience minimale dans un secteur (jours travaillés). */
  experience?: { sector: string; days: number }
}

export interface CareerDefinition {
  id: string
  label: string
  sector: string
  minAge: number
  /** Une seule de ces exigences suffit ; liste vide = accessible sans condition. */
  anyOf: Requirement[]
  /** Salaire net mensuel, approximatif. */
  salary: { min: number; max: number; approximate: true }
  /** Expérience de compétence gagnée par jour travaillé. */
  skills: Partial<Record<SkillId, number>>
  stressPerHour: number
  fatiguePerHour: number
}

export interface ProgramDefinition {
  id: string
  label: string
  diploma: string
  durationMonths: number
  minAge: number
  requires: Requirement
  /** Frais d'inscription totaux, approximatifs. */
  tuition: { value: number; approximate: true }
  /** Mois de rentrée possibles (vide = toute l'année). */
  startMonths: number[]
  /** Heures d'étude conseillées pour être prêt·e à l'examen. */
  studyHours: number
  /** Expérience de compétence par heure d'étude. */
  skills: Partial<Record<SkillId, number>>
}

export const DIPLOMAS: DiplomaDefinition[] = [
  { id: 'cap_other', label: 'CAP ou BEP', level: 3 },
  { id: 'cap_cuisine', label: 'CAP Cuisine', level: 3 },
  { id: 'cap_elec', label: 'CAP Électricien', level: 3 },
  { id: 'bac', label: 'Baccalauréat ou équivalent', level: 4 },
  { id: 'bac2_other', label: 'Bac +2 ou +3', level: 5 },
  { id: 'bts_compta', label: 'BTS Comptabilité et gestion', level: 5 },
  { id: 'titre_dev', label: 'Titre professionnel de développeur web', level: 5 },
  { id: 'licence', label: 'Licence', level: 6 },
  { id: 'de_infirmier', label: 'Diplôme d’État d’infirmier', level: 6 },
  { id: 'master', label: 'Master', level: 7 },
]

const pay = (min: number, max: number) => ({ min, max, approximate: true as const })
const fee = (value: number) => ({ value, approximate: true as const })

export const CAREERS: CareerDefinition[] = [
  {
    id: 'cashier',
    label: 'Employé·e de caisse',
    sector: 'commerce',
    minAge: 16,
    anyOf: [],
    salary: pay(1400, 1500),
    skills: { communication: 2, organization: 1 },
    stressPerHour: 2.5,
    fatiguePerHour: 1.5,
  },
  {
    id: 'warehouse',
    label: 'Préparateur·rice de commandes',
    sector: 'logistique',
    minAge: 18,
    anyOf: [],
    salary: pay(1400, 1550),
    skills: { manual: 2, organization: 1 },
    stressPerHour: 1.5,
    fatiguePerHour: 3,
  },
  {
    id: 'waiter',
    label: 'Serveur·se',
    sector: 'restauration',
    minAge: 16,
    anyOf: [],
    salary: pay(1450, 1650),
    skills: { communication: 3 },
    stressPerHour: 3,
    fatiguePerHour: 2.5,
  },
  {
    id: 'cook',
    label: 'Cuisinier·ère',
    sector: 'restauration',
    minAge: 18,
    anyOf: [{ diplomas: ['cap_cuisine'] }, { skills: { cooking: 4 } }],
    salary: pay(1600, 1900),
    skills: { cooking: 4 },
    stressPerHour: 3,
    fatiguePerHour: 2.5,
  },
  {
    id: 'electrician',
    label: 'Électricien·ne',
    sector: 'bâtiment',
    minAge: 18,
    anyOf: [{ diplomas: ['cap_elec'] }, { skills: { manual: 6 } }],
    salary: pay(1700, 2100),
    skills: { manual: 4 },
    stressPerHour: 2,
    fatiguePerHour: 2.5,
  },
  {
    id: 'admin_assistant',
    label: 'Assistant·e administratif·ve',
    sector: 'administration',
    minAge: 18,
    anyOf: [{ minLevel: 4, skills: { organization: 2 } }],
    salary: pay(1600, 1850),
    skills: { organization: 3, communication: 1 },
    stressPerHour: 2,
    fatiguePerHour: 1,
  },
  {
    id: 'accountant',
    label: 'Comptable',
    sector: 'gestion',
    minAge: 18,
    anyOf: [{ diplomas: ['bts_compta'] }, { minLevel: 6, skills: { logic: 3 } }],
    salary: pay(2000, 2600),
    skills: { logic: 3, organization: 2 },
    stressPerHour: 2.5,
    fatiguePerHour: 1,
  },
  {
    id: 'developer',
    label: 'Développeur·se web',
    sector: 'numérique',
    minAge: 18,
    anyOf: [{ diplomas: ['titre_dev'] }, { minLevel: 6, skills: { logic: 4 } }, { skills: { logic: 7, creativity: 3 } }],
    salary: pay(2300, 3200),
    skills: { logic: 4, creativity: 2 },
    stressPerHour: 2.5,
    fatiguePerHour: 1,
  },
  {
    id: 'nurse',
    label: 'Infirmier·ère',
    sector: 'santé',
    minAge: 20,
    anyOf: [{ diplomas: ['de_infirmier'] }],
    salary: pay(2000, 2500),
    skills: { communication: 3, organization: 2 },
    stressPerHour: 4,
    fatiguePerHour: 3,
  },
  {
    id: 'teacher',
    label: 'Professeur·e des écoles',
    sector: 'enseignement',
    minAge: 22,
    anyOf: [{ minLevel: 7, skills: { communication: 3 } }],
    salary: pay(2000, 2400),
    skills: { communication: 3, organization: 2 },
    stressPerHour: 3,
    fatiguePerHour: 2,
  },
  {
    id: 'team_lead',
    label: 'Responsable d’équipe en magasin',
    sector: 'commerce',
    minAge: 20,
    anyOf: [{ skills: { organization: 3, communication: 4 }, experience: { sector: 'commerce', days: 200 } }],
    salary: pay(2100, 2700),
    skills: { organization: 3, communication: 3 },
    stressPerHour: 3.5,
    fatiguePerHour: 1.5,
  },
  {
    id: 'graphic_designer',
    label: 'Graphiste',
    sector: 'création',
    minAge: 18,
    anyOf: [{ skills: { creativity: 5 } }, { minLevel: 5, skills: { creativity: 3 } }],
    salary: pay(1700, 2300),
    skills: { creativity: 4 },
    stressPerHour: 2,
    fatiguePerHour: 1,
  },
]

export const PROGRAMS: ProgramDefinition[] = [
  {
    id: 'cap_cuisine',
    label: 'CAP Cuisine (formation adulte)',
    diploma: 'cap_cuisine',
    durationMonths: 12,
    minAge: 16,
    requires: {},
    tuition: fee(0),
    startMonths: [9],
    studyHours: 300,
    skills: { cooking: 8 },
  },
  {
    id: 'cap_elec',
    label: 'CAP Électricien (formation adulte)',
    diploma: 'cap_elec',
    durationMonths: 12,
    minAge: 16,
    requires: {},
    tuition: fee(0),
    startMonths: [9],
    studyHours: 300,
    skills: { manual: 8 },
  },
  {
    id: 'daeu',
    label: 'DAEU (équivalent du baccalauréat)',
    diploma: 'bac',
    durationMonths: 9,
    minAge: 20,
    requires: {},
    tuition: fee(300),
    startMonths: [9],
    studyHours: 250,
    skills: { logic: 5, communication: 3 },
  },
  {
    id: 'bts_compta',
    label: 'BTS Comptabilité et gestion',
    diploma: 'bts_compta',
    durationMonths: 24,
    minAge: 17,
    requires: { minLevel: 4 },
    tuition: fee(0),
    startMonths: [9],
    studyHours: 600,
    skills: { logic: 5, organization: 4 },
  },
  {
    id: 'licence',
    label: 'Licence universitaire',
    diploma: 'licence',
    durationMonths: 36,
    minAge: 17,
    requires: { minLevel: 4 },
    tuition: fee(175),
    startMonths: [9],
    studyHours: 900,
    skills: { logic: 5, communication: 2 },
  },
  {
    id: 'ifsi',
    label: 'Institut de formation en soins infirmiers',
    diploma: 'de_infirmier',
    durationMonths: 36,
    minAge: 17,
    requires: { minLevel: 4 },
    tuition: fee(175),
    startMonths: [9],
    studyHours: 900,
    skills: { communication: 4, organization: 3 },
  },
  {
    id: 'master',
    label: 'Master universitaire',
    diploma: 'master',
    durationMonths: 24,
    minAge: 20,
    requires: { minLevel: 6 },
    tuition: fee(250),
    startMonths: [9],
    studyHours: 600,
    skills: { logic: 3, communication: 3, organization: 3 },
  },
  {
    id: 'titre_dev',
    label: 'Formation intensive de développeur web',
    diploma: 'titre_dev',
    durationMonths: 7,
    minAge: 18,
    requires: {},
    tuition: fee(4000),
    startMonths: [],
    studyHours: 400,
    skills: { logic: 8, creativity: 2 },
  },
]

export const SKILLS: { id: SkillId; label: string }[] = [
  { id: 'cooking', label: 'Cuisine' },
  { id: 'communication', label: 'Communication' },
  { id: 'logic', label: 'Logique' },
  { id: 'manual', label: 'Travail manuel' },
  { id: 'creativity', label: 'Créativité' },
  { id: 'organization', label: 'Organisation' },
]

export const findCareer = (id: string) => CAREERS.find((c) => c.id === id)
export const findProgram = (id: string) => PROGRAMS.find((p) => p.id === id)
export const findDiploma = (id: string) => DIPLOMAS.find((d) => d.id === id)
