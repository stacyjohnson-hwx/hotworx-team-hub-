import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

// PUBLIC, no auth. Client-facing monthly events calendar for one studio.
// Printable to landscape 8.5x11. HOTWORX brand: Bebas Neue + Montserrat, orange/black.
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

export default function PublicCalendarPage() {
  const { studioId } = useParams()
  const [params] = useSearchParams()
  const now = new Date()
  const [year, setYear] = useState(Number(params.get('year')) || now.getFullYear())
  const [month, setMonth] = useState(Number(params.get('month')) || (now.getMonth() + 1))
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
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
    const key = e.start_date
    ;(eventsByDay[key] = eventsByDay[key] || []).push(e)
  }
  const weeks = monthGrid(year, month)
  const bom = data?.business_of_month

  if (error) return <div style={{ fontFamily: 'Montserrat, sans-serif', padding: 40, textAlign: 'center', color: '#666' }}>This calendar isn’t available.</div>

  return (
    <div className="hwx-cal" style={{ fontFamily: 'Montserrat, sans-serif', color: INK, background: '#fff', minHeight: '100vh' }}>
      <style>{`
        @page { size: landscape; margin: 0.4in; }
        @media print { .no-print { display: none !important; } .hwx-cal { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        .hwx-bebas { font-family: 'Bebas Neue', sans-serif; letter-spacing: .02em; }
        .hwx-cell { border: 1px solid #e5e5e5; min-height: 88px; padding: 4px 6px; vertical-align: top; }
        .hwx-chip { background: ${ORANGE}; color:#fff; border-radius:4px; padding:2px 5px; font-size:10px; font-weight:600; margin-top:3px; line-height:1.25; }
      `}</style>

      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '18px 22px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: `4px solid ${ORANGE}`, paddingBottom: 8 }}>
          <div>
            <div className="hwx-bebas" style={{ fontSize: 40, lineHeight: .9, color: INK }}>
              HOT<span style={{ color: ORANGE }}>WORX</span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.18em', textTransform: 'uppercase', color: '#777' }}>
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
          <button onClick={() => window.print()} style={{ ...btn, background: ORANGE, color: '#fff', border: 'none' }}>Print</button>
        </div>

        <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
          {/* Calendar */}
          <table style={{ flex: 1, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
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
                        <div style={{ fontSize: 12, fontWeight: 700, color: inMonth ? INK : '#bbb' }}>{dt.getDate()}</div>
                        {inMonth && evs.map(e => (
                          <div key={e.id} className="hwx-chip">
                            {e.start_time ? fmtTime(e.start_time) + ' ' : ''}{e.title}
                          </div>
                        ))}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Business of the Month */}
          <div style={{ width: 232, flexShrink: 0 }}>
            <div style={{ border: `2px solid ${ORANGE}`, borderRadius: 10, overflow: 'hidden' }}>
              <div className="hwx-bebas" style={{ background: ORANGE, color: '#fff', fontSize: 20, padding: '8px 12px', textAlign: 'center' }}>
                Business of the Month
              </div>
              <div style={{ padding: 14, textAlign: 'center' }}>
                {bom ? (
                  <>
                    {bom.logo_url
                      ? <img src={bom.logo_url} alt={bom.business_name} style={{ maxWidth: '100%', maxHeight: 120, objectFit: 'contain', marginBottom: 10 }} />
                      : <div className="hwx-bebas" style={{ fontSize: 22, color: INK, marginBottom: 6 }}>{bom.business_name}</div>}
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{bom.business_name}</div>
                    {bom.description && <p style={{ fontSize: 12, color: '#555', marginTop: 6, lineHeight: 1.4 }}>{bom.description}</p>}
                    {bom.website && <div style={{ fontSize: 11, color: ORANGE, marginTop: 8, wordBreak: 'break-all' }}>{bom.website.replace(/^https?:\/\//, '')}</div>}
                  </>
                ) : (
                  <p style={{ fontSize: 12, color: '#999' }}>Coming soon!</p>
                )}
              </div>
            </div>

            {/* Upcoming list (compact, complements the grid) */}
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
                      <div style={{ fontWeight: 700 }}>{e.title}</div>
                      <div style={{ color: '#777' }}>{[fmtTime(e.start_time), e.location].filter(Boolean).join(' · ')}</div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const btn = { fontFamily: 'Montserrat, sans-serif', fontSize: 12, fontWeight: 600, padding: '5px 10px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: 'pointer' }
