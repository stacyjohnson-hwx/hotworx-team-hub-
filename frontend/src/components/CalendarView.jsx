import { useState, useEffect } from 'react'
import { renderRichText } from '@/components/RichText'

// Shared monthly events calendar. Reads the PUBLIC (no-auth) endpoint so it
// renders identically whether shown inside the app (embedded) or on the
// standalone public page that QR codes / social links point at.
const API = import.meta.env.VITE_API_URL || 'http://localhost:3001'
const ORANGE = '#E8540A'
const INK = '#141414'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function monthGrid(year, month) {           // month: 1-12
  const first = new Date(year, month - 1, 1)
  const start = new Date(first); start.setDate(1 - first.getDay()) // back to Sunday
  const weeks = []
  let d = new Date(start)
  for (let w = 0; w < 6; w++) {
    const week = []
    for (let i = 0; i < 7; i++) { week.push(new Date(d)); d.setDate(d.getDate() + 1) }
    weeks.push(week)
    if (d.getMonth() !== month - 1 && w >= 4) break
  }
  return weeks
}
const ymd = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
const fmtTime = (t) => {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${(h % 12) || 12}:${String(m).padStart(2, '0')}${h >= 12 ? 'p' : 'a'}`
}
const longDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ''
const timeRange = (e) => [fmtTime(e.start_time), fmtTime(e.end_time)].filter(Boolean).join(' – ')
const parseYmd = (s) => new Date(s + 'T00:00:00')
const dayDiff = (a, b) => Math.round((b - a) / 86400000)

// Lay out one week's events into horizontal bars (Google-Calendar style).
// Multi-day events span columns; each event is assigned a lane so they stack
// without overlapping. Returns items with {e, startCol, endCol, lane, multi, contLeft, contRight}.
function weekBars(week, events) {
  const weekStart = week[0]
  const ws = ymd(week[0]), we = ymd(week[6])
  const items = []
  for (const e of events) {
    const es = e.start_date
    const ee = e.end_date || e.start_date
    if (ee < ws || es > we) continue                       // event doesn't touch this week
    let startCol = dayDiff(weekStart, parseYmd(es < ws ? ws : es))
    let endCol = dayDiff(weekStart, parseYmd(ee > we ? we : ee))
    startCol = Math.max(0, Math.min(6, startCol))
    endCol = Math.max(0, Math.min(6, endCol))
    items.push({ e, startCol, endCol, multi: ee > es, contLeft: es < ws, contRight: ee > we })
  }
  // Longer/earlier events first so multi-day bars take the top lanes.
  items.sort((a, b) =>
    a.startCol - b.startCol ||
    (b.endCol - b.startCol) - (a.endCol - a.startCol) ||
    (a.e.start_time || '').localeCompare(b.e.start_time || '') ||
    a.e.title.localeCompare(b.e.title))
  const lanes = []
  for (const it of items) {
    let lane = 0
    for (;;) {
      const occ = lanes[lane] || (lanes[lane] = [])
      if (occ.every(r => it.endCol < r.s || it.startCol > r.e)) {
        occ.push({ s: it.startCol, e: it.endCol })
        it.lane = lane
        break
      }
      lane++
    }
  }
  return items
}

export default function CalendarView({ studioId, initialMonth, initialYear, embedded = false }) {
  const now = new Date()
  const [year, setYear] = useState(initialYear || now.getFullYear())
  const [month, setMonth] = useState(initialMonth || (now.getMonth() + 1))
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)   // event clicked → detail modal

  useEffect(() => {
    if (!studioId) return
    setData(null); setError(null)
    fetch(`${API}/api/public/calendar/${studioId}?month=${month}&year=${year}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Calendar not found')))
      .then(setData).catch(e => setError(e.message))
  }, [studioId, month, year])

  const step = (delta) => {
    let m = month + delta, y = year
    if (m < 1) { m = 12; y-- } else if (m > 12) { m = 1; y++ }
    setMonth(m); setYear(y)
  }

  const weeks = monthGrid(year, month)
  const bom = data?.business_of_month

  if (!studioId) return <div style={{ fontFamily: 'Montserrat, sans-serif', padding: 40, textAlign: 'center', color: '#666' }}>No studio selected.</div>
  if (error) return <div style={{ fontFamily: 'Montserrat, sans-serif', padding: 40, textAlign: 'center', color: '#666' }}>This calendar isn’t available.</div>

  return (
    <div className="hwx-cal" style={{ fontFamily: 'Montserrat, sans-serif', color: INK, background: '#fff', borderRadius: embedded ? 12 : 0, border: embedded ? '1px solid #eee' : 'none' }}>
      <style>{`
        .hwx-bebas { font-family: 'Bebas Neue', sans-serif; letter-spacing: .02em; }
        /* CSS-grid month: uniform day boxes + an overlay layer for spanning event bars */
        .hwx-grid { display: grid; grid-template-columns: repeat(7, 1fr); }
        .hwx-dow { background: ${INK}; color: #fff; font-size: 16px; text-align: center; padding: 5px 0; border: 1px solid ${INK}; }
        .hwx-week { position: relative; }
        .hwx-day { border: 1px solid #e5e5e5; min-height: 120px; padding: 3px 5px; overflow: hidden; }
        .hwx-daynum { font-size: 12px; font-weight: 700; line-height: 1; }
        .hwx-bars { position: absolute; top: 20px; left: 0; right: 0; bottom: 2px; display: grid;
          grid-template-columns: repeat(7, 1fr); grid-auto-rows: min-content; row-gap: 2px; padding: 0 2px; pointer-events: none; }
        .hwx-bar { pointer-events: auto; background: ${ORANGE}; color: #fff; font-size: 10px; font-weight: 600;
          line-height: 1.15; min-height: 16px; padding: 2px 5px; margin: 0 1px; border-radius: 4px;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; white-space: normal; word-break: break-word; }
        .hwx-clickable { cursor: pointer; }
        .hwx-bar.hwx-clickable:hover { filter: brightness(1.08); }
        .hwx-rich a { color: ${ORANGE}; text-decoration: underline; }
        .hwx-rich h2 { font-size: 15px; font-weight: 700; margin: 8px 0 4px; }
        .hwx-rich ul { list-style: disc; margin: 4px 0 4px 18px; padding-left: 4px; }
        .hwx-rich ol { list-style: decimal; margin: 4px 0 4px 18px; padding-left: 4px; }
        .hwx-rich li { margin: 2px 0; }
        .hwx-rich p { margin: 6px 0; }
        /* Force a single landscape page on print */
        @media print {
          @page { size: landscape; margin: 0.35in; }
          .no-print { display: none !important; }
          .hwx-cal { -webkit-print-color-adjust: exact; print-color-adjust: exact; border: none !important; }
          .hwx-page { max-width: none !important; padding: 0 !important; }
          .hwx-week { page-break-inside: avoid; }
          .hwx-day { min-height: 0.92in !important; padding: 2px 4px !important; }
          .hwx-dow { font-size: 13px !important; padding: 3px 0 !important; }
          .hwx-bars { top: 16px !important; }
          .hwx-bar { font-size: 8px !important; line-height: 1.1 !important; min-height: 11px !important; padding: 1px 4px !important; }
          .hwx-rail { width: 210px !important; }
        }
      `}</style>

      <div className="hwx-page" style={{ maxWidth: 1040, margin: '0 auto', padding: '18px 22px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: `4px solid ${ORANGE}`, paddingBottom: 8 }}>
          <div>
            <img src="/hotworx-logo.png" alt="HOTWORX" style={{ height: 40, width: 'auto', display: 'block' }} />
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.18em', textTransform: 'uppercase', color: '#777', marginTop: 6 }}>
              {data?.studio_name || ''}
            </div>
          </div>
          <div className="hwx-bebas" style={{ fontSize: 46, lineHeight: .9, textAlign: 'right' }}>
            {MONTHS[month - 1]} <span style={{ color: ORANGE }}>{year}</span>
          </div>
        </div>

        {/* Month switcher (screen only) */}
        <div className="no-print" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', margin: '8px 0' }}>
          <button onClick={() => step(-1)} style={btn}>‹ Prev</button>
          <button onClick={() => { setMonth(now.getMonth() + 1); setYear(now.getFullYear()) }} style={btn}>This month</button>
          <button onClick={() => step(1)} style={btn}>Next ›</button>
          {embedded
            ? <a href={`/calendar/${studioId}?month=${month}&year=${year}`} target="_blank" rel="noreferrer" style={{ ...btn, background: ORANGE, color: '#fff', border: 'none', textDecoration: 'none' }}>Open / Print ↗</a>
            : <button onClick={() => window.print()} style={{ ...btn, background: ORANGE, color: '#fff', border: 'none' }}>Print</button>}
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginTop: 10 }}>
          {/* Calendar */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Weekday header */}
            <div className="hwx-grid">
              {DOW.map(d => <div key={d} className="hwx-dow hwx-bebas">{d}</div>)}
            </div>
            {/* Weeks: a grid of day boxes with an overlay of event bars on top */}
            {weeks.map((week, wi) => {
              const bars = weekBars(week, data?.events || [])
              return (
                <div key={wi} className="hwx-week">
                  <div className="hwx-grid">
                    {week.map((dt, di) => {
                      const inMonth = dt.getMonth() === month - 1
                      return (
                        <div key={di} className="hwx-day" style={{ background: inMonth ? '#fff' : '#fafafa' }}>
                          <div className="hwx-daynum" style={{ color: inMonth ? INK : '#bbb' }}>{dt.getDate()}</div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="hwx-bars">
                    {bars.map(b => {
                      const e = b.e
                      const label = b.multi ? e.title : `${e.start_time ? fmtTime(e.start_time) + ' ' : ''}${e.title}`
                      return (
                        <div key={e.id} className="hwx-bar hwx-clickable" title="Tap for details" onClick={() => setSelected(e)}
                          style={{
                            gridColumn: `${b.startCol + 1} / ${b.endCol + 2}`, gridRow: b.lane + 1,
                            borderTopLeftRadius: b.contLeft ? 0 : 4, borderBottomLeftRadius: b.contLeft ? 0 : 4,
                            borderTopRightRadius: b.contRight ? 0 : 4, borderBottomRightRadius: b.contRight ? 0 : 4,
                          }}>
                          {b.contLeft ? '‹ ' : ''}{label}{e.registration_url ? ' ↗' : ''}{b.contRight ? ' ›' : ''}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Side rail */}
          <div className="hwx-rail" style={{ width: 232, flexShrink: 0 }}>
            <div style={{ border: `2px solid ${ORANGE}`, borderRadius: 10, overflow: 'hidden' }}>
              <div className="hwx-bebas" style={{ background: ORANGE, color: '#fff', fontSize: 20, padding: '8px 12px', textAlign: 'center' }}>
                Business of the Month
              </div>
              <div style={{ padding: 14, textAlign: 'center' }}>
                {bom ? (
                  <>
                    {bom.logo_url &&
                      <img src={bom.logo_url} alt={bom.business_name} style={{ maxWidth: '100%', maxHeight: 110, objectFit: 'contain', marginBottom: 10 }} />}
                    <div className="hwx-bebas" style={{ fontSize: 22, color: INK, lineHeight: 1 }}>{bom.business_name}</div>
                    {bom.location && <div style={{ fontSize: 11, color: '#777', marginTop: 4 }}>{bom.location}</div>}
                    {bom.description && <div className="hwx-rich" style={{ fontSize: 12, color: '#555', marginTop: 6, lineHeight: 1.4, textAlign: 'left' }} dangerouslySetInnerHTML={{ __html: renderRichText(bom.description) }} />}
                    {(bom.website || bom.instagram) && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                        {bom.website && (
                          <a href={bom.website.startsWith('http') ? bom.website : `https://${bom.website}`} target="_blank" rel="noreferrer"
                             style={{ fontSize: 11, fontWeight: 700, color: ORANGE, textDecoration: 'none', wordBreak: 'break-all' }}>
                            {bom.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                          </a>
                        )}
                        {bom.instagram && (
                          <a href={bom.instagram} target="_blank" rel="noreferrer" title="Instagram" aria-label="Instagram" style={{ display: 'inline-flex', lineHeight: 0 }}>
                            <InstagramIcon />
                          </a>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <p style={{ fontSize: 12, color: '#999' }}>Coming soon!</p>
                )}
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="hwx-bebas" style={{ fontSize: 18, color: INK, borderBottom: `2px solid ${INK}`, paddingBottom: 2 }}>This Month</div>
              {(data?.events || []).length === 0
                ? <p style={{ fontSize: 12, color: '#999', marginTop: 6 }}>No events scheduled yet.</p>
                : (data?.events || []).map(e => (
                  <div key={e.id} style={{ display: 'flex', gap: 8, marginTop: 7, fontSize: 12 }}>
                    <div className="hwx-bebas" style={{ color: ORANGE, fontSize: 15, minWidth: 26, textAlign: 'center', lineHeight: 1 }}>
                      {new Date(e.start_date + 'T00:00:00').getDate()}
                    </div>
                    <div>
                      <button onClick={() => setSelected(e)} className="hwx-clickable"
                        style={{ fontWeight: 700, color: INK, background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>
                        {e.title}{e.registration_url ? ' ↗' : ''}
                      </button>
                      <div style={{ color: '#777' }}>{[fmtTime(e.start_time), e.location].filter(Boolean).join(' · ')}</div>
                      <div className="no-print" style={{ color: ORANGE, fontSize: 11, fontWeight: 600, cursor: 'pointer' }} onClick={() => setSelected(e)}>Details →</div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* Event detail popup */}
      {selected && (
        <div className="no-print" onClick={() => setSelected(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 16, maxWidth: 440, width: '100%', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,.3)' }}>
            <div style={{ background: ORANGE, color: '#fff', padding: '16px 20px', position: 'relative' }}>
              <div className="hwx-bebas" style={{ fontSize: 26, lineHeight: 1.05, paddingRight: 24 }}>{selected.title}</div>
              <div style={{ fontSize: 12.5, marginTop: 5, fontWeight: 600 }}>
                {longDate(selected.start_date)}{timeRange(selected) ? ` · ${timeRange(selected)}` : ''}
              </div>
              <button onClick={() => setSelected(null)} aria-label="Close"
                style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', color: '#fff', fontSize: 22, lineHeight: 1, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: 20 }}>
              {selected.location && (
                <div style={{ display: 'flex', gap: 6, fontSize: 13, fontWeight: 600, color: INK, marginBottom: 12 }}>
                  <span style={{ color: ORANGE }}>📍</span><span>{selected.location}</span>
                </div>
              )}
              {selected.description
                ? <div className="hwx-rich" style={{ fontSize: 13.5, color: '#333', lineHeight: 1.5 }}
                    dangerouslySetInnerHTML={{ __html: renderRichText(selected.description) }} />
                : <p style={{ fontSize: 13, color: '#999' }}>No additional details.</p>}
              {selected.registration_url && (
                <a href={selected.registration_url} target="_blank" rel="noreferrer"
                  style={{ display: 'block', textAlign: 'center', marginTop: 18, background: ORANGE, color: '#fff', fontWeight: 700, fontSize: 14, padding: '11px 16px', borderRadius: 10, textDecoration: 'none' }}>
                  Register / Sign Up ↗
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const btn = { fontFamily: 'Montserrat, sans-serif', fontSize: 12, fontWeight: 600, padding: '5px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: 'pointer' }

function InstagramIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  )
}
