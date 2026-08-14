// HOTWORX brand devices for the Pre-Sale experience (per the official Brand Guide):
// the red→orange→yellow "heat" gradient, wavy heat-wave lines, condensed all-caps heds.
export const ORANGE = '#F26922'
export const RED = '#FF0500'
export const YELLOW = '#FFBD00'
export const CHARCOAL = '#333334'
export const HEAT = 'linear-gradient(100deg, #FF0500 0%, #F26922 52%, #FFBD00 100%)'
export const HEAT_R = 'linear-gradient(90deg, #FF0500 0%, #F26922 55%, #FFBD00 100%)'

// The iconic "heat wave" lines — a light, repeating wavy overlay.
export function Waves({ className = '', color = '#ffffff', opacity = 0.22 }) {
  const rows = Array.from({ length: 7 })
  return (
    <svg className={className} width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 400 140" aria-hidden="true" style={{ opacity }}>
      {rows.map((_, i) => (
        <path key={i} d={`M0 ${12 + i * 19} q 12.5 -9 25 0 t 25 0 t 25 0 t 25 0 t 25 0 t 25 0 t 25 0 t 25 0 t 25 0 t 25 0 t 25 0 t 25 0 t 25 0 t 25 0 t 25 0 t 25 0`}
          fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      ))}
    </svg>
  )
}

// Condensed, all-caps, tight-tracked section label (evokes Bebas Pro / Montserrat Black).
export function Kicker({ children, className = '' }) {
  return <h2 className={`text-[11px] font-black uppercase tracking-[0.14em] text-gray-500 ${className}`}>{children}</h2>
}
