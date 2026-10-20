import { useState } from 'react'
import {
  checkCoherence,
  emptyDossier,
  isConfigured,
  nextQuestion,
  QUESTIONNAIRE,
  visibleQuestions,
  type CategoryId,
  type Dossier,
} from '../../dossier/index.ts'
import type { CalendarDate, SimulationState } from '../../engine/index.ts'
import { clearDossier, loadDossier, saveDossier } from '../../storage/dossier.ts'
import { randomSeed } from '../seed.ts'
import OverviewView from './OverviewView.tsx'
import ProfileView from './ProfileView.tsx'
import QuestionView from './QuestionView.tsx'
import ReviewView from './ReviewView.tsx'
import SetupView from './SetupView.tsx'
import TimelineView from './TimelineView.tsx'
import './DossierScreen.css'

type View =
  | { name: 'overview' }
  | { name: 'setup' }
  | { name: 'review'; category: CategoryId }
  | { name: 'timeline' }
  | { name: 'profile' }
  /** `back` : vue à retrouver après une modification ; absent pendant le parcours normal. */
  | { name: 'question'; id: string; back?: View }

type Props = {
  today: CalendarDate
  onBack: () => void
  onStartLife: (state: SimulationState) => void
}

function initialDossier(): { dossier: Dossier; loadError: string | null } {
  const r = loadDossier()
  if (r.status === 'loaded') return { dossier: r.dossier, loadError: null }
  return { dossier: emptyDossier(randomSeed()), loadError: r.status === 'error' ? `Dossier illisible : ${r.message}` : null }
}

export default function DossierScreen({ today, onBack, onStartLife }: Props) {
  const [initial] = useState(initialDossier)
  const [dossier, setDossier] = useState(initial.dossier)
  const [view, setView] = useState<View>({ name: 'overview' })
  const [notice, setNotice] = useState<string | null>(initial.loadError)

  function update(d: Dossier) {
    setDossier(d)
    setNotice(saveDossier(d))
  }

  const issues = checkCoherence(QUESTIONNAIRE, dossier, today)
  const issueCount = {
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
  }

  /** Question suivante sans réponse dans la catégorie, après `fromId` ; sinon le récapitulatif. */
  function continueAfter(d: Dossier, fromId: string): View {
    const category = QUESTIONNAIRE.byId.get(fromId)!.category
    const list = visibleQuestions(QUESTIONNAIRE, d, category)
    const index = list.findIndex((q) => q.id === fromId)
    const next = list.slice(index + 1).find((q) => !d.answers[q.id])
    return next ? { name: 'question', id: next.id } : { name: 'review', category }
  }

  function openCategory(category: CategoryId) {
    const next = nextQuestion(QUESTIONNAIRE, dossier, category)
    setView(next ? { name: 'question', id: next.id } : { name: 'review', category })
  }

  let content
  if (!isConfigured(dossier) || view.name === 'setup') {
    content = (
      <SetupView
        dossier={dossier}
        today={today}
        onSave={(d) => {
          update(d)
          setView({ name: 'overview' })
        }}
        onCancel={isConfigured(dossier) ? () => setView({ name: 'overview' }) : onBack}
      />
    )
  } else if (view.name === 'question') {
    const question = QUESTIONNAIRE.byId.get(view.id)!
    const list = visibleQuestions(QUESTIONNAIRE, dossier, question.category)
    const index = list.findIndex((q) => q.id === view.id)
    const leave = view.back ?? continueAfter(dossier, view.id)
    content = (
      <QuestionView
        key={`${view.id}-${dossier.answers[view.id]?.revision ?? 'new'}`}
        dossier={dossier}
        question={question}
        position={{ index: index + 1, total: list.length }}
        issues={issues.filter((i) => i.questionId === view.id)}
        onAnswer={(d) => {
          update(d)
          // En cas d'incohérence, on reste sur la question pour la montrer.
          if (checkCoherence(QUESTIONNAIRE, d, today).some((i) => i.questionId === view.id)) return
          setView(view.back ?? continueAfter(d, view.id))
        }}
        onPrevious={index > 0 ? () => setView({ name: 'question', id: list[index - 1].id, back: view.back }) : undefined}
        onSkip={() => setView(leave)}
        onClose={() => setView(view.back ?? { name: 'review', category: question.category })}
      />
    )
  } else if (view.name === 'review') {
    content = (
      <ReviewView
        dossier={dossier}
        category={view.category}
        onEdit={(id) => setView({ name: 'question', id, back: view })}
        onBack={() => setView({ name: 'overview' })}
      />
    )
  } else if (view.name === 'timeline') {
    content = (
      <TimelineView
        dossier={dossier}
        issues={issues}
        onEdit={(id) => setView({ name: 'question', id, back: view })}
        onBack={() => setView({ name: 'overview' })}
      />
    )
  } else if (view.name === 'profile') {
    content = (
      <ProfileView
        dossier={dossier}
        errorCount={issueCount.errors}
        onStartLife={onStartLife}
        onBack={() => setView({ name: 'overview' })}
      />
    )
  } else {
    content = (
      <OverviewView
        dossier={dossier}
        issueCount={issueCount}
        onOpenCategory={openCategory}
        onTimeline={() => setView({ name: 'timeline' })}
        onProfile={() => setView({ name: 'profile' })}
        onSetup={() => setView({ name: 'setup' })}
        onErase={() => {
          clearDossier()
          setDossier(emptyDossier(randomSeed()))
          setNotice(null)
          setView({ name: 'overview' })
        }}
        onBack={onBack}
      />
    )
  }

  return (
    <>
      {notice && (
        <p className="dossier__notice" role="alert">
          {notice}
        </p>
      )}
      {content}
    </>
  )
}
