/** Propose un fichier texte au téléchargement (sur iPhone : feuille de partage ou app Fichiers). */
export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const errorText = (e: unknown) =>
  e && typeof e === 'object' && 'detail' in e ? String((e as { detail: string }).detail) : e instanceof Error ? e.message : String(e)
