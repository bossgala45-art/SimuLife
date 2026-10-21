/** Icônes originales (tracés simples dessinés pour SIMULIFE). */
export type IconName = 'vie' | 'temps' | 'social' | 'monde' | 'destins' | 'menu'

const PATHS: Record<IconName, string> = {
  // Silhouette : tête et épaules.
  vie: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c0-3.3 3.1-6 7-6s7 2.7 7 6',
  // Horloge.
  temps: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2',
  // Deux personnes.
  social: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9c0-3 2.7-5.5 6-5.5s6 2.5 6 5.5M16 4.5a3.2 3.2 0 0 1 0 6.3M18 14.8c1.8.8 3 2.6 3 5.2',
  // Globe.
  monde: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3Z',
  // Arbre à embranchements.
  destins: 'M12 21v-7m0 0-5-5m5 5 5-5M7 9V5m10 4V5M7 9a2 2 0 1 0 0-.01M17 9a2 2 0 1 0 0-.01',
  menu: 'M4 7h16M4 12h16M4 17h16',
}

export default function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
