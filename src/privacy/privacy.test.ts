import { beforeEach, describe, expect, it } from 'vitest'
import { newId } from '../destiny/checksum.ts'
import { createSimulation } from '../engine/index.ts'
import { DestinyRepository } from '../storage/destiny.ts'
import { CryptoError, decryptText, encryptText, isEncrypted } from './crypto.ts'
import { eraseAllData } from './erase.ts'
import { checkPin, FREE_ATTEMPTS, hasPin, removePin, setPin } from './lock.ts'

beforeEach(() => localStorage.clear())

describe('exports chiffrés', () => {
  it('chiffre et déchiffre fidèlement ; rien du contenu n’apparaît en clair', async () => {
    const secret = JSON.stringify({ name: 'Vie de Léa', note: 'confidentiel' })
    const sealed = await encryptText(secret, 'phrase de passe longue')
    expect(isEncrypted(sealed)).toBe(true)
    expect(sealed).not.toContain('Léa')
    expect(sealed).not.toContain('confidentiel')
    expect(await decryptText(sealed, 'phrase de passe longue')).toBe(secret)
    // Deux chiffrements du même texte diffèrent (sel et vecteur aléatoires).
    expect(await encryptText(secret, 'phrase de passe longue')).not.toBe(sealed)
  })

  it('refuse une phrase fausse, un fichier modifié, une phrase trop courte', async () => {
    const sealed = await encryptText('{"a":1}', 'bonne phrase')
    await expect(decryptText(sealed, 'mauvaise phrase')).rejects.toThrow('Phrase de passe incorrecte, ou fichier modifié.')
    const env = JSON.parse(sealed)
    env.data = env.data.slice(0, -4) + (env.data.endsWith('AAAA') ? 'BBBB' : 'AAAA')
    await expect(decryptText(JSON.stringify(env), 'bonne phrase')).rejects.toBeInstanceOf(CryptoError)
    await expect(encryptText('x', 'court')).rejects.toThrow(/au moins 8 caractères/)
    expect(isEncrypted('{"format":"simulife-destiny"}')).toBe(false)
  })
})

describe('verrouillage par code', () => {
  it('le code n’est jamais stocké, seule une empreinte salée', async () => {
    await setPin('482915', localStorage, 1000)
    expect(hasPin()).toBe(true)
    expect(localStorage.getItem('simulife.lock.v1')).not.toContain('482915')
    expect(await checkPin('482915')).toEqual({ ok: true })
    expect(await checkPin('000000')).toEqual({ ok: false, reason: 'wrong', remaining: FREE_ATTEMPTS - 1 })
    await expect(setPin('12ab')).rejects.toThrow(/4 à 8 chiffres/)
    removePin()
    expect(hasPin()).toBe(false)
  })

  it('après 5 essais faux, une attente est imposée, puis le bon code fonctionne', async () => {
    await setPin('1234', localStorage, 1000)
    let now = 1_000_000
    for (let i = 0; i < FREE_ATTEMPTS; i++) await checkPin('9999', localStorage, now)
    const blocked = await checkPin('1234', localStorage, now + 1000)
    expect(blocked).toMatchObject({ ok: false, reason: 'blocked' })
    now += 31_000
    expect(await checkPin('1234', localStorage, now)).toEqual({ ok: true })
    expect(await checkPin('9999', localStorage, now)).toMatchObject({ reason: 'wrong', remaining: FREE_ATTEMPTS - 1 })
  })
})

describe('effacement des données', () => {
  it('efface les vies et toutes les clés simulife.*, sans toucher au reste', async () => {
    const name = `effacement-${newId()}`
    const repo = new DestinyRepository(name)
    await repo.createTree({ name: 'Vie', state: createSimulation({ seed: 'x', name: 'Léa', birthDate: { year: 2000, month: 1, day: 1 } }) })
    repo.close()
    localStorage.setItem('simulife.dossier.v1', '{}')
    localStorage.setItem('simulife.cards.b1', '{}')
    localStorage.setItem('autre.site', 'garder')
    await setPin('1234', localStorage, 1000)

    await eraseAllData({ dbName: name })
    const fresh = new DestinyRepository(name)
    expect(await fresh.listTrees()).toEqual([])
    fresh.close()
    expect(Object.keys(localStorage)).toEqual(['autre.site'])
    expect(hasPin()).toBe(false)
  })
})
