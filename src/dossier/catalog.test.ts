import { describe, expect, it } from 'vitest'
import { CATALOG, CATALOG_TARGET, CATEGORIES, QUESTIONNAIRE } from './index.ts'
import type { Question } from './types.ts'

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ')

// Mots trop courants pour distinguer deux questions.
const STOPWORDS = new Set(
  'les des une ton ta tes tu toi est que qui quoi pour avec dans plus quel quelle quels quelles etait etais etiez avait avais as ce cette ces sur par pas ou et de du la le un en au aux a se te t qu il elle on ne sont vous nous mais si comme'.split(
    ' ',
  ),
)
const words = (q: Question) => new Set(normalize(q.prompt).split(/[^a-z]+/).filter((w) => w.length > 2 && !STOPWORDS.has(w)))

const visibleText = (q: Question) =>
  [q.prompt, ...(q.type === 'single' || q.type === 'multi' ? q.options.map((o) => o.label) : [])].join(' | ')

describe('catalogue du dossier de vie', () => {
  it('contient réellement 109 questions (objectif : 500)', () => {
    // Compteur honnête : ce nombre doit être mis à jour à chaque ajout de questions.
    expect(CATALOG).toHaveLength(109)
    expect(CATALOG.length).toBeLessThan(CATALOG_TARGET)
  })

  it('a une structure valide (identifiants, conditions, références)', () => {
    expect(QUESTIONNAIRE.questions).toBe(CATALOG)
  })

  it('couvre les 12 catégories, avec au moins 7 questions chacune', () => {
    expect(CATEGORIES.map((c) => c.id)).toHaveLength(12)
    for (const { id } of CATEGORIES) {
      expect(CATALOG.filter((q) => q.category === id).length, id).toBeGreaterThanOrEqual(7)
    }
    expect(CATALOG.every((q) => CATEGORIES.some((c) => c.id === q.category))).toBe(true)
  })

  it('ne répète aucune question', () => {
    const prompts = CATALOG.map((q) => normalize(q.prompt))
    expect(new Set(prompts).size).toBe(prompts.length)

    // Aucune paire de questions ne partage plus de 60 % de ses mots significatifs.
    const similar: string[] = []
    for (let i = 0; i < CATALOG.length; i++) {
      for (let j = i + 1; j < CATALOG.length; j++) {
        const a = words(CATALOG[i])
        const b = words(CATALOG[j])
        const common = [...a].filter((w) => b.has(w)).length
        const union = new Set([...a, ...b]).size
        if (union > 0 && common / union > 0.6) similar.push(`${CATALOG[i].id} ~ ${CATALOG[j].id}`)
      }
    }
    expect(similar).toEqual([])
  })

  it('est rédigé proprement', () => {
    for (const q of CATALOG) {
      expect(q.prompt, q.id).toMatch(/^[A-ZÀ-Ý]/)
      expect(q.prompt, q.id).toMatch(/( \?|…|\.)$/)
      expect(visibleText(q), q.id).not.toMatch(/'| {2}/) // apostrophe typographique, pas d'espace double
      if (q.type === 'single' || q.type === 'multi') {
        const labels = q.options.map((o) => o.label)
        expect(new Set(labels).size, q.id).toBe(labels.length)
        expect(q.options.filter((o) => o.exclusive).length, q.id).toBeLessThanOrEqual(1)
      }
    }
    const timelineLabels = CATALOG.flatMap((q) => (q.type === 'date' && q.timeline ? [q.timeline.label] : []))
    expect(new Set(timelineLabels).size).toBe(timelineLabels.length)
  })

  it('évite les demandes sensibles inutiles', () => {
    const forbidden = [
      'religi',
      'croyance',
      'politique',
      'vote',
      'orientation sexuelle',
      'sexualite',
      'ethni',
      'nationalite',
      'adresse',
      'numero',
      'telephone',
      'e-mail',
      'mot de passe',
      'securite sociale',
      'casier',
      'condamn',
      'syndic',
      'diagnostic',
      'maladie',
      'traitement',
      'medicament',
      'handicap',
      'poids',
      'salaire',
      'revenu',
      'montant',
      'euro',
      '€',
      'nom de famille',
    ]
    for (const q of CATALOG) {
      const content = normalize(visibleText(q))
      for (const term of forbidden) expect(content, `${q.id} contient « ${term} »`).not.toContain(term)
    }
  })

  it('accompagne chaque question personnelle d’une explication', () => {
    const sensitive = CATALOG.filter((q) => q.sensitive)
    expect(sensitive.length).toBeGreaterThan(0)
    for (const q of sensitive) expect(q.help, q.id).toBeTruthy()
  })
})
