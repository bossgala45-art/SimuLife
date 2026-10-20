/** Journal structuré : chaque entrée est horodatée, typée et numérotée. */
import type { LogEntry, LogKind, SimulationState } from './types.ts'

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
}
