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

  const eventsByDay = {}
  for (const e of data?.events || []) {
    ;(eventsByDay[e.start_date] = eventsByDay[e.start_date] || []).push(e)
  }
  const weeks = monthGrid(year, month)
  const bom = data?.business_of_month

  if (!studioId) return <div style={{ fontFamily: 'Montserrat, sans-serif', padding: 40, textAlign: 'center', color: '#666' }}>No studio selected.</div>
  if (error) return <div style={{ fontFamily: 'Montserrat, sans-serif', padding: 40, textAlign: 'center', color: '#666' }}>This calendar isn’t available.</div>

  return (
    <div className="hwx-cal" style={{ fontFamily: 'Montserrat, sans-serif', color: INK, background: '#fff', borderRadius: embedded ? 12 : 0, border: embedded ? '1px solid #eee' : 'none' }}>
      <style>{`
        .hwx-bebas { font-family: 'Bebas Neue', sans-serif; letter-spacing: .02em; }
        /* Every day is the same fixed box; extra content is clipped, not stretched */
        .hwx-cell { border: 1px solid #e5e5e5; width: 14.285%; height: 118px; padding: 4px 6px; vertical-align: top; overflow: hidden; }
        .hwx-cell-inner { height: 110px; overflow: hidden; }
        .hwx-chip { background: ${ORANGE}; color:#fff; border-radius:4px; padding:2px 5px; font-size:10px; font-weight:600; margin-top:3px; line-height:1.2; overflow:hidden; word-break:break-word; }
        .hwx-clickable { cursor: pointer; }
        .hwx-chip.hwx-clickable:hover { filter: brightness(1.08); }
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
          .hwx-cal { -webkit-print-color-adjust: exact; print-color-adjust: exact; border: none !important; page-break-inside: avoid; }
          .hwx-page { max-width: none !important; padding: 0 !important; }
          .hwx-cal table { page-break-inside: avoid; }
          .hwx-cell { height: 1in !important; padding: 3px 5px !important; }
          .hwx-cell-inner { height: calc(1in - 12px) !important; }
          .hwx-chip { font-size: 8.5px !important; padding: 1px 4px !important; }
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
          <table style={{ flex: 1, width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>{DOW.map(d => <col key={d} style={{ width: '14.285%' }} />)}</colgroup>
            <thead>
              <tr>{DOW.map(d => (
                <th key={d} className="hwx-bebas" style={{ background: INK, color: '#fff', fontSize: 16, padding: '5px 0', border: `1px solid ${INK}` }}>{d}</th>
              ))}</tr>
            </thead>
            <tbody>
              {weeks.map((week, wi) => (
                <tr key={wi}>
                  {week.map((dt, di) => {
                    const inMonth = dt.getMonth() === month - 1
                    const evs = eventsByDay[ymd(dt)] || []
                    return (
                      <td key={di} className="hwx-cell" style={{ background: inMonth ? '#fff' : '#fafafa', opacity: inMonth ? 1 : .45 }}>
                        <div className="hwx-cell-inner">
                          <div style={{ fontSize: 12, fontWeight: 700, color: inMonth ? INK : '#bbb' }}>{dt.getDate()}</div>
                          {inMonth && evs.map(e => {
                            const label = `${e.start_time ? fmtTime(e.start_time) + ' ' : ''}${e.title}`
                            return (
                              <div key={e.id} className="hwx-chip hwx-clickable" title="Tap for details" onClick={() => setSelected(e)}>
                                {label}{e.registration_url ? ' ↗' : ''}
                              </div>
                            )
                          })}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>

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
                    {bom.description && <p style={{ fontSize: 12, color: '#555', marginTop: 6, lineHeight: 1.4 }}>{bom.description}</p>}
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
