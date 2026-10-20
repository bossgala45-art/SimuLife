/**
 * Journal structuré : chaque entrée est horodatée, typée et numérotée.
 * Seules les dernières entrées sont gardées pour ne pas saturer le stockage local ;
 * les faits durables (souvenirs, diplômes, dettes) sont conservés ailleurs dans l'état.
 */
import type { LogEntry, LogKind, SimulationState } from './types.ts'

export const LOG_LIMIT = 2500

export function writeLog(
  draft: SimulationState,
  kind: LogKind,
  code: string,
  message: string,
  data?: LogEntry['data'],
): void {
  const entry: LogEntry = { seq: draft.nextLogSeq, at: draft.clock, kind, code, message }
  if (data) entry.data = data
  draft.log.push(entry)
  draft.nextLogSeq++
  if (draft.log.length > LOG_LIMIT) draft.log.splice(0, draft.log.length - LOG_LIMIT)
}
