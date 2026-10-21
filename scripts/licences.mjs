// Inventaire des licences des dépendances de production (celles embarquées dans l'application).
// Usage : node scripts/licences.mjs > LICENCES-TIERS.md
// Écrit aussi public/licences-tiers.txt : textes complets des licences, publiés avec l'application.
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

const tree = JSON.parse(execSync('npm ls --omit=dev --all --json', { encoding: 'utf8' }))
const found = new Map()
function walk(deps = {}) {
  for (const [name, info] of Object.entries(deps)) {
    if (!info.version || found.has(`${name}@${info.version}`)) continue
    let license = '?'
    let repository = ''
    try {
      const pkg = JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8'))
      license = typeof pkg.license === 'string' ? pkg.license : (pkg.license?.type ?? '?')
      repository = typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository?.url ?? '')
    } catch {}
    found.set(`${name}@${info.version}`, { name, version: info.version, license, repository })
    walk(info.dependencies)
  }
}
walk(tree.dependencies)
const rows = [...found.values()].sort((a, b) => a.name.localeCompare(b.name))
console.log('# Licences des bibliothèques embarquées\n')
console.log('Généré par `node scripts/licences.mjs` à partir des paquets installés (dépendances de production).\n')
console.log('| Paquet | Version | Licence |\n| --- | --- | --- |')
for (const r of rows) console.log(`| ${r.name} | ${r.version} | ${r.license} |`)
const byLicense = Object.groupBy(rows, (r) => r.license)
console.log(`\nRésumé : ${Object.entries(byLicense).map(([l, list]) => `${l} (${list.length})`).join(', ')}.`)

// Textes complets (obligation des licences MIT, BSD et Apache : conserver la notice).
const texts = rows.map((r) => {
  const dir = `node_modules/${r.name}`
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying|notice)(\.|$)/i.test(f))
  const body = file ? readFileSync(`${dir}/${file}`, 'utf8').trim() : `Licence déclarée : ${r.license} (aucun fichier de licence fourni par le paquet).`
  return `==== ${r.name} ${r.version} (${r.license}) ====\n\n${body}\n`
})
writeFileSync('public/licences-tiers.txt', `Licences des bibliothèques utilisées par SIMULIFE\n\n${texts.join('\n')}`)
