import { useEffect, useState } from 'react'
import { CONSENT_PURPOSES, ConsentRequiredError, grantConsent } from '../../ai/consent.ts'
import { buildAiRequest, suggest, type AiSuggestion, type NarrativeAiAdapter } from '../../ai/narrativeAi.ts'
import {
  formatDateTime,
  markThreadRead,
  MESSAGE_MAX_LENGTH,
  performAction,
  resolveTopic,
  topicOptions,
  unreadCount,
  type Channel,
  type SimulationState,
  type StepResult,
} from '../../engine/index.ts'
import ActionButton from '../life/ActionButton.tsx'
import ConsentDialog from './ConsentDialog.tsx'

type Props = {
  state: SimulationState
  personId: string
  onResult: (result: StepResult) => void
  /** Changement d'état sans passage du temps (messages lus). */
  onState: (state: SimulationState) => void
  ai: NarrativeAiAdapter
}

/** Fil de discussion avec un proche : messages écrits et conversations en personne. */
export default function Conversation({ state, personId, onResult, onState, ai }: Props) {
  const [channel, setChannel] = useState<Channel>('message')
  const [text, setText] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [askConsent, setAskConsent] = useState(false)
  const [aiResult, setAiResult] = useState<AiSuggestion | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const person = state.people.find((p) => p.id === personId)
  const rel = state.relationships[personId]
  const thread = state.narrative.threads[personId] ?? []

  // Ouvrir le fil vaut lecture des messages reçus.
  useEffect(() => {
    if (unreadCount(state, personId) > 0) onState(markThreadRead(state, personId))
  }, [state, personId, onState])

  if (!person || !rel) return <p className="hint">Proche introuvable.</p>
  const options = topicOptions(state, personId, channel)
  const available = options.filter((o) => o.available && o.id !== 'chat')
  const impossible = options.filter((o) => !o.available)
  const action = channel === 'person' ? 'talk' : 'write'

  function send() {
    const topic = resolveTopic(state, personId, 'message', text)
    if (!topic) {
      setNote('Vous avez déjà bien échangé : attends un peu avant d’écrire encore.')
      return
    }
    const result = performAction(state, 'write', { personId, topic, text })
    if (result.ok) {
      const label = options.find((o) => o.id === topic)?.label
      setNote(topic === 'chat' ? 'Message envoyé.' : `Message envoyé, compris comme : « ${label} ».`)
      setText('')
    }
    onResult(result)
  }

  async function askAi(once: boolean) {
    setAskConsent(false)
    setAiError(null)
    try {
      setAiResult(await suggest(ai, state, personId, { once }))
    } catch (e) {
      if (e instanceof ConsentRequiredError) setAskConsent(true)
      else setAiError(e instanceof Error ? e.message : 'Suggestion impossible.')
    }
  }

  return (
    <>
      <section className="card" aria-labelledby="talk-title">
        <h2 id="talk-title">
          {person.name} <span className="person__relation">· {person.relation}</span>
        </h2>
        <p className="hint">
          Proximité {Math.round(rel.closeness)} · Confiance {Math.round(rel.trust)} · Tension {Math.round(rel.tension)}
          {!person.alive && ' · Décédé·e'}
        </p>
        <ol className="thread" aria-label="Échanges">
          {thread.length === 0 && <li className="hint">Aucun échange pour l’instant.</li>}
          {thread.map((m) => (
            <li key={m.id} className={m.from === 'player' ? 'bubble bubble--me' : 'bubble'}>
              <span>{m.text}</span>
              <time>
                {m.channel === 'person' ? 'En personne · ' : ''}
                {formatDateTime(m.at)}
              </time>
            </li>
          ))}
        </ol>
        {thread.some((m) => m.from === 'player' && m.channel === 'message') && (
          <p className="hint">Les réponses écrites arrivent après un délai (jamais la nuit) : fais avancer le temps.</p>
        )}
      </section>

      {person.alive && (
        <section className="card" aria-labelledby="choices-title">
          <div className="segmented segmented--two" role="group" aria-label="Canal">
            <button type="button" className={channel === 'message' ? 'segmented__option segmented__option--on' : 'segmented__option'} aria-pressed={channel === 'message'} onClick={() => setChannel('message')}>
              Messages
            </button>
            <button type="button" className={channel === 'person' ? 'segmented__option segmented__option--on' : 'segmented__option'} aria-pressed={channel === 'person'} onClick={() => setChannel('person')}>
              En personne
            </button>
          </div>
          <h2 id="choices-title" className="subtitle">
            {channel === 'person' ? 'Que lui dire ?' : 'Que lui écrire ?'}
          </h2>
          <ul className="actions">
            {available.map((o) => (
              <li key={o.id}>
                <ActionButton state={state} action={action} params={{ personId, topic: o.id }} label={o.label} onResult={onResult} />
              </li>
            ))}
            <li>
              <ActionButton state={state} action={action} params={{ personId, topic: 'chat' }} label="Discuter de tout et de rien" onResult={onResult} />
            </li>
          </ul>
          {impossible.length > 0 && (
            <details className="impossible">
              <summary>Sujets impossibles maintenant ({impossible.length})</summary>
              <ul className="plain">
                {impossible.map((o) => (
                  <li key={o.id}>
                    {o.label} : {o.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {channel === 'message' && (
            <form
              className="compose"
              onSubmit={(e) => {
                e.preventDefault()
                if (text.trim()) send()
              }}
            >
              <label htmlFor="compose-text">Message libre</label>
              <textarea id="compose-text" value={text} maxLength={MESSAGE_MAX_LENGTH} rows={2} onChange={(e) => setText(e.target.value)} placeholder="Écris ce que tu veux…" />
              <button type="submit" className="btn btn--secondary" disabled={!text.trim()}>
                Envoyer
              </button>
              <p className="hint">Le jeu reconnaît des intentions (excuses, nouvelles, félicitations…) par des règles, sans IA.</p>
            </form>
          )}
          {note && (
            <p className="hint" role="status">
              {note}
            </p>
          )}

          {ai.available && (
            <div className="ai">
              <button type="button" className="btn btn--secondary" onClick={() => void askAi(false)}>
                Suggestion de l’IA ({ai.label})
              </button>
              {aiError && <p className="question__error">{aiError}</p>}
              {aiResult && (
                <div className="ai__result">
                  {aiResult.reply && <p>Réplique proposée : « {aiResult.reply} »</p>}
                  <ul className="actions">
                    {aiResult.proposals.map((p) => (
                      <li key={`${p.action}-${p.params.topic ?? ''}`}>
                        <ActionButton state={state} action={p.action} params={p.params} label={p.label} onResult={onResult} />
                      </li>
                    ))}
                  </ul>
                  {aiResult.rejected.length > 0 && <p className="hint">Écarté par le jeu : {aiResult.rejected.join(' ')}</p>}
                  <p className="hint">Rien n’est appliqué sans ton choix : chaque proposition est vérifiée par le moteur.</p>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {askConsent && (
        <ConsentDialog
          purpose={CONSENT_PURPOSES['ai-narration']}
          preview={JSON.stringify(buildAiRequest(state, personId), null, 2)}
          onOnce={() => void askAi(true)}
          onAlways={() => {
            grantConsent('ai-narration')
            void askAi(false)
          }}
          onRefuse={() => setAskConsent(false)}
        />
      )}
    </>
  )
}
