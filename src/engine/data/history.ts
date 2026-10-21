/**
 * Repères historiques datés.
 *
 * Chaque date a été vérifiée le 21 octobre 2026 sur la source indiquée (citation à
 * l'appui). Pour ajouter un événement : même format, source consultable et citation
 * exacte ; `validateHistory` refuse tout événement incomplet. Aucun événement n'est
 * inventé pour les années que la simulation parcourt au-delà de cette base.
 */
import type { CalendarDate } from '../types.ts'

export type HistoryCategory = 'science' | 'société' | 'économie' | 'sport' | 'catastrophe' | 'monde'

export interface HistoricalEvent {
  id: string
  date: CalendarDate
  /** Dernier jour, pour un événement qui dure. */
  end?: CalendarDate
  title: string
  category: HistoryCategory
  scope: 'France' | 'Monde'
  source: { label: string; url: string; quote: string }
  /** Date de vérification de la source (AAAA-MM-JJ). */
  checkedOn: string
}

const WIKI = 'Wikipédia (fr)'
const CHECKED = '2026-10-21'

export const HISTORICAL_EVENTS: HistoricalEvent[] = [
  {
    id: 'apollo-11',
    date: { year: 1969, month: 7, day: 21 },
    title: 'Premiers pas d’humains sur la Lune (Apollo 11) — date en France',
    category: 'science',
    scope: 'Monde',
    source: { label: WIKI, url: 'https://fr.wikipedia.org/wiki/Apollo_11', quote: 'les premiers hommes posés sur la Lune le lundi 21 juillet 1969' },
    checkedOn: CHECKED,
  },
  {
    id: 'tchernobyl',
    date: { year: 1986, month: 4, day: 26 },
    title: 'Catastrophe nucléaire de Tchernobyl',
    category: 'catastrophe',
    scope: 'Monde',
    source: {
      label: WIKI,
      url: 'https://fr.wikipedia.org/wiki/Catastrophe_nucl%C3%A9aire_de_Tchernobyl',
      quote: 'un accident nucléaire majeur survenu le samedi 26 avril 1986 à 1 h 23 min 45 s dans le réacteur no 4',
    },
    checkedOn: CHECKED,
  },
  {
    id: 'mur-de-berlin',
    date: { year: 1989, month: 11, day: 9 },
    title: 'Chute du mur de Berlin',
    category: 'monde',
    scope: 'Monde',
    source: { label: WIKI, url: 'https://fr.wikipedia.org/wiki/Chute_du_mur_de_Berlin', quote: 'a lieu dans la nuit du 9 novembre 1989' },
    checkedOn: CHECKED,
  },
  {
    id: 'mondial-1998',
    date: { year: 1998, month: 7, day: 12 },
    title: 'La France championne du monde de football (finale contre le Brésil, 3-0)',
    category: 'sport',
    scope: 'France',
    source: {
      label: WIKI,
      url: 'https://fr.wikipedia.org/wiki/Finale_de_la_Coupe_du_monde_de_football_1998',
      quote: 'Elle s’est déroulée le 12 juillet 1998 au Stade de France à Saint-Denis devant 80 000 spectateurs.',
    },
    checkedOn: CHECKED,
  },
  {
    id: '11-septembre',
    date: { year: 2001, month: 9, day: 11 },
    title: 'Attentats du 11 septembre aux États-Unis',
    category: 'monde',
    scope: 'Monde',
    source: { label: WIKI, url: 'https://fr.wikipedia.org/wiki/Attentats_du_11_septembre_2001', quote: 'mardi 11 septembre 2001, en moins de deux heures, entre 8 h 14 et 10 h 3 (heure locale)' },
    checkedOn: CHECKED,
  },
  {
    id: 'euro-fiduciaire',
    date: { year: 2002, month: 1, day: 1 },
    title: 'Les pièces et billets en euros entrent en circulation',
    category: 'économie',
    scope: 'France',
    source: { label: WIKI, url: 'https://fr.wikipedia.org/wiki/Euro', quote: 'il est mis en circulation le 1er janvier 2002 à 0 h sous sa forme fiduciaire' },
    checkedOn: CHECKED,
  },
  {
    id: 'lehman-brothers',
    date: { year: 2008, month: 9, day: 15 },
    title: 'Faillite de la banque Lehman Brothers, au cœur de la crise financière',
    category: 'économie',
    scope: 'Monde',
    source: {
      label: WIKI,
      url: 'https://fr.wikipedia.org/wiki/Lehman_Brothers',
      quote: 'Et le 15 septembre 2008, Lehman Brothers Holdings Inc. se déclare en faillite et se place sous la protection du chapitre 11',
    },
    checkedOn: CHECKED,
  },
  {
    id: '13-novembre',
    date: { year: 2015, month: 11, day: 13 },
    title: 'Attentats du 13 novembre à Paris et Saint-Denis',
    category: 'société',
    scope: 'France',
    source: {
      label: WIKI,
      url: 'https://fr.wikipedia.org/wiki/Attentats_du_13_novembre_2015_en_France',
      quote: 'perpétrées dans la soirée du 13 novembre 2015 à Paris et dans sa périphérie',
    },
    checkedOn: CHECKED,
  },
  {
    id: 'notre-dame',
    date: { year: 2019, month: 4, day: 15 },
    title: 'Incendie de Notre-Dame de Paris',
    category: 'catastrophe',
    scope: 'France',
    source: {
      label: WIKI,
      url: 'https://fr.wikipedia.org/wiki/Incendie_de_Notre-Dame_de_Paris',
      quote: 'L’incendie se déclare le lundi 15 avril 2019 (au début de la Semaine sainte), vers 18 h 20.',
    },
    checkedOn: CHECKED,
  },
  {
    id: 'confinement-2020',
    date: { year: 2020, month: 3, day: 17 },
    end: { year: 2020, month: 5, day: 10 },
    title: 'Premier confinement en France (épidémie de Covid-19)',
    category: 'société',
    scope: 'France',
    source: {
      label: WIKI,
      url: 'https://fr.wikipedia.org/wiki/Confinement_de_2020_en_France',
      quote: 'à partir du 17 mars à midi […] le déconfinement prend effet le 11 mai',
    },
    checkedOn: CHECKED,
  },
  {
    id: 'jo-paris-2024',
    date: { year: 2024, month: 7, day: 26 },
    end: { year: 2024, month: 8, day: 11 },
    title: 'Jeux olympiques d’été à Paris',
    category: 'sport',
    scope: 'France',
    source: {
      label: WIKI,
      url: 'https://fr.wikipedia.org/wiki/Jeux_olympiques_d%27%C3%A9t%C3%A9_de_2024',
      quote: 'ont lieu du 26 juillet au 11 août 2024 à Paris, en France.',
    },
    checkedOn: CHECKED,
  },
]
