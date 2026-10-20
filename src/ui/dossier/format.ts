import { formatFuzzyDate, type AnswerValue, type Question } from '../../dossier/index.ts'

export function formatAnswer(question: Question, value: AnswerValue | undefined): string {
  if (!value) return 'Sans réponse'
  switch (value.kind) {
    case 'unknown':
      return 'Je ne sais pas'
    case 'declined':
      return 'Préfère ne pas répondre'
    case 'text':
      return value.text
    case 'number':
      return question.type === 'number' && question.unit ? `${value.value} ${question.unit}` : String(value.value)
    case 'date':
      return formatFuzzyDate(value.date)
    case 'choice':
    case 'choices': {
      const options = question.type === 'single' || question.type === 'multi' ? question.options : []
      const ids = value.kind === 'choice' ? [value.option] : value.options
      return ids.map((id) => options.find((o) => o.id === id)?.label ?? id).join(', ')
    }
  }
}
