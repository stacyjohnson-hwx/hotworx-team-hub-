import { useState, useEffect, useCallback, useRef } from 'react'
import { Upload, Users, HeartHandshake, AlertTriangle, Check, Loader2, RefreshCw, Gauge, ListChecks, Phone, MessageSquare, SkipForward, FileText, Trophy, Gift, Cake, Pencil, Building2, Bold, List, Play, Camera, X, Trash2, CreditCard, ChevronsUpDown, ChevronUp, ChevronDown, UserPlus } from 'lucide-react'
import { apiGet, apiPost, apiPatch, apiPut, apiDelete } from '@/hooks/useApi'
import { useRole } from '@/hooks/useRole'
import { useStudio } from '@/contexts/StudioContext'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

const BASE = '/api/member-activation'

// ─── Script formatting (markdown-lite: **bold** and "- " bullets) ─────────────
// Render markdown-lite (or legacy HTML) to display HTML.
function mdToHtml(s) {
  let t = String(s || '')
  if (/<[a-z][\s\S]*>/i.test(t)) return t   // legacy HTML body — show as-is
  t = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  const out = []; let inList = false
  for (const ln of t.split(/\n/)) {
    const bl = ln.match(/^\s*[-*]\s+(.*)/)
    if (bl) { if (!inList) { out.push('<ul>'); inList = true } out.push(`<li>${bl[1]}</li>`) }
    else { if (inList) { out.push('</ul>'); inList = false } if (ln.trim()) out.push(`${ln}<br>`) }
  }
  if (inList) out.push('</ul>')
  return out.join('')
}
// Plain text for SMS / copy (strip **, bullets → •, strip any legacy HTML tags).
function htmlToText(s) {
  let t = String(s || '')
  if (/<[a-z]/i.test(t)) t = t.replace(/<li[^>]*>/gi, '• ').replace(/<\/li>/gi, '\n')
    .replace(/<br\s*\/?>(?!\n)/gi, '\n').replace(/<\/(p|div|ul|ol)>/gi, '\n').replace(/<[^>]+>/g, '')
  t = t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^\s*[-*]\s+/gm, '• ')
  return t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim()
}
// Render a script for display (formatted).
function RichView({ html, className = '' }) {
  return <div className={`prose-script text-sm text-gray-800 ${className}`} dangerouslySetInnerHTML={{ __html: mdToHtml(html) }} />
}
// Reliable script editor: a real textarea (always editable) + Bold / Bullet buttons.
function RichEditor({ value, onChange, disabled }) {
  const ref = useRef(null)
  const bold = () => {
    const ta = ref.current; if (!ta) return
    const s = ta.selectionStart, e = ta.selectionEnd, v = value || ''
    onChange(v.slice(0, s) + '**' + v.slice(s, e) + '**' + v.slice(e))
    setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = e + 2 }, 0)
  }
  const bullet = () => {
    const ta = ref.current; if (!ta) return
    const s = ta.selectionStart, v = value || ''
    const ls = v.lastIndexOf('\n', s - 1) + 1
    onChange(v.slice(0, ls) + '- ' + v.slice(ls))
    setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = s + 2 }, 0)
  }
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {!disabled && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-100 bg-gray-50">
          <button type="button" onClick={bold} className="p-1 rounded hover:bg-gray-200 text-gray-600" title="Bold (**text**)"><Bold size={13} /></button>
          <button type="button" onClick={bullet} className="p-1 rounded hover:bg-gray-200 text-gray-600" title="Bullet (- item)"><List size={13} /></button>
          <span className="text-[10px] text-gray-400 ml-1">**bold** · "- " for a bullet</span>
        </div>
      )}
      <textarea ref={ref} value={value || ''} onChange={e => onChange(e.target.value)} disabled={disabled} rows={7}
        className="w-full px-3 py-2 text-sm text-gray-800 resize-none focus:outline-none disabled:bg-gray-50" />
    </div>
  )
}

// ─── CSV parsing (client-side; raw rows are POSTed and mapped on the backend) ──
// Auto-detects comma vs. tab delimiter. Throws a friendly error for Excel files.
function parseCSV(text) {
  if (text.slice(0, 2) === 'PK') {
    throw new Error('That looks like an Excel (.xlsx) file. In SAIL, export as CSV (or in Excel: File → Save As → CSV), then upload the .csv.')
  }
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) return []
  const delim = lines[0].includes('\t') && !lines[0].includes(',') ? '\t' : ','
  const parseLine = (line) => {
    const out = []; let cur = '', q = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') q = !q
      else if (c === delim && !q) { out.push(cur); cur = '' }
      else cur += c
    }
    out.push(cur)
    return out.map(v => v.replace(/^["']|["']$/g, '').trim())
  }
  const headers = parseLine(lines[0])
  return lines.slice(1).map(line => {
    const vals = parseLine(line)
    const obj = {}
    headers.forEach((h, i) => { obj[h] = vals[i] })
    return obj
  })
}

const TABS = [
  { k: 'daily',    label: 'Daily List',          icon: ListChecks },
  { k: 'members',  label: 'Members',            icon: Users },
  { k: 'reciprocals', label: 'Reciprocals',     icon: Building2 },
  { k: 'pif',      label: 'PIF Members',         icon: CreditCard },
  { k: 'scripts',  label: 'Scripts',             icon: FileText },
  { k: 'recognition', label: 'Cards & Birthdays', icon: Gift },
  { k: 'import',   label: 'Daily Import',        icon: Upload },
  { k: 'unrecon',  label: 'Unreconciled',        icon: AlertTriangle },
]

export default function MemberActivationPage() {
  const { isOwnerOrManager } = useRole()
  const [tab, setTab] = useState('daily')

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <style>{`.prose-script ul{list-style:disc;padding-left:1.25rem;margin:.25rem 0}.prose-script li{margin:.1rem 0}.prose-script b,.prose-script strong{font-weight:700}`}</style>
      <div className="mb-1 flex items-center gap-2">
        <HeartHandshake className="text-red-600" size={22} />
        <h1 className="text-2xl font-bold text-gray-900">Member Activation</h1>
      </div>
      <p className="text-sm text-gray-500 mb-5">First-90 onboarding foundation — roster, activity, and the cancellation ledger, fed by the daily SAIL exports.</p>

      <div className="flex gap-1 mb-5 border-b border-gray-200 overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap ${
                tab === t.k ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
              <Icon size={15} /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'daily'   && <DailyListTab />}
      {tab === 'scripts' && <ScriptAdminTab canEdit={isOwnerOrManager} />}
      {tab === 'members' && <MembersTab />}
      {tab === 'reciprocals' && <ReciprocalsTab />}
      {tab === 'pif' && <PifTab />}
      {tab === 'recognition' && <RecognitionTab canImport={isOwnerOrManager} />}
      {tab === 'import'  && <ImportTab canImport={isOwnerOrManager} />}
      {tab === 'unrecon' && <UnreconciledTab />}
    </div>
  )
}

// ─── Members ──────────────────────────────────────────────────────────────────
function MembersTab() {
  const { currentStudio } = useStudio()
  const { isOwnerOrManager } = useRole()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all') // all | new | cancelled
  const [sort, setSort] = useState({ key: 'join_date', dir: 'desc' })
  const [editing, setEditing] = useState(null)
  const [detailFor, setDetailFor] = useState(null)
  const todayISO = new Date().toISOString().slice(0, 10)

  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await apiGet(`${BASE}/members`)) } catch { setRows([]) }
    finally { setLoading(false) }
  }, [currentStudio?.id])
  useEffect(() => { load() }, [load])

  const daysSince = (d) => (d ? Math.floor((new Date(todayISO) - new Date(d)) / 86400000) : null)
  const GET = {
    full_name: r => (r.full_name || '').toLowerCase(),
    status: r => (r.status || '').toLowerCase(),
    join_date: r => r.join_date || '',
    visit_days: r => r.visit_days || 0,
    total_sessions: r => r.total_sessions || 0,
    workouts_tried: r => r.workouts_tried || 0,
    last_booking_date: r => r.last_booking_date || '',
    days_since: r => (r.last_booking_date ? daysSince(r.last_booking_date) : 999999),
  }
  const filtered = rows.filter(r => {
    if (filter === 'new' && !r.is_new_member) return false
    if (filter === 'cancelled' && !r.is_cancelled) return false
    if (q && !`${r.full_name} ${r.email} ${r.customer_id}`.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })
  const sorted = [...filtered].sort((a, b) => {
    const av = GET[sort.key](a), bv = GET[sort.key](b)
    const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))
    return sort.dir === 'asc' ? cmp : -cmp
  })
  const sortBy = k => setSort(s => ({ key: k, dir: s.key === k && s.dir === 'asc' ? 'desc' : 'asc' }))
  const Th = ({ k, children, right }) => (
    <th onClick={() => sortBy(k)} className={`px-3 py-2 font-semibold text-gray-600 cursor-pointer hover:text-gray-900 select-none ${right ? 'text-right' : 'text-left'}`}>
      {children}{sort.key === k ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )

  if (loading) return <Spinner />
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, email, id…"
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-red-600/40" />
        {['all', 'new', 'cancelled'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize border ${filter === f ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-300'}`}>
            {f === 'new' ? 'New members' : f}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400">{sorted.length} members</span>
      </div>
      {sorted.length === 0 ? <Empty msg="No members yet — run a Daily Import to load the roster." /> : (
        <div className="overflow-x-auto border border-gray-200 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <Th k="full_name">Member</Th>
                <Th k="status">Status</Th>
                <Th k="join_date">Joined</Th>
                <Th k="visit_days" right>Visit-days</Th>
                <Th k="total_sessions" right>Sessions</Th>
                <Th k="workouts_tried" right>Workouts</Th>
                <Th k="last_booking_date">Last booking</Th>
                <Th k="days_since" right>Days since</Th>
                {isOwnerOrManager && <th className="px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.id} className={`border-b border-gray-100 ${r.is_cancelled ? 'bg-gray-50 text-gray-400' : ''}`}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-800 flex items-center gap-1.5">
                      <button onClick={() => setDetailFor(r.id)} className="text-left hover:text-red-600 hover:underline">{r.full_name || r.customer_id}</button>
                      {r.is_new_member && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">NEW</span>}
                      {r.member_type && r.member_type !== 'member' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 uppercase">{r.member_type}</span>}
                      {r.expiration_date && r.expiration_date < todayISO && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700">EXPIRED</span>}
                      {r.is_cancelled && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">CANCELLED</span>}
                    </div>
                    <div className="text-[11px] text-gray-400">{r.email || '—'} · {r.package_name || '—'}{r.origin_studio ? ` · from ${r.origin_studio}` : ''}{r.expiration_date ? ` · expires ${r.expiration_date}` : ''}</div>
                  </td>
                  <td className="px-3 py-2">{r.status || '—'}</td>
                  <td className="px-3 py-2">{r.join_date || '—'}</td>
                  <td className="px-3 py-2 text-right font-semibold">{r.visit_days}</td>
                  <td className="px-3 py-2 text-right">{r.total_sessions}</td>
                  <td className="px-3 py-2 text-right">{r.workouts_tried}/12</td>
                  <td className="px-3 py-2">{r.last_booking_date || '—'}</td>
                  <td className={`px-3 py-2 text-right font-medium ${daysSince(r.last_booking_date) >= 14 ? 'text-orange-600' : 'text-gray-600'}`}>
                    {r.last_booking_date ? `${daysSince(r.last_booking_date)}d` : '—'}
                  </td>
                  {isOwnerOrManager && (
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => setEditing(r)} className="text-gray-400 hover:text-red-600" title="Edit member">
                        <Pencil size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <MemberEditModal member={editing} onClose={() => setEditing(null)}
        onSaved={(m) => { setRows(rs => rs.map(x => x.id === m.id ? { ...x, ...m } : x)); setEditing(null) }} />}
      {detailFor && <MemberDetailModal memberId={detailFor} onClose={() => setDetailFor(null)} />}
    </div>
  )
}

// ─── Reciprocals — where visiting members come from & how they use the studio ──
const RECIP_BARS = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500', 'bg-sky-500', 'bg-violet-500', 'bg-pink-500', 'bg-teal-500']
function ReciprocalsTab() {
  const { currentStudio } = useStudio()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [detailFor, setDetailFor] = useState(null)
  const [sort, setSort] = useState('sessions')  // sessions | recent | name
  const [tod, setTod] = useState(null)           // time-of-day buckets
  const [homeFilter, setHomeFilter] = useState(null)  // filter member list by home studio

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const [all, t] = await Promise.all([apiGet(`${BASE}/members`), apiGet(`${BASE}/reciprocals/timeofday`).catch(() => null)])
        setRows((all || []).filter(m => m.member_type === 'reciprocal'))
        setTod(t)
      } catch { setRows([]) }
      finally { setLoading(false) }
    })()
  }, [currentStudio?.id])

  const hourLabel = (h) => { const ap = h < 12 ? 'a' : 'p'; const hr = h % 12 === 0 ? 12 : h % 12; return `${hr}${ap}` }

  const daysSince = (d) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null)
  const homeOf = (m) => (m.origin_studio || '').trim() || 'Unknown home studio'

  // Group by home studio for the "where they're from" chart.
  const homeMap = new Map()
  for (const m of rows) {
    const h = homeOf(m)
    if (!homeMap.has(h)) homeMap.set(h, { home: h, members: 0, sessions: 0, visitDays: 0 })
    const g = homeMap.get(h)
    g.members++; g.sessions += (m.total_sessions || 0); g.visitDays += (m.visit_days || 0)
  }
  const homes = [...homeMap.values()].sort((a, b) => b.members - a.members || b.sessions - a.sessions)
  const maxMembers = Math.max(1, ...homes.map(h => h.members))
  const totalSessions = rows.reduce((n, m) => n + (m.total_sessions || 0), 0)

  const recency = (m) => {
    const d = daysSince(m.last_booking_date)
    if (d == null) return { label: 'No visits', cls: 'bg-gray-100 text-gray-500' }
    if (d <= 14) return { label: `Active · ${d}d`, cls: 'bg-green-100 text-green-700' }
    if (d <= 30) return { label: `Lapsing · ${d}d`, cls: 'bg-amber-100 text-amber-700' }
    return { label: `Cold · ${d}d`, cls: 'bg-red-100 text-red-700' }
  }
  const sorted = [...rows]
    .filter(m => !homeFilter || homeOf(m) === homeFilter)
    .sort((a, b) =>
      sort === 'name' ? (a.full_name || '').localeCompare(b.full_name || '')
      : sort === 'recent' ? ((daysSince(a.last_booking_date) ?? 1e9) - (daysSince(b.last_booking_date) ?? 1e9))
      : (b.total_sessions || 0) - (a.total_sessions || 0))

  if (loading) return <Spinner />
  if (rows.length === 0) return <Empty msg="No reciprocal members yet. Add them from the Members or Unreconciled tab (type: Reciprocal)." />

  return (
    <div>
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Reciprocal members', val: rows.length },
          { label: 'Home studios', val: homes.length },
          { label: 'Total sessions', val: totalSessions },
          { label: 'Avg sessions / member', val: rows.length ? Math.round(totalSessions / rows.length) : 0 },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-2xl font-bold text-gray-900">{s.val}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Where they're from */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
        <h3 className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-1.5"><Building2 size={15} className="text-red-600" /> Where they come from</h3>
        <p className="text-[11px] text-gray-400 mb-3">Home studios our visiting members belong to, by number of members. Click a bar to see who they are.</p>
        <div className="space-y-2.5">
          {homes.map((h, i) => {
            const on = homeFilter === h.home
            return (
              <button key={h.home} onClick={() => setHomeFilter(on ? null : h.home)}
                className={`w-full flex items-center gap-3 rounded-md px-1 py-0.5 -mx-1 text-left transition-colors ${on ? 'bg-red-50 ring-1 ring-red-200' : 'hover:bg-gray-50'}`}>
                <div className={`w-40 flex-shrink-0 text-sm truncate ${on ? 'text-red-700 font-semibold' : 'text-gray-700'}`} title={h.home}>{h.home}</div>
                <div className="flex-1 h-6 bg-gray-100 rounded-md overflow-hidden">
                  <div className={`h-full ${RECIP_BARS[i % RECIP_BARS.length]} rounded-md flex items-center justify-end px-2`} style={{ width: `${Math.max(8, (h.members / maxMembers) * 100)}%` }}>
                    <span className="text-[11px] font-bold text-white">{h.members}</span>
                  </div>
                </div>
                <div className="w-24 flex-shrink-0 text-right text-xs text-gray-500">{h.sessions} sessions</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Time of day */}
      {tod && tod.total > 0 && (() => {
        // Show the active window (first→last hour with any sessions).
        const active = tod.buckets.filter(b => b.count > 0)
        const lo = Math.min(...active.map(b => b.hour)), hi = Math.max(...active.map(b => b.hour))
        const shown = tod.buckets.filter(b => b.hour >= lo && b.hour <= hi)
        const maxC = Math.max(1, ...shown.map(b => b.count))
        const peak = tod.buckets.reduce((a, b) => (b.count > a.count ? b : a), { hour: 0, count: 0 })
        return (
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-5">
            <h3 className="text-sm font-bold text-gray-900 mb-1">When they train here</h3>
            <p className="text-[11px] text-gray-400 mb-3">Reciprocal sessions by time of day — busiest around <b className="text-gray-600">{hourLabel(peak.hour)}</b> ({tod.total} sessions).</p>
            <div className="flex items-end gap-1 h-40">
              {shown.map(b => (
                <div key={b.hour} className="flex-1 flex flex-col items-center justify-end h-full" title={`${hourLabel(b.hour)} · ${b.count}`}>
                  <span className="text-[9px] text-gray-400 mb-0.5">{b.count || ''}</span>
                  <div className={`w-full rounded-t ${b.hour === peak.hour ? 'bg-red-600' : 'bg-red-300'}`} style={{ height: `${Math.max(2, (b.count / maxC) * 100)}%` }} />
                  <span className="text-[9px] text-gray-400 mt-1">{hourLabel(b.hour)}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Member list */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <h3 className="text-sm font-bold text-gray-900">Who they are</h3>
        {homeFilter && (
          <button onClick={() => setHomeFilter(null)}
            className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 hover:bg-red-200">
            {homeFilter} · {sorted.length} <X size={11} />
          </button>
        )}
        <div className="ml-auto flex items-center gap-1">
          {[['sessions', 'Most active'], ['recent', 'Recently in'], ['name', 'Name']].map(([k, lbl]) => (
            <button key={k} onClick={() => setSort(k)}
              className={`text-xs px-2.5 py-1 rounded-full font-semibold ${sort === k ? 'bg-red-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>{lbl}</button>
          ))}
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {sorted.map(m => {
          const rec = recency(m)
          return (
            <div key={m.id} onClick={() => setDetailFor(m.id)}
              className="bg-white border border-gray-200 rounded-xl p-3.5 cursor-pointer hover:border-red-300 hover:shadow-sm transition">
              <div className="flex items-start justify-between gap-2">
                <span className="font-bold text-gray-900">{m.full_name || m.email}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${rec.cls}`}>{rec.label}</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1"><Building2 size={11} className="text-gray-400" /> {homeOf(m)}</p>
              <div className="flex items-center gap-4 mt-2.5">
                <div><p className="text-lg font-bold text-gray-900 leading-none">{m.total_sessions || 0}</p><p className="text-[10px] text-gray-400 mt-0.5">sessions</p></div>
                <div><p className="text-lg font-bold text-gray-900 leading-none">{m.visit_days || 0}</p><p className="text-[10px] text-gray-400 mt-0.5">visit-days</p></div>
                <div className="ml-auto text-right"><p className="text-xs font-medium text-gray-700">{m.last_booking_date || '—'}</p><p className="text-[10px] text-gray-400">last booking</p></div>
              </div>
            </div>
          )
        })}
      </div>

      {detailFor && <MemberDetailModal memberId={detailFor} onClose={() => setDetailFor(null)} />}
    </div>
  )
}

// ─── PIF members — paid-in-full, with last booking + click-in to sessions ─────
function PifTab() {
  const { currentStudio } = useStudio()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [detailFor, setDetailFor] = useState(null)
  const [sort, setSort] = useState({ key: 'default', dir: 'asc' })  // default = active-first, expired last
  const [editExp, setEditExp] = useState(null)  // member id whose expiry is being edited

  useEffect(() => {
    (async () => {
      setLoading(true)
      try { const all = await apiGet(`${BASE}/members`); setRows((all || []).filter(m => m.member_type === 'pif')) }
      catch { setRows([]) }
      finally { setLoading(false) }
    })()
  }, [currentStudio?.id])

  const saveExp = async (m, value) => {
    setRows(rs => rs.map(x => x.id === m.id ? { ...x, expiration_date: value || null } : x))
    setEditExp(null)
    try { await apiPatch(`${BASE}/members/${m.id}`, { expiration_date: value || null }) } catch { /* ignore */ }
  }

  const daysSince = (d) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null)
  const todayISO = new Date().toISOString().slice(0, 10)
  const curYM = todayISO.slice(0, 7)
  const isExpired = (m) => m.expiration_date && m.expiration_date < todayISO
  const isExpiringThisMonth = (m) => m.expiration_date && !isExpired(m) && m.expiration_date.slice(0, 7) === curYM

  if (loading) return <Spinner />
  if (rows.length === 0) return <Empty msg="No PIF members yet. Set a member's type to 'Paid in full' (Members tab or Unreconciled → Add person) to track them here." />

  const expiringCount = rows.filter(isExpiringThisMonth).length
  const expiredCount = rows.filter(isExpired).length

  const val = {
    name: m => (m.full_name || m.email || '').toLowerCase(),
    sessions: m => m.total_sessions || 0,
    last: m => m.last_booking_date || '',
    expires: m => m.expiration_date || '',
  }
  const sorted = [...rows].sort((a, b) => {
    if (sort.key === 'default') {
      const ea = isExpired(a) ? 1 : 0, eb = isExpired(b) ? 1 : 0
      if (ea !== eb) return ea - eb                                  // expired pinned to bottom
      const xa = a.expiration_date || '', xb = b.expiration_date || ''
      if (ea === 0) { if (!xa && !xb) return 0; if (!xa) return 1; if (!xb) return -1; return xa.localeCompare(xb) }  // soonest first
      return xb.localeCompare(xa)                                     // expired: most recent first
    }
    const dir = sort.dir === 'asc' ? 1 : -1
    let va = val[sort.key](a), vb = val[sort.key](b)
    if (va === '') va = sort.dir === 'asc' ? '9999' : ''             // blanks last
    if (vb === '') vb = sort.dir === 'asc' ? '9999' : ''
    return va < vb ? -1 * dir : va > vb ? 1 * dir : 0
  })

  const clickSort = (k, defDir) => setSort(s => s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: defDir })
  const Arrow = ({ k }) => sort.key !== k ? <ChevronsUpDown size={12} className="inline text-gray-300" /> : (sort.dir === 'asc' ? <ChevronUp size={12} className="inline text-red-600" /> : <ChevronDown size={12} className="inline text-red-600" />)
  const Th = ({ k, defDir, align = 'left', children }) => (
    <th onClick={() => clickSort(k, defDir)}
      className={`text-${align} px-3 py-2.5 font-semibold cursor-pointer select-none hover:text-gray-800`}>
      {children} <Arrow k={k} />
    </th>
  )

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <p className="text-sm text-gray-500">{rows.length} paid-in-full member{rows.length === 1 ? '' : 's'}. Click anyone to see their sessions.</p>
        {expiringCount > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{expiringCount} expiring this month</span>}
        {expiredCount > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{expiredCount} expired</span>}
      </div>
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
            <tr>
              <Th k="name" defDir="asc">Member</Th>
              <Th k="sessions" defDir="desc" align="right">Sessions</Th>
              <Th k="last" defDir="desc">Last booking</Th>
              <Th k="expires" defDir="asc">Expires (PIF)</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map(m => {
              const ds = daysSince(m.last_booking_date)
              const exp = isExpired(m), soon = isExpiringThisMonth(m)
              return (
                <tr key={m.id} onClick={() => setDetailFor(m.id)}
                  className={`cursor-pointer ${exp ? 'bg-red-50/40 hover:bg-red-50' : 'hover:bg-gray-50'}`}>
                  <td className={`px-4 py-2.5 font-semibold ${exp ? 'text-gray-500' : 'text-gray-900'}`}>{m.full_name || m.email}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700 font-medium">{m.total_sessions || 0}</td>
                  <td className={`px-3 py-2.5 ${ds >= 30 ? 'text-red-600' : ds >= 14 ? 'text-amber-600' : 'text-gray-600'}`}>{m.last_booking_date || '—'}{ds != null ? ` · ${ds}d ago` : ''}</td>
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    {editExp === m.id ? (
                      <input type="date" defaultValue={m.expiration_date || ''} autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setEditExp(null) }}
                        onBlur={e => saveExp(m, e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-red-500/30" />
                    ) : (
                      <button onClick={() => setEditExp(m.id)} className="inline-flex items-center gap-1.5 group" title="Edit expiration date">
                        <span className={exp ? 'text-gray-400 line-through' : 'text-gray-600'}>{m.expiration_date || 'Set date'}</span>
                        <Pencil size={11} className="text-gray-300 group-hover:text-red-500" />
                        {exp && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 align-middle">EXPIRED</span>}
                        {soon && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 align-middle">EXPIRES THIS MONTH</span>}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {detailFor && <MemberDetailModal memberId={detailFor} onClose={() => setDetailFor(null)} />}
    </div>
  )
}

// ─── New Members — last 60 days, each with their full onboarding checklist ─────
const TP_STYLE = {
  done: 'bg-green-100 text-green-700',
  due: 'bg-red-100 text-red-700 ring-1 ring-red-200',
  upcoming: 'bg-gray-50 text-gray-400 border border-gray-100',
  na: 'bg-gray-50 text-gray-300 border border-gray-100',
  skipped: 'bg-gray-100 text-gray-400 line-through',
}
function NewMembersTab() {
  const { currentStudio } = useStudio()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [detailFor, setDetailFor] = useState(null)
  const [editing, setEditing] = useState(null)  // { member, tp }
  const [sort, setSort] = useState('due')  // due | newest | progress

  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await apiGet(`${BASE}/new-members`)) } catch { setRows([]) }
    finally { setLoading(false) }
  }, [currentStudio?.id])
  useEffect(() => { load() }, [load])

  if (loading) return <Spinner />
  if (rows.length === 0) return <Empty msg="No new members in the last 60 days." />

  const sorted = [...rows].sort((a, b) =>
    sort === 'newest' ? (a.days_in - b.days_in)
    : sort === 'progress' ? (b.done_count - a.done_count)
    : (b.due_count - a.due_count || a.days_in - b.days_in))
  const totalDue = rows.reduce((n, r) => n + r.due_count, 0)

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <p className="text-sm text-gray-500">{rows.length} new member{rows.length === 1 ? '' : 's'} in the last 60 days. Each shows their full onboarding checklist — click a name for sessions & details.</p>
        {totalDue > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{totalDue} touchpoint{totalDue === 1 ? '' : 's'} due</span>}
        <div className="ml-auto flex items-center gap-1">
          {[['due', 'Needs attention'], ['newest', 'Newest'], ['progress', 'Most progress']].map(([k, lbl]) => (
            <button key={k} onClick={() => setSort(k)}
              className={`text-xs px-2.5 py-1 rounded-full font-semibold ${sort === k ? 'bg-red-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>{lbl}</button>
          ))}
        </div>
      </div>
      <div className="space-y-2.5">
        {sorted.map(m => (
          <div key={m.member_id} className="bg-white border border-gray-200 rounded-xl p-3.5">
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => setDetailFor(m.member_id)} className="font-bold text-gray-900 hover:text-red-600 hover:underline">{m.full_name || '—'}</button>
              <span className="text-xs text-gray-400">Day {m.days_in} · {m.visit_days} visit-days · joined {m.join_date}</span>
              {m.due_count > 0
                ? <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">{m.due_count} due</span>
                : <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">on track</span>}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {m.touchpoints.map(t => (
                <button key={t.key} onClick={() => setEditing({ member: m, tp: t })} title="Check off / add notes"
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full hover:ring-1 hover:ring-gray-300 ${TP_STYLE[t.status] || TP_STYLE.na}`}>
                  {t.status === 'done' ? '✓ ' : ''}{t.label}{t.notes ? ' 📝' : ''}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {editing && <TouchpointEditModal member={editing.member} tp={editing.tp}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
      {detailFor && <JourneyModal memberId={detailFor} onClose={() => setDetailFor(null)} />}
    </div>
  )
}

function TouchpointEditModal({ member, tp, onClose, onSaved }) {
  const { currentStudio } = useStudio()
  const [done, setDone] = useState(tp.status === 'done')
  const [notes, setNotes] = useState(tp.notes || '')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploaded, setUploaded] = useState(null)  // {url, type}
  const fileRef = useRef(null)

  const save = async () => {
    setSaving(true)
    try { await apiPost(`${BASE}/new-members/${member.member_id}/touchpoint`, { key: tp.key, done, notes }); onSaved() }
    catch (e) { alert('Save failed: ' + (e?.message || 'error')); setSaving(false) }
  }
  // Upload a photo/video → store, add to the content library, tag this member.
  const onUpload = async (e) => {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file || !currentStudio?.id) return
    setUploading(true)
    try {
      const isVideo = file.type.startsWith('video')
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${currentStudio.id}/library/${Date.now()}-${safe}`
      const { error: upErr } = await supabase.storage.from('marketing-content').upload(path, file, { upsert: false, contentType: file.type })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from('marketing-content').getPublicUrl(path)
      await apiPost('/api/marketing/content', {
        file_url: publicUrl, file_path: path, file_type: isVideo ? 'video' : 'photo',
        category: isVideo ? 'member_videos' : 'member_photos', member_ids: [member.member_id], member_name: member.full_name || null,
      })
      setUploaded({ url: publicUrl, type: isVideo ? 'video' : 'photo' })
      setDone(true)  // a photo on file completes this touchpoint
    } catch (err) { alert('Upload failed: ' + (err?.message || 'error')) }
    finally { setUploading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">{tp.label}</h3>
          <p className="text-xs text-gray-400">{member.full_name}</p>
        </div>
        <div className="p-5 space-y-4">
          {/* Photo upload — tags the member + adds to the content library */}
          <div>
            <input ref={fileRef} type="file" accept="image/*,video/*" onChange={onUpload} className="hidden" />
            {uploaded ? (
              <div className="flex items-center gap-3">
                {uploaded.type === 'photo'
                  ? <img src={uploaded.url} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-200" />
                  : <video src={`${uploaded.url}#t=0.5`} className="w-16 h-16 rounded-lg object-cover border border-gray-200" />}
                <div className="text-xs text-green-600 font-semibold flex items-center gap-1"><Check size={13} /> Added to library & tagged</div>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl py-3 text-sm font-semibold text-gray-600 hover:border-red-400 hover:text-red-600 disabled:opacity-50">
                {uploading ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
                {uploading ? 'Uploading…' : 'Upload a photo'}
              </button>
            )}
            <p className="text-[11px] text-gray-400 mt-1">Auto-tags {member.full_name?.split(' ')[0] || 'them'} and saves to the Content Library.</p>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={done} onChange={e => setDone(e.target.checked)} className="w-4 h-4 accent-red-600" />
            <span className="text-sm font-semibold text-gray-800">Done</span>
          </label>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="How it went, what they said, follow-ups…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-500/30" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-1.5 text-sm font-semibold text-white bg-red-600 rounded-lg disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Member journey — a visual, fun view of a new member's first-90 ───────────
const NODE_STYLE = {
  done: 'bg-green-500 text-white ring-2 ring-green-200',
  due: 'bg-red-500 text-white ring-2 ring-red-200 animate-pulse',
  upcoming: 'bg-white text-gray-400 border-2 border-dashed border-gray-300',
  skipped: 'bg-gray-200 text-gray-400',
  na: 'bg-gray-50 text-gray-300 border border-gray-200',
}
const NODE_SHORT = { day_0_orientation: 'Orient', photo: '📸', day_2: 'Day 2', day_5: 'Day 5', day_21: 'Day 21', day_30: 'Day 30', day_60: 'Day 60', day_90: 'Day 90', thank_you_card: '💌', passport: '🎟' }
const fmtWhen2 = (w) => { if (!w) return ''; try { return new Date(w).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) } catch { return String(w).slice(0, 10) } }

function JourneyModal({ memberId, onClose }) {
  const [d, setD] = useState(null)
  const [editing, setEditing] = useState(null)
  const [viewer, setViewer] = useState(null)

  const load = useCallback(async () => {
    try { setD(await apiGet(`${BASE}/members/${memberId}/journey`)) } catch { setD(false) }
  }, [memberId])
  useEffect(() => { load() }, [load])

  const pct = d && d.progress.total ? Math.round(d.progress.done / d.progress.total * 100) : 0
  const cheer = pct === 100 ? 'Journey complete! 🎉' : pct >= 60 ? 'Crushing it 💪' : pct >= 30 ? 'Great momentum 🔥' : 'Just getting started 🌱'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {!d ? <div className="p-16"><Spinner /></div> : (
          <>
            {/* Banner */}
            <div className="relative px-6 py-5 bg-gradient-to-r from-red-600 to-orange-500 text-white rounded-t-2xl">
              <button onClick={onClose} className="absolute top-3 right-4 text-white/80 hover:text-white text-lg">✕</button>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center text-2xl font-black flex-shrink-0">{(d.member.full_name || '?').slice(0, 1).toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-black truncate">{d.member.full_name}</h2>
                  <p className="text-white/80 text-sm">{d.member.days_in != null ? `Day ${d.member.days_in} of their first 90` : 'Member'} · joined {d.member.join_date || '—'}</p>
                </div>
                <div className="text-center flex-shrink-0">
                  <div className="relative w-16 h-16">
                    <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="3" />
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="white" strokeWidth="3" strokeDasharray={`${pct} 100`} strokeLinecap="round" />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-sm font-black">{pct}%</span>
                  </div>
                  <p className="text-[10px] text-white/80 mt-0.5">{d.progress.done}/{d.progress.total}</p>
                </div>
              </div>
              <p className="mt-2 text-sm font-semibold">{cheer}</p>
            </div>

            <div className="p-6 space-y-6">
              {d.member.goal_text && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-2.5 text-sm">
                  <span className="text-orange-700 font-bold">🎯 Their goal:</span> <span className="text-gray-700">{d.member.goal_text}</span>
                </div>
              )}

              {/* Journey path */}
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">The journey — tap a step to check it off</p>
                <div className="flex items-start gap-1 overflow-x-auto pb-2">
                  {d.touchpoints.map((t, i) => (
                    <div key={t.key} className="flex items-start">
                      {i > 0 && <div className="w-4 h-9 flex items-center"><div className="h-0.5 w-full bg-gray-200" /></div>}
                      <button onClick={() => setEditing(t)} className="flex flex-col items-center gap-1 group flex-shrink-0 w-16">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${NODE_STYLE[t.status] || NODE_STYLE.na} group-hover:scale-110 transition`}>
                          {t.status === 'done' ? '✓' : (NODE_SHORT[t.key] || '').slice(0, 3)}
                        </div>
                        <span className="text-[9px] text-gray-500 text-center leading-tight">{t.label}{t.notes ? ' 📝' : ''}</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Achievements */}
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Achievements</p>
                <div className="flex flex-wrap gap-2">
                  {d.milestones.map(mi => (
                    <span key={mi.key} className={`text-xs font-bold px-2.5 py-1 rounded-full ${mi.earned ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-white shadow-sm' : 'bg-gray-100 text-gray-300'}`}>
                      {mi.earned ? '🏅 ' : '🔒 '}{mi.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-4 gap-2 text-center">
                {[['Visit-days', d.activity.visit_days], ['Sessions', d.activity.total_sessions], ['Workouts', `${d.activity.workouts_tried}/12`], ['Last in', d.activity.last_booking_date || '—']].map(([l, v]) => (
                  <div key={l} className="bg-gray-50 rounded-xl py-2"><p className="text-sm font-bold text-gray-900">{v}</p><p className="text-[10px] text-gray-400">{l}</p></div>
                ))}
              </div>

              {/* Quick chips */}
              <div className="flex flex-wrap gap-2">
                {d.member.birthday && <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-pink-100 text-pink-700">🎂 Birthday {d.member.birthday}</span>}
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${d.touchpoints.find(t => t.key === 'thank_you_card')?.status === 'done' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>💌 Thank-you card {d.touchpoints.find(t => t.key === 'thank_you_card')?.status === 'done' ? 'sent' : 'not yet'}</span>
              </div>

              {/* Photos */}
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Photos ({d.photos.length})</p>
                {d.photos.length === 0 ? <p className="text-xs text-gray-400">No photos yet — snap a 1st-day pic to kick off their story! 📸</p> : (
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {d.photos.map((p, i) => (
                      <button key={i} onClick={() => setViewer(p)} className="relative block aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-100 group">
                        {p.type === 'photo'
                          ? <img src={p.url} alt="" className="w-full h-full object-cover" />
                          : <><video src={`${p.url}#t=0.5`} preload="metadata" muted playsInline className="w-full h-full object-cover" /><div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/25"><Play size={16} className="text-white" fill="currentColor" /></div></>}
                        {p.caption && <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[8px] px-1 truncate">{p.caption}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Bookings + Timeline side by side on wide */}
              <div className="grid md:grid-cols-2 gap-5">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Recent sessions ({d.bookings.length})</p>
                  {d.bookings.length === 0 ? <p className="text-xs text-gray-400">No sessions yet.</p> : (
                    <div className="border border-gray-100 rounded-xl divide-y divide-gray-50 max-h-56 overflow-y-auto">
                      {d.bookings.slice(0, 40).map((s, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                          <span className="font-medium text-gray-800 w-20 flex-shrink-0">{s.booking_date}</span>
                          <span className="text-gray-400 w-16 flex-shrink-0">{s.time_slot || ''}</span>
                          <span className="text-gray-600 truncate">{s.session_type || ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Our story together</p>
                  {d.timeline.length === 0 ? <p className="text-xs text-gray-400">No interactions logged yet — be the first to reach out! 💛</p> : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pl-1">
                      {d.timeline.map((e, i) => (
                        <div key={i} className="flex gap-2.5">
                          <div className="flex flex-col items-center">
                            <div className={`w-2.5 h-2.5 rounded-full mt-1 ${e.kind === 'reengage' ? 'bg-orange-400' : e.kind === 'recognition' ? 'bg-pink-400' : e.kind === 'note' ? 'bg-blue-400' : 'bg-green-400'}`} />
                            {i < d.timeline.length - 1 && <div className="w-0.5 flex-1 bg-gray-200 my-0.5" />}
                          </div>
                          <div className="flex-1 min-w-0 pb-1">
                            <p className="text-xs font-semibold text-gray-800">{e.label}<span className="ml-1 text-[10px] font-normal text-gray-400">{fmtWhen2(e.when)}{e.by ? ` · ${e.by}` : ''}</span></p>
                            {e.note && <p className="text-xs text-gray-600 bg-gray-50 rounded-lg px-2 py-1 mt-0.5">{e.note}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {editing && <TouchpointEditModal member={{ member_id: memberId, full_name: d?.member?.full_name }} tp={editing}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
      {viewer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setViewer(null)}>
          {viewer.type === 'photo'
            ? <img src={viewer.url} alt="" className="max-w-full max-h-[90vh] rounded-lg" onClick={e => e.stopPropagation()} />
            : <video src={viewer.url} controls autoPlay className="max-w-full max-h-[90vh] rounded-lg" onClick={e => e.stopPropagation()} />}
        </div>
      )}
    </div>
  )
}

// ─── Daily Import ─────────────────────────────────────────────────────────────
function ImportTab({ canImport }) {
  const [files, setFiles] = useState({ bookings: null, members: null, cancelled: null })
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [history, setHistory] = useState([])

  const loadHistory = useCallback(async () => {
    try { setHistory(await apiGet(`${BASE}/import/history`)) } catch { /* ignore */ }
  }, [])
  useEffect(() => { loadHistory() }, [loadHistory])

  const onFile = (kind) => async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    try {
      const name = file.name.toLowerCase()
      let rows
      if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false })
      } else {
        rows = parseCSV(await file.text())
      }
      if (!rows.length) { setError(`"${file.name}" has no data rows.`); return }
      setFiles(f => ({ ...f, [kind]: { name: file.name, rows } }))
    } catch (err) {
      setError(err.message)
    }
  }

  const run = async () => {
    setRunning(true); setError(null); setResult(null)
    try {
      const payload = {
        bookings:  files.bookings?.rows || [],
        members:   files.members?.rows || [],
        cancelled: files.cancelled?.rows || [],
      }
      const rowCount = payload.bookings.length + payload.members.length + payload.cancelled.length
      const res = await apiPost(`${BASE}/import`, payload)
      setResult(res)
      loadHistory()
      if (!res) setError(`Imported ${rowCount} rows but got no response — try again or check the counts in Members.`)
    } catch (e) {
      setError(e?.message ? `Import failed: ${e.message}` : 'Import failed — the request did not complete. If your files are very large, try importing one file at a time.')
    }
    finally { setRunning(false) }
  }

  // Re-run reconciliation, milestones/re-engagement, and metric recompute over
  // the data already in the app — no new files needed.
  const refresh = async () => {
    setRunning(true); setError(null); setResult(null)
    try {
      const res = await apiPost(`${BASE}/import`, {})
      setResult(res); loadHistory()
    } catch (e) {
      setError(e?.message ? `Re-run failed: ${e.message}` : 'Re-run failed — try again.')
    }
    finally { setRunning(false) }
  }

  if (!canImport) return <Empty msg="Daily Import is limited to owners and managers." />

  const anyFile = files.bookings || files.members || files.cancelled

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-3">
        <FileDrop label="Booking export"   hint="Export A — one row per session (Id, Email, Booking Date, Session Type)" file={files.bookings}  onPick={onFile('bookings')} />
        <FileDrop label="Member roster"    hint="Export B — full active roster (Customer Id, SubscriptionDate, Status…)" file={files.members}   onPick={onFile('members')} />
        <FileDrop label="Cancelled export" hint="Export C — daily cancellations (Customer Id, Cancellation Date)" file={files.cancelled} onPick={onFile('cancelled')} />
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={run} disabled={running || !anyFile}
          className="flex items-center gap-2 bg-red-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-red-700 disabled:opacity-50">
          {running ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          {running ? 'Working…' : 'Run Import'}
        </button>
        <button type="button" onClick={refresh} disabled={running}
          className="flex items-center gap-2 border border-gray-300 text-gray-700 text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw size={15} className={running ? 'animate-spin' : ''} /> Re-run (no upload)
        </button>
        <p className="text-xs text-gray-400">Re-running with the same files is safe — nothing double-counts. “Re-run” re-links bookings + refreshes the Daily List and counts without new files.</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm">
          <p className="font-semibold text-green-800 mb-2 flex items-center gap-1.5"><Check size={15} /> Import complete</p>
          <ul className="text-gray-700 space-y-0.5">
            <li>Bookings: <b>{result.bookings.upserted}</b> imported{result.bookings.skipped ? `, ${result.bookings.skipped} skipped` : ''}</li>
            <li>Members: <b>{result.members.upserted}</b> updated{result.members.skipped ? `, ${result.members.skipped} skipped` : ''}</li>
            <li>Cancellations: <b>{result.cancelled.ledgered}</b> ledgered{result.cancelled.skipped ? `, ${result.cancelled.skipped} skipped` : ''}</li>
            <li>Unreconciled bookings (no member match): <b className={result.unreconciled ? 'text-orange-600' : ''}>{result.unreconciled}</b>{result.unreconciled ? ' — see the Unreconciled tab' : ''}</li>
            <li>Studio Trends recomputed for: {result.months_recomputed.join(', ') || '—'}</li>
          </ul>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recent imports</p>
          <button onClick={loadHistory} className="text-gray-400 hover:text-gray-700"><RefreshCw size={13} /></button>
        </div>
        {history.length === 0 ? <p className="text-xs text-gray-400">No imports yet.</p> : (
          <div className="border border-gray-200 rounded-xl divide-y divide-gray-100">
            {history.map(h => (
              <div key={h.id} className="px-3 py-2 text-xs flex items-center gap-3">
                <span className="text-gray-500">{new Date(h.run_at).toLocaleString()}</span>
                <span className="text-gray-700">{h.members_count} members · {h.bookings_count} bookings · {h.cancelled_count} cancels</span>
                {h.unreconciled_count > 0 && <span className="text-orange-600">{h.unreconciled_count} unreconciled</span>}
                <span className="ml-auto text-gray-400">{h.run_by}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Cancellation Ledger ──────────────────────────────────────────────────────
function LedgerTab({ canEdit }) {
  const { currentStudio } = useStudio()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ customer_id: '', member_name: '', cancelled_date: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await apiGet(`${BASE}/ledger`)) } catch { setRows([]) }
    finally { setLoading(false) }
  }, [currentStudio?.id])
  useEffect(() => { load() }, [load])

  const toggleExclude = async (row) => {
    if (!row.excluded) {
      const reason = window.prompt('Reason for excluding this cancellation from the count (e.g. duplicate re-join):')
      if (!reason) return
      await apiPatch(`${BASE}/ledger/${row.id}`, { excluded: true, excluded_reason: reason })
    } else {
      await apiPatch(`${BASE}/ledger/${row.id}`, { excluded: false })
    }
    load()
  }
  const addManual = async () => {
    if (!form.customer_id || !form.cancelled_date) return
    await apiPost(`${BASE}/ledger`, form)
    setForm({ customer_id: '', member_name: '', cancelled_date: '' }); setAdding(false); load()
  }

  if (loading) return <Spinner />
  const counted = rows.filter(r => !r.excluded).length
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <p className="text-sm text-gray-600"><b>{counted}</b> counted · {rows.length - counted} excluded</p>
        {canEdit && <button onClick={() => setAdding(a => !a)} className="ml-auto text-xs font-semibold text-red-600 hover:underline">{adding ? 'Cancel' : '+ Add cancellation'}</button>}
      </div>

      {adding && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-3 flex flex-wrap gap-2 items-end">
          <div><label className="block text-[11px] text-gray-500 mb-0.5">Customer Id</label>
            <input value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))} className="border border-gray-300 rounded px-2 py-1 text-sm" /></div>
          <div><label className="block text-[11px] text-gray-500 mb-0.5">Name</label>
            <input value={form.member_name} onChange={e => setForm(f => ({ ...f, member_name: e.target.value }))} className="border border-gray-300 rounded px-2 py-1 text-sm" /></div>
          <div><label className="block text-[11px] text-gray-500 mb-0.5">Cancelled date</label>
            <input type="date" value={form.cancelled_date} onChange={e => setForm(f => ({ ...f, cancelled_date: e.target.value }))} className="border border-gray-300 rounded px-2 py-1 text-sm" /></div>
          <button onClick={addManual} className="bg-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">Add</button>
        </div>
      )}

      {rows.length === 0 ? <Empty msg="No cancellations recorded yet." /> : (
        <div className="overflow-x-auto border border-gray-200 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left text-gray-600">
                <th className="px-3 py-2 font-semibold">Member</th>
                <th className="px-3 py-2 font-semibold">Cancelled</th>
                <th className="px-3 py-2 font-semibold">Month</th>
                <th className="px-3 py-2 font-semibold">Source</th>
                <th className="px-3 py-2 font-semibold">Counted?</th>
                {canEdit && <th className="px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className={`border-b border-gray-100 ${r.excluded ? 'bg-gray-50 text-gray-400' : ''}`}>
                  <td className="px-3 py-2">{r.member_name || r.customer_id}</td>
                  <td className="px-3 py-2">{r.cancelled_date}</td>
                  <td className="px-3 py-2">{r.month_key}</td>
                  <td className="px-3 py-2 text-xs">{r.source}</td>
                  <td className="px-3 py-2">
                    {r.excluded
                      ? <span className="text-[11px] text-gray-500" title={r.excluded_reason}>Excluded — {r.excluded_reason}</span>
                      : <span className="text-[11px] text-green-700">Counted</span>}
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => toggleExclude(r)} className="text-xs text-gray-500 hover:text-red-600">
                        {r.excluded ? 'Re-include' : 'Exclude'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Unreconciled bookings ────────────────────────────────────────────────────
const MEMBER_TYPE_OPTS = [
  { v: 'employee',   label: 'Employee' },
  { v: 'comp',       label: 'Comp / free month' },
  { v: 'pif',        label: 'Paid in full' },
  { v: 'reciprocal', label: 'Reciprocal' },
  { v: 'guest',      label: 'Guest / other' },
  { v: 'member',     label: 'Regular member' },
]

function UnreconciledTab() {
  const { currentStudio } = useStudio()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [addFor, setAddFor] = useState(null)   // email being added
  const [form, setForm] = useState({ full_name: '', member_type: 'employee', origin_studio: '', expiration_date: '', is_cancelled: false, cancelled_date: '' })
  const [saving, setSaving] = useState(false)
  const [showSuggest, setShowSuggest] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await apiGet(`${BASE}/unreconciled`)) } catch { setRows([]) }
    finally { setLoading(false) }
  }, [currentStudio?.id])
  useEffect(() => { load() }, [load])

  // Rows arrive pre-grouped by email (one person per row, across all months).
  const groups = rows

  const openAdd = (email) => { setAddFor(email); setForm({ full_name: '', member_type: 'employee', origin_studio: '', expiration_date: '', is_cancelled: false, cancelled_date: '' }) }
  const addPerson = async () => {
    setSaving(true)
    try {
      await apiPost(`${BASE}/members`, { email: addFor, full_name: form.full_name, member_type: form.member_type, origin_studio: form.origin_studio, expiration_date: form.expiration_date, is_cancelled: form.is_cancelled, cancelled_date: form.is_cancelled ? form.cancelled_date : null })
      setAddFor(null); load()
    } catch { /* ignore */ }
    finally { setSaving(false) }
  }

  if (loading) return <Spinner />
  return (
    <div>
      <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-3 text-sm text-orange-800">
        These bookings matched no member in the roster. If it's an <b>employee, comp, PIF, or reciprocal</b> person,
        add them here (with the right type) so their visits track — they won't count toward the active-member number
        or get onboarding texts. Otherwise fix the email on the member in SAIL.
      </div>
      <div className="mb-3">
        <button onClick={() => setShowSuggest(true)}
          className="text-sm font-semibold bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700">
          Suggest cancelled matches
        </button>
        <span className="ml-2 text-xs text-gray-400">Match emails to known cancelled members, then approve in bulk.</span>
      </div>
      {showSuggest && <SuggestMatchesModal onClose={() => setShowSuggest(false)} onApplied={() => { setShowSuggest(false); load() }} />}
      {groups.length === 0 ? <Empty msg="Every booking matched a member. Nothing to fix. 🎉" /> : (
        <div className="border border-gray-200 rounded-xl divide-y divide-gray-100">
          {groups.map(g => (
            <div key={g.email} className="px-3 py-2.5">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-gray-800 font-medium">{g.email}</span>
                <span className="text-xs text-gray-400">{g.count} booking{g.count !== 1 ? 's' : ''} · last {g.last || '—'}</span>
                {addFor !== g.email && (
                  <button onClick={() => openAdd(g.email)}
                    className="ml-auto text-xs font-semibold text-red-600 hover:underline">+ Add person</button>
                )}
              </div>
              {addFor === g.email && (
                <div className="flex flex-wrap items-end gap-2 mt-2 bg-gray-50 border border-gray-200 rounded-lg p-2.5">
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-0.5">Name</label>
                    <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                      placeholder="Full name" className="border border-gray-300 rounded px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-0.5">Type</label>
                    <select value={form.is_cancelled ? '__cancelled__' : form.member_type}
                      onChange={e => setForm(f => e.target.value === '__cancelled__'
                        ? { ...f, is_cancelled: true, member_type: 'member' }
                        : { ...f, is_cancelled: false, member_type: e.target.value })}
                      className="border border-gray-300 rounded px-2 py-1 text-sm bg-white">
                      {MEMBER_TYPE_OPTS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                      <option value="__cancelled__">Cancelled member</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-0.5">Coming from</label>
                    <input value={form.origin_studio} onChange={e => setForm(f => ({ ...f, origin_studio: e.target.value }))}
                      placeholder="Studio (optional)" className="border border-gray-300 rounded px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-0.5">Expires (PIF)</label>
                    <input type="date" value={form.expiration_date} onChange={e => setForm(f => ({ ...f, expiration_date: e.target.value }))}
                      className="border border-gray-300 rounded px-2 py-1 text-sm" />
                  </div>
                  {form.is_cancelled && (
                    <div>
                      <label className="block text-[11px] text-gray-500 mb-0.5">Cancelled on</label>
                      <input type="date" value={form.cancelled_date} onChange={e => setForm(f => ({ ...f, cancelled_date: e.target.value }))}
                        className="border border-gray-300 rounded px-2 py-1 text-sm" />
                    </div>
                  )}
                  <button onClick={addPerson} disabled={saving}
                    className="bg-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50">
                    {saving ? 'Adding…' : `Add & link ${g.count}`}
                  </button>
                  <button onClick={() => setAddFor(null)} className="text-xs text-gray-500 px-2 py-1.5">Cancel</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Review-before-apply: fuzzy-match unreconciled emails to cancelled people, approve in bulk.
const CONF_BADGE = {
  high: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-gray-100 text-gray-500',
}
function SuggestMatchesModal({ onClose, onApplied }) {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [sel, setSel] = useState(() => new Set())   // selected emails
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const d = await apiGet(`${BASE}/reconcile/suggestions`)
        setRows(d)
        setSel(new Set(d.filter(r => r.confidence === 'high').map(r => r.email)))  // pre-check high confidence
      } catch { setRows([]) }
      finally { setLoading(false) }
    })()
  }, [])

  const toggle = (email) => setSel(s => { const n = new Set(s); n.has(email) ? n.delete(email) : n.add(email); return n })
  const apply = async () => {
    const matches = rows.filter(r => sel.has(r.email)).map(r => ({ email: r.email, full_name: r.suggested_name }))
    if (!matches.length) return
    setApplying(true)
    try {
      const res = await apiPost(`${BASE}/reconcile/apply`, { matches })
      alert(`Reconciled ${res.reconciled} member${res.reconciled === 1 ? '' : 's'} · ${res.bookings_linked} bookings linked.`)
      onApplied()
    } catch (e) { alert('Failed: ' + (e?.message || 'error')); setApplying(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900">Suggested cancelled matches</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Emails that likely belong to a known cancelled member. Review, then apply — each creates a cancelled member and links their workouts.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? <Spinner /> : rows.length === 0 ? (
            <Empty msg="No likely cancelled matches found." />
          ) : (
            <div className="border border-gray-200 rounded-xl divide-y divide-gray-100">
              {rows.map(r => (
                <label key={r.email} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" checked={sel.has(r.email)} onChange={() => toggle(r.email)} className="flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{r.suggested_name}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase ${CONF_BADGE[r.confidence] || ''}`}>{r.confidence}</span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{r.email} · {r.bookings} booking{r.bookings === 1 ? '' : 's'}{r.last_booking_date ? ` · last ${r.last_booking_date}` : ''}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-100">
          <span className="text-xs text-gray-500">{sel.size} selected</span>
          <button onClick={apply} disabled={applying || sel.size === 0}
            className="ml-auto bg-red-600 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50">
            {applying ? 'Applying…' : `Reconcile ${sel.size} as cancelled`}
          </button>
          <button onClick={onClose} className="text-sm text-gray-500 px-3 py-2">Close</button>
        </div>
      </div>
    </div>
  )
}

// Full member detail: profile, activity, interaction history, tagged photos.
function MemberDetailModal({ memberId, onClose }) {
  const { currentStudio } = useStudio()
  const [data, setData] = useState(null)
  const [photos, setPhotos] = useState(null)
  const [viewer, setViewer] = useState(null)   // { url, type } full-size media
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  const loadPhotos = () => apiGet(`/api/marketing/content?member_id=${memberId}`).then(setPhotos).catch(() => setPhotos([]))
  useEffect(() => {
    apiGet(`${BASE}/members/${memberId}/detail`).then(setData).catch(() => setData({ error: true }))
    loadPhotos()
  }, [memberId])

  const m = data?.member

  const onUpload = async (e) => {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    setUploading(true)
    try {
      const isVideo = file.type.startsWith('video')
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${currentStudio.id}/library/${Date.now()}-${safe}`
      const { error: upErr } = await supabase.storage.from('marketing-content').upload(path, file, { upsert: false, contentType: file.type })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from('marketing-content').getPublicUrl(path)
      await apiPost('/api/marketing/content', {
        file_url: publicUrl, file_path: path, file_type: isVideo ? 'video' : 'photo',
        category: isVideo ? 'member_videos' : 'member_photos', member_ids: [memberId], member_name: m?.full_name || null,
      })
      loadPhotos()
    } catch { /* ignore */ }
    finally { setUploading(false) }
  }
  const addr = m && [m.address, [m.city, m.state].filter(Boolean).join(', '), m.postal_code].filter(Boolean).join(' · ')
  const Row = ({ label, value }) => value ? (
    <div className="flex justify-between gap-4 py-1 text-sm"><span className="text-gray-400">{label}</span><span className="text-gray-800 text-right">{value}</span></div>
  ) : null
  const fmtWhen = (w) => { try { return new Date(w).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return w } }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {!data ? <Spinner /> : data.error || !m ? <Empty msg="Couldn't load this member." /> : (
          <>
            <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-lg text-gray-900">{m.full_name || m.customer_id}</h3>
                  {m.member_type && m.member_type !== 'member' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 uppercase">{m.member_type}</span>}
                  {m.is_cancelled && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">CANCELLED</span>}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{m.status || '—'}{m.package_name ? ` · ${m.package_name}` : ''}{m.journey?.current_track ? ` · ${m.journey.current_track}` : ''}</p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="p-5 space-y-5">
              {/* Activity */}
              <div className="grid grid-cols-4 gap-2 text-center">
                {[['Visit-days', m.visit_days], ['Sessions', m.total_sessions], ['Workouts', `${m.workouts_tried}/12`], ['Last booking', m.last_booking_date || '—']].map(([l, v]) => (
                  <div key={l} className="bg-gray-50 rounded-xl py-2">
                    <p className="text-sm font-bold text-gray-900">{v}</p>
                    <p className="text-[10px] text-gray-400">{l}</p>
                  </div>
                ))}
              </div>

              {/* Details */}
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Details</p>
                <div className="border border-gray-100 rounded-xl px-3 divide-y divide-gray-50">
                  <Row label="Email" value={m.email} />
                  <Row label="Phone" value={m.phone} />
                  <Row label="Address" value={addr} />
                  <Row label="Joined" value={m.join_date} />
                  <Row label="Coming from" value={m.origin_studio} />
                  <Row label="Expires (PIF)" value={m.expiration_date} />
                </div>
              </div>

              {/* Sessions attended */}
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Sessions attended ({(data.sessions || []).length})</p>
                {(data.sessions || []).length === 0 ? <p className="text-xs text-gray-400">No sessions on record.</p> : (
                  <div className="border border-gray-100 rounded-xl divide-y divide-gray-50 max-h-56 overflow-y-auto">
                    {data.sessions.map((s, idx) => (
                      <div key={idx} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                        <span className="font-medium text-gray-800 w-24 flex-shrink-0">{s.booking_date}</span>
                        <span className="text-gray-500 w-20 flex-shrink-0">{s.time_slot || '—'}</span>
                        <span className="text-gray-700 truncate">{s.session_type || '—'}</span>
                        {s.home_studio && <span className="ml-auto text-[10px] text-gray-400 whitespace-nowrap">{s.home_studio}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Photos */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Photos</p>
                  <input ref={fileRef} type="file" accept="image/*,video/*" onChange={onUpload} className="hidden" />
                  <button onClick={() => fileRef.current?.click()} disabled={uploading}
                    className="flex items-center gap-1 text-xs font-semibold text-orange-600 hover:underline disabled:opacity-50">
                    {uploading ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />} Add photo
                  </button>
                </div>
                {photos === null ? <p className="text-xs text-gray-400">Loading…</p> : photos.length === 0 ? (
                  <p className="text-xs text-gray-400">No photos yet — tag one here or on upload.</p>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {photos.map(a => (
                      <button key={a.id} onClick={() => setViewer({ url: a.file_url, type: a.file_type })}
                        className="relative block aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-100 group">
                        {a.file_type === 'photo' && a.file_url
                          ? <img src={a.file_url} alt="" className="w-full h-full object-cover" />
                          : <>
                              <video src={`${a.file_url}#t=0.5`} preload="metadata" muted playsInline className="w-full h-full object-cover" />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/25"><Play size={16} className="text-white" fill="currentColor" /></div>
                            </>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Interactions */}
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Interactions ({data.interactions.length})</p>
                {data.interactions.length === 0 ? <p className="text-xs text-gray-400">No logged interactions yet.</p> : (
                  <div className="space-y-1.5">
                    {data.interactions.map((i, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm border-l-2 border-gray-200 pl-3 py-0.5">
                        <span className="text-gray-800">{i.label}</span>
                        {i.status === 'skipped' && <span className="text-[9px] text-gray-400">skipped</span>}
                        <span className="ml-auto text-xs text-gray-400">{fmtWhen(i.when)}{i.by ? ` · ${i.by}` : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {viewer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4" onClick={e => { e.stopPropagation(); setViewer(null) }}>
          <div className="relative w-full max-w-2xl" onClick={e => e.stopPropagation()}>
            <button onClick={() => setViewer(null)} className="absolute -top-9 right-0 text-white/80 hover:text-white flex items-center gap-1 text-sm"><X size={18} /> Close</button>
            {viewer.type === 'photo'
              ? <img src={viewer.url} alt="" className="w-full max-h-[80vh] object-contain rounded-xl" />
              : <video src={viewer.url} controls autoPlay playsInline className="w-full max-h-[80vh] rounded-xl bg-black" />}
          </div>
        </div>
      )}
    </div>
  )
}

// Edit a member's name / type / contact.
function MemberEditModal({ member, onClose, onSaved }) {
  const [form, setForm] = useState({
    full_name: member.full_name || '', member_type: member.member_type || 'member',
    phone: member.phone || '', email: member.email || '', origin_studio: member.origin_studio || '',
    expiration_date: member.expiration_date || '',
    address: member.address || '', city: member.city || '', state: member.state || '', postal_code: member.postal_code || '',
    is_cancelled: !!member.is_cancelled, cancelled_date: member.cancelled_date || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    setSaving(true); setError(null)
    try {
      const saved = await apiPatch(`${BASE}/members/${member.id}`, form)
      onSaved(saved)
    } catch (e) { setError(e?.message || 'Save failed'); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Edit member</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Name</label>
            <input value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Full name"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Type</label>
            <select value={form.member_type} onChange={e => set('member_type', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
              {MEMBER_TYPE_OPTS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Phone</label>
              <input value={form.phone} onChange={e => set('phone', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Email</label>
              <input value={form.email} onChange={e => set('email', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Coming from (studio)</label>
              <input value={form.origin_studio} onChange={e => set('origin_studio', e.target.value)} placeholder="e.g. HOTWORX Madison"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Expiration date <span className="text-gray-400 font-normal">(PIF)</span></label>
              <input type="date" value={form.expiration_date} onChange={e => set('expiration_date', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Address</label>
            <input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Street address"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:border-red-400" />
            <div className="grid grid-cols-3 gap-2">
              <input value={form.city} onChange={e => set('city', e.target.value)} placeholder="City"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
              <input value={form.state} onChange={e => set('state', e.target.value)} placeholder="State"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
              <input value={form.postal_code} onChange={e => set('postal_code', e.target.value)} placeholder="ZIP"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
            </div>
          </div>
          <div className="border-t border-gray-100 pt-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <input type="checkbox" checked={form.is_cancelled}
                onChange={e => set('is_cancelled', e.target.checked)} />
              Cancelled member
            </label>
            <p className="text-[11px] text-gray-400 mt-0.5">Keeps their workout history but drops them from the active count and stops onboarding texts.</p>
            {form.is_cancelled && (
              <div className="mt-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Cancelled on</label>
                <input type="date" value={form.cancelled_date} onChange={e => set('cancelled_date', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
              </div>
            )}
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-1.5 text-sm font-semibold text-white bg-red-600 rounded-lg disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Daily List — members to reach today ──────────────────────────────────────
const FILTERS = [
  { k: 'all', label: 'All' },
  { k: 'onboarding', label: 'Onboarding', match: r => r.trigger_kind === 'day_based' },
  { k: 'milestone', label: 'Milestones', match: r => r.trigger_ref?.startsWith('milestone') || r.trigger_ref === 'passport_sticker' },
  // Quiet / at-risk members (incl. first-90 "save fork" and rough first sessions) live here, not in Onboarding.
  { k: 'reengage', label: 'Re-engagement', match: r => r.trigger_ref?.startsWith('reengage') || r.trigger_ref?.startsWith('save') || r.trigger_ref === 'first_session_rough' },
]

// Sub-filters within each core area (shown when that area is selected).
const SUBFILTERS = {
  reengage: [
    { k: 'all', label: 'All' },
    { k: 're14', label: '14–29 days', match: r => r.trigger_ref === 'reengage_14' },
    { k: 're30', label: '30–59 days', match: r => r.trigger_ref === 'reengage_30' },
    { k: 're60', label: '60+ days', match: r => r.trigger_ref === 'reengage_60' },
    { k: 'save', label: 'Save fork', match: r => r.trigger_ref?.startsWith('save') },
    { k: 'first', label: 'Rough first session', match: r => r.trigger_ref === 'first_session_rough' },
  ],
  milestone: [
    { k: 'all', label: 'All' },
    { k: 'm10', label: '10', match: r => r.trigger_ref === 'milestone_10' },
    { k: 'm25', label: '25', match: r => r.trigger_ref === 'milestone_25' },
    { k: 'm50', label: '50', match: r => r.trigger_ref === 'milestone_50' },
    { k: 'm100', label: '100', match: r => r.trigger_ref === 'milestone_100' },
    { k: 'mbig', label: '500 / 1,000', match: r => ['milestone_500', 'milestone_1000'].includes(r.trigger_ref) },
    { k: 'passport', label: 'Passport', match: r => r.trigger_ref === 'passport_sticker' },
  ],
  onboarding: [
    { k: 'all', label: 'All' },
    { k: 'day', label: 'Day check-ins', match: r => r.trigger_kind === 'day_based' },
  ],
}

// The reach-out script, opened from a Daily List item (keeps the list itself scannable).
function ScriptModal({ item, onClose }) {
  const [copied, setCopied] = useState(false)
  const isCall = item.channel === 'call'
  const isStudio = item.channel === 'in_studio'
  const plain = htmlToText(item.script || '')
  const copy = () => { navigator.clipboard?.writeText(plain); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 ${isStudio ? 'bg-green-100 text-green-700' : isCall ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
              {isStudio ? <Building2 size={9} /> : isCall ? <Phone size={9} /> : <MessageSquare size={9} />}{isStudio ? 'In studio' : isCall ? 'Call' : 'Text'}
            </span>
            <h3 className="font-bold text-gray-900">{item.member_name}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="p-5">
          <p className="text-xs text-gray-500 mb-2">{item.label}</p>
          <div className="border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
            <RichView html={item.script || ''} />
          </div>
        </div>
        <div className="flex items-center gap-2 px-5 py-4 border-t border-gray-100">
          {!isCall && !isStudio && item.phone && (
            <a href={`sms:${item.phone}?&body=${encodeURIComponent(plain)}`}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700"><MessageSquare size={14} /> Open text</a>
          )}
          <button onClick={copy} className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50">
            {copied ? <><Check size={14} /> Copied</> : 'Copy script'}
          </button>
          <button onClick={onClose} className="ml-auto px-3 py-2 text-sm text-gray-500">Close</button>
        </div>
      </div>
    </div>
  )
}

function DailyListTab() {
  const { currentStudio } = useStudio()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [sub, setSub] = useState('all')       // sub-filter within the core area
  const [drafts, setDrafts] = useState({})   // id -> edited script
  const [done, setDone] = useState({})        // id -> true (row flashes blue then drops)
  const [fulfil, setFulfil] = useState({})    // id -> reward fulfilled checkbox
  const [day2, setDay2] = useState(null)      // the Day-2 item being captured
  const [photosFor, setPhotosFor] = useState(null)  // milestone shout-out: view member's photos
  const [scriptFor, setScriptFor] = useState(null)  // item whose script modal is open
  const [detailFor, setDetailFor] = useState(null)  // member detail modal

  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await apiGet(`${BASE}/daily-list`)) } catch { setRows([]) }
    finally { setLoading(false) }
  }, [currentStudio?.id])
  useEffect(() => { load() }, [load])

  const drop = (id) => { setDone(d => ({ ...d, [id]: true })); setTimeout(() => setRows(rs => rs.filter(x => x.id !== id)), 600) }
  const complete = async (r) => {
    if (r.trigger_ref === 'day_2') { setDay2(r); return }   // capture gate first
    drop(r.id)
    try {
      if (r.kind === 'reengage') await apiPost(`${BASE}/reengage/${r.member_id}/complete`, {})
      else if (r.kind === 'passport') await apiPost(`${BASE}/passport/${r.member_id}/complete`, { fulfilled: !!fulfil[r.id] })
      else await apiPost(`${BASE}/daily-list/${r.id}/complete`, { fulfilled: !!fulfil[r.id] })
    } catch { /* ignore */ }
  }
  const skip = async (r) => {
    try {
      if (r.kind === 'reengage') await apiPost(`${BASE}/reengage/${r.member_id}/snooze`, {})  // "not now" — snooze the tier cooldown
      else if (r.kind === 'passport') await apiPost(`${BASE}/passport/${r.member_id}/complete`, { fulfilled: false })
      else await apiPost(`${BASE}/daily-list/${r.id}/skip`, {})
    } catch { /* ignore */ }
    setRows(rs => rs.filter(x => x.id !== r.id))
  }
  // Permanently remove a task that isn't needed (won't come back).
  const del = async (r) => {
    if (!window.confirm("Delete this task? It won't come back.")) return
    setRows(rs => rs.filter(x => x.id !== r.id))
    try {
      if (r.kind === 'reengage') await apiPost(`${BASE}/reengage/${r.member_id}/dismiss`, {})
      else if (r.kind === 'passport') await apiPost(`${BASE}/passport/${r.member_id}/complete`, { fulfilled: false })
      else await apiPost(`${BASE}/daily-list/${r.id}/skip`, {})
    } catch { /* ignore */ }
  }
  const setFlag = async (r, flag) => {
    try { await apiPatch(`${BASE}/journeys/${r.journey_id}`, { first_session_flag: flag }) } catch { /* ignore */ }
    load()
  }

  const f = FILTERS.find(x => x.k === filter)
  const subs = SUBFILTERS[filter]
  let shown = filter === 'all' ? rows : rows.filter(f.match)
  if (subs && sub !== 'all') { const sf = subs.find(s => s.k === sub); if (sf?.match) shown = shown.filter(sf.match) }
  const pickCore = (k) => { setFilter(k); setSub('all') }

  if (loading) return <Spinner />
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {FILTERS.map(x => (
          <button key={x.k} onClick={() => pickCore(x.k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${filter === x.k ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-300'}`}>
            {x.label}
          </button>
        ))}
        {filter !== 'onboarding' && <span className="ml-auto text-xs text-gray-400">{shown.length} to reach</span>}
      </div>
      {subs && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4 pl-1">
          {subs.map(s => (
            <button key={s.k} onClick={() => setSub(s.k)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${sub === s.k ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
              {s.label}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (filter === 'onboarding' ? null : <Empty msg="Nobody to reach right now. Run a Daily Import to refresh the queue. 🎉" />) : (
        <div className="space-y-2.5">
          {shown.map(r => {
            const isDone = done[r.id]
            const isCall = r.channel === 'call'
            const isStudio = r.channel === 'in_studio'
            return (
              <div key={r.id} className={`border rounded-xl p-3.5 transition-colors ${isDone ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200'}`}>
                <div className="flex items-start gap-3">
                  <button onClick={() => complete(r)} title="Mark done"
                    className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${isDone ? 'bg-blue-500 border-blue-500' : 'border-gray-300 hover:border-blue-400'}`}>
                    {isDone && <Check size={13} className="text-white" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={() => setDetailFor(r.member_id)} className="font-bold text-gray-900 hover:text-red-600 hover:underline">{r.member_name}</button>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 ${isStudio ? 'bg-green-100 text-green-700' : isCall ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {isStudio ? <Building2 size={9} /> : isCall ? <Phone size={9} /> : <MessageSquare size={9} />}{isStudio ? 'In studio' : isCall ? 'Call' : 'Text'}
                      </span>
                      {r.priority <= 3 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">PRIORITY</span>}
                      {r.reward_key && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1"><Trophy size={9} />{r.reward_key.replace(/_/g, ' ')}</span>}
                    </div>
                    <p className="text-xs text-gray-500">{r.label}</p>
                    {r.trigger_kind === 'day_based' && r.join_date && (
                      <p className="text-[11px] text-gray-400 mt-0.5">Joined {r.join_date}</p>
                    )}
                    {r.last_booking_date && (
                      <p className="text-[11px] text-gray-400 mt-0.5">Last booking {r.last_booking_date}{r.days_lapsed != null ? ` · ${r.days_lapsed}d ago` : ''}</p>
                    )}
                    {r.kind === 'reengage' && r.last_contacted_at && (
                      <p className="text-[11px] text-amber-600 mt-0.5">
                        Last reached out {Math.floor((Date.now() - new Date(r.last_contacted_at).getTime()) / 86400000)}d ago
                        {r.attempts ? ` · ${r.attempts} prior follow-up${r.attempts === 1 ? '' : 's'}` : ''}
                      </p>
                    )}
                    {r.reward_key && (
                      <div className="mt-2 flex items-center gap-3 flex-wrap">
                        <label className="flex items-center gap-1.5 text-xs text-gray-600">
                          <input type="checkbox" checked={!!fulfil[r.id]} onChange={e => setFulfil(ff => ({ ...ff, [r.id]: e.target.checked }))} />
                          Reward handed over ({r.reward_key.replace(/_/g, ' ')})
                        </label>
                        <button type="button" onClick={() => setPhotosFor({ id: r.member_id, name: r.member_name })}
                          className="text-xs font-semibold text-orange-600 hover:underline">📸 View {r.member_name?.split(' ')[0] || 'member'}'s photos</button>
                      </div>
                    )}
                    {r.trigger_ref === 'day_5' && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className="text-[11px] text-gray-400">First session:</span>
                        {['great', 'rough', 'no_show'].map(fl => (
                          <button key={fl} onClick={() => setFlag(r, fl)}
                            className="text-[11px] px-2 py-0.5 rounded-full border border-gray-300 text-gray-600 hover:border-red-400 capitalize">
                            {fl.replace('_', '-')}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <button onClick={() => setScriptFor(r)} className="text-xs font-semibold text-red-600 hover:underline flex items-center gap-1"><FileText size={12} /> {isStudio ? 'View orientation' : isCall ? 'View call script' : 'View / send text'}</button>
                      <button onClick={() => skip(r)} className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1 ml-auto"><SkipForward size={12} /> Skip</button>
                      <button onClick={() => del(r)} className="text-xs text-gray-400 hover:text-red-600 flex items-center gap-1"><Trash2 size={12} /> Delete</button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Onboarding filter → the new-member roster (journeys) lives here now. */}
      {filter === 'onboarding' && <div className={shown.length ? 'mt-5 pt-5 border-t border-gray-100' : ''}><NewMembersTab /></div>}

      {scriptFor && <ScriptModal item={scriptFor} onClose={() => setScriptFor(null)} />}
      {detailFor && <JourneyModal memberId={detailFor} onClose={() => setDetailFor(null)} />}
      {day2 && <Day2Modal item={day2} onClose={() => setDay2(null)}
        onDone={() => { const id = day2.id; setDay2(null); drop(id) }} />}
      {photosFor && <MemberPhotosModal member={photosFor} onClose={() => setPhotosFor(null)} />}
    </div>
  )
}

// Milestone shout-out: show a member's tagged photos, ready to grab for a post.
function MemberPhotosModal({ member, onClose }) {
  const [photos, setPhotos] = useState(null)
  useEffect(() => {
    apiGet(`/api/marketing/content?member_id=${member.id}`).then(setPhotos).catch(() => setPhotos([]))
  }, [member.id])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">{member.name || 'Member'}'s photos</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="p-5">
          {photos === null ? <Spinner /> : photos.length === 0 ? (
            <Empty msg="No tagged photos yet. Tag this member when uploading content (Marketing → Upload content)." />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {photos.map(a => (
                <a key={a.id} href={a.file_url} target="_blank" rel="noreferrer"
                  className="block aspect-square rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
                  {a.file_type === 'photo' && a.file_url
                    ? <img src={a.file_url} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">{a.file_type}</div>}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Day-2 capture gate: goal + before photo + consent required before the call completes.
function Day2Modal({ item, onClose, onDone }) {
  const { currentStudio } = useStudio()
  const [goal, setGoal] = useState('')
  const [consent, setConsent] = useState(false)
  const [next3, setNext3] = useState(false)
  const [photoUrl, setPhotoUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    apiGet(`${BASE}/transformation/${item.member_id}`).then(tr => {
      if (tr) { setGoal(tr.goal_text || ''); setConsent(!!tr.consent); setPhotoUrl(tr.before_photo_url || '') }
    }).catch(() => {})
  }, [item.member_id])

  const upload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError(null)
    try {
      const path = `${currentStudio.id}/${item.member_id}/before_${Date.now()}_${file.name}`
      const { error: upErr } = await supabase.storage.from('onboarding-photos').upload(path, file, { upsert: false, contentType: file.type })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('onboarding-photos').getPublicUrl(path)
      setPhotoUrl(data.publicUrl)
    } catch (e) { setError('Photo upload failed: ' + e.message) }
    finally { setUploading(false) }
  }

  const save = async () => {
    if (!goal.trim() || !photoUrl || !consent) { setError('Goal, before photo, and consent are all required.'); return }
    setSaving(true); setError(null)
    try {
      await apiPost(`${BASE}/transformation`, { member_id: item.member_id, goal_text: goal, before_photo_url: photoUrl, consent, next3_booked: next3 })
      await apiPost(`${BASE}/daily-list/${item.id}/complete`, {})
      onDone()
    } catch (e) { setError(e.message); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Day 2 — {item.member_name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Their goal (in their words) *</label>
            <textarea value={goal} onChange={e => setGoal(e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-red-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Before photo *</label>
            <input type="file" accept="image/*" onChange={upload} className="text-xs" />
            {uploading && <p className="text-xs text-gray-400 mt-1">Uploading…</p>}
            {photoUrl && <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><Check size={12} /> Photo saved</p>}
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> Member consented to the photo *
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={next3} onChange={e => setNext3(e.target.checked)} /> Booked their next 3 sessions
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving || uploading}
            className="px-4 py-1.5 text-sm font-semibold text-white bg-red-600 rounded-lg disabled:opacity-50">
            {saving ? 'Saving…' : 'Capture & complete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Script Admin ─────────────────────────────────────────────────────────────
const SAMPLE = { first_name: 'Sarah', visit_days: 25, total_sessions: 30, workouts_tried: 12, days_lapsed: 14, milestone: 25, event_name: 'Join us for the Sweatathon! ', goal_text: 'lose 15 lbs' }
const renderPreview = (body) => String(body || '').replace(/\{(\w+)\}/g, (_, k) => (SAMPLE[k] != null ? String(SAMPLE[k]) : `{${k}}`))
const VARS = ['first_name', 'visit_days', 'total_sessions', 'workouts_tried', 'days_lapsed', 'milestone', 'event_name', 'goal_text']

const CHANNEL_OPTS = [{ v: 'text', label: 'Text' }, { v: 'call', label: 'Call' }, { v: 'in_studio', label: 'In studio' }]

// Script grouping + visual language (shared with the member journey path).
const SCRIPT_CATEGORY = (k = '') => {
  if (k.startsWith('milestone_')) return 'milestones'
  if (k.startsWith('reengage_') || k.startsWith('save_') || k === 'first_session_rough') return 'reengage'
  if (k.startsWith('birthday_')) return 'birthdays'
  if (k.startsWith('day') || k === 'thank_you_card' || k === 'passport_sticker' || k.startsWith('custom_')) return 'journey'
  return 'other'
}
const SCRIPT_SECTIONS = [
  { k: 'journey', label: 'Onboarding journey', emoji: '🌱', text: 'text-emerald-600', border: 'border-emerald-100' },
  { k: 'milestones', label: 'Milestones', emoji: '🏅', text: 'text-amber-600', border: 'border-amber-100' },
  { k: 'reengage', label: 'Re-engagement', emoji: '🔁', text: 'text-orange-600', border: 'border-orange-100' },
  { k: 'birthdays', label: 'Birthdays', emoji: '🎂', text: 'text-pink-600', border: 'border-pink-100' },
  { k: 'other', label: 'Other', emoji: '✨', text: 'text-gray-500', border: 'border-gray-200' },
]
const SCRIPT_EMOJI = (k = '') => {
  const map = { day0_orientation: '🏫', day0_welcome_pos: '👋', day0_welcome_online: '👋', day2_goal_call: '🎯', day5_checkin: '💬', day21_bring_friend: '🤝', day30_review: '📞', day60_review: '📈', day90_close: '🏁', thank_you_card: '💌', passport_sticker: '🎟', reengage_14: '🔁', reengage_30: '🔁', reengage_60: '📞', birthday_text: '🎂', birthday_text_nonmember: '🎂', first_session_rough: '🆘', save_14d: '🆘', save_7d: '🆘' }
  if (map[k]) return map[k]
  if (k.startsWith('milestone_')) return '🏅'
  return '📝'
}
const SCRIPT_DAY = (k = '') => { const m = k.match(/^day(\d+)/); return m ? `Day ${m[1]}` : null }

function ScriptAdminTab({ canEdit }) {
  const { currentStudio } = useStudio()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState(null)       // template_key, or '__new__'
  const [body, setBody] = useState('')
  const [label, setLabel] = useState('')
  const [channel, setChannel] = useState('text')
  const [saved, setSaved] = useState(false)
  const [dragKey, setDragKey] = useState(null)
  const [collapsed, setCollapsed] = useState(() => new Set())

  const load = useCallback(async () => {
    setLoading(true)
    try { const d = await apiGet(`${BASE}/templates`); setRows(d); if (d[0]) { setSel(d[0].template_key); setBody(d[0].body || ''); setLabel(d[0].label || ''); setChannel(d[0].channel || 'text') } }
    catch { setRows([]) }
    finally { setLoading(false) }
  }, [currentStudio?.id])
  useEffect(() => { load() }, [load])

  const select = (t) => { setSel(t.template_key); setBody(t.body || ''); setLabel(t.label || ''); setChannel(t.channel || 'text'); setSaved(false) }
  const startNew = () => { setSel('__new__'); setBody(''); setLabel(''); setChannel('text'); setSaved(false) }
  const isNew = sel === '__new__'
  const current = isNew ? { template_key: '__new__' } : rows.find(t => t.template_key === sel)

  // Reorder (up/down) — persists sort_order, which drives the member journey path.
  const persist = (next) => { setRows(next); apiPut(`${BASE}/templates/reorder`, { keys: next.map(t => t.template_key) }).catch(() => {}) }
  // Drag-drop reorder (within the same section only).
  const onDrop = (targetKey) => {
    if (!dragKey || dragKey === targetKey) { setDragKey(null); return }
    const from = rows.findIndex(r => r.template_key === dragKey)
    const to = rows.findIndex(r => r.template_key === targetKey)
    if (from < 0 || to < 0 || SCRIPT_CATEGORY(rows[from].template_key) !== SCRIPT_CATEGORY(rows[to].template_key)) { setDragKey(null); return }
    const next = [...rows]; const [it] = next.splice(from, 1); next.splice(next.findIndex(r => r.template_key === targetKey), 0, it)
    setDragKey(null); persist(next)
  }
  const toggleSection = (k) => setCollapsed(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })

  const save = async () => {
    if (isNew) {
      if (!label.trim()) return
      const created = await apiPost(`${BASE}/templates`, { label: label.trim(), channel, body })
      setRows(rs => [...rs, created])
      setSel(created.template_key)
    } else {
      await apiPut(`${BASE}/templates/${sel}`, { body, label: label.trim(), channel })
      setRows(rs => rs.map(t => t.template_key === sel ? { ...t, body, label: label.trim(), channel } : t))
    }
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }
  const del = async () => {
    if (isNew) { startNew(); return }
    if (!window.confirm(`Delete "${current.label || sel}"? It will stop appearing in the Daily List.`)) return
    await apiDelete(`${BASE}/templates/${sel}`)
    const remaining = rows.filter(t => t.template_key !== sel)
    setRows(remaining)
    if (remaining[0]) select(remaining[0]); else setSel(null)
  }

  if (loading) return <Spinner />

  // Group scripts into member-facing sections, preserving the saved order within each.
  const journeyItems = rows.filter(t => SCRIPT_CATEGORY(t.template_key) === 'journey')
  const grouped = SCRIPT_SECTIONS.map(sec => ({
    ...sec,
    items: rows.filter(t => SCRIPT_CATEGORY(t.template_key) === sec.k),
  })).filter(sec => sec.items.length)

  // Reorder two section-neighbors within the global rows order (keeps arrows meaningful per section).
  const moveInSection = (secItems, idxInSec, dir) => {
    const j = idxInSec + dir
    if (j < 0 || j >= secItems.length) return
    const a = secItems[idxInSec].template_key, b = secItems[j].template_key
    const next = [...rows]
    const ia = next.findIndex(r => r.template_key === a), ib = next.findIndex(r => r.template_key === b)
    const tmp = next[ia]; next[ia] = next[ib]; next[ib] = tmp
    persist(next)
  }

  return (
    <div>
      {/* Live journey preview — mirrors the path the member sees */}
      <div className="bg-gradient-to-r from-emerald-50 via-white to-white border border-emerald-100 rounded-2xl p-3 mb-4">
        <p className="text-[10px] font-bold text-emerald-600/70 uppercase tracking-wide mb-2 flex items-center gap-1">
          🌱 Member journey preview <span className="text-gray-400 font-medium normal-case tracking-normal">· the path your new member walks</span>
        </p>
        <div className="flex items-start gap-0 overflow-x-auto pb-1">
          {journeyItems.length === 0 && <span className="text-xs text-gray-400 py-2">No journey scripts yet.</span>}
          {journeyItems.map((t, i) => {
            const on = sel === t.template_key
            const day = SCRIPT_DAY(t.template_key)
            return (
              <div key={t.template_key} className="flex items-start flex-shrink-0">
                {i > 0 && <div className="w-5 h-9 flex items-center"><div className="h-0.5 w-full bg-emerald-200 rounded" /></div>}
                <button onClick={() => select(t)} title={t.label}
                  className="flex flex-col items-center gap-1 w-16 group">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-base transition-transform group-hover:scale-110 ${on ? 'bg-red-600 text-white ring-2 ring-red-200 shadow' : 'bg-white border-2 border-emerald-200'}`}>
                    {SCRIPT_EMOJI(t.template_key)}
                  </div>
                  {day && <span className={`text-[8px] font-bold ${on ? 'text-red-500' : 'text-emerald-500'}`}>{day}</span>}
                  <span className="text-[8px] text-gray-500 text-center leading-tight line-clamp-2">{t.label || t.template_key}</span>
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid md:grid-cols-[300px_1fr] gap-4">
      <div>
        {canEdit && (
          <button onClick={startNew}
            className={`w-full mb-2 text-sm font-semibold px-3 py-2 rounded-xl border ${isNew ? 'bg-red-600 text-white border-red-600' : 'border-red-200 text-red-600 hover:bg-red-50'}`}>
            + New script
          </button>
        )}
        {canEdit && <p className="text-[10px] text-gray-400 mb-2 px-1">↕ Drag a card or use the arrows to reorder — order sets the member's journey path 🎯</p>}
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          {grouped.map(sec => {
            const open = !collapsed.has(sec.k)
            return (
              <div key={sec.k}>
                <button onClick={() => toggleSection(sec.k)}
                  className="w-full flex items-center gap-1.5 mb-1.5 px-1 text-left">
                  <span className="text-sm">{sec.emoji}</span>
                  <span className={`text-xs font-bold ${sec.text}`}>{sec.label}</span>
                  <span className="text-[10px] text-gray-300 font-semibold">{sec.items.length}</span>
                  <ChevronDown size={13} className={`ml-auto text-gray-300 transition-transform ${open ? '' : '-rotate-90'}`} />
                </button>
                {open && (
                  <div className={`border rounded-xl overflow-hidden divide-y divide-gray-100 ${sec.border}`}>
                    {sec.items.map((t, idx) => {
                      const on = sel === t.template_key
                      const dragging = dragKey === t.template_key
                      const Ch = t.channel === 'call' ? Phone : t.channel === 'in_studio' ? Building2 : MessageSquare
                      const chCls = t.channel === 'call' ? 'text-purple-500' : t.channel === 'in_studio' ? 'text-green-500' : 'text-blue-500'
                      const day = SCRIPT_DAY(t.template_key)
                      const preview = htmlToText(t.body || '').replace(/\s+/g, ' ').trim().slice(0, 64)
                      return (
                        <div key={t.template_key}
                          draggable={canEdit}
                          onDragStart={() => setDragKey(t.template_key)}
                          onDragEnd={() => setDragKey(null)}
                          onDragOver={e => e.preventDefault()}
                          onDrop={() => onDrop(t.template_key)}
                          className={`flex items-start gap-1.5 pl-1.5 pr-1.5 py-2 transition-colors ${on ? 'bg-red-50' : 'hover:bg-gray-50'} ${dragging ? 'opacity-40' : ''}`}>
                          {canEdit && <span className="text-gray-300 mt-1.5 cursor-grab select-none text-xs leading-none flex-shrink-0" title="Drag to reorder">⠿</span>}
                          <button onClick={() => select(t)} className="flex items-start gap-2 flex-1 min-w-0 text-left">
                            <span className="text-lg leading-none mt-0.5 flex-shrink-0">{SCRIPT_EMOJI(t.template_key)}</span>
                            <span className="min-w-0">
                              <span className="flex items-center gap-1.5">
                                <span className={`text-xs font-semibold truncate ${on ? 'text-red-700' : 'text-gray-800'}`}>{t.label || t.template_key}</span>
                                {day && <span className="text-[9px] bg-gray-100 text-gray-500 px-1 rounded flex-shrink-0">{day}</span>}
                              </span>
                              <span className="flex items-center gap-1 text-[10px] text-gray-400 capitalize mt-0.5">
                                <Ch size={10} className={chCls} />{(t.channel || '').replace('_', ' ')}
                              </span>
                              {preview && <span className="block text-[10px] text-gray-400 truncate mt-0.5">{preview}</span>}
                            </span>
                          </button>
                          {canEdit && (
                            <div className="flex flex-col flex-shrink-0">
                              <button onClick={() => moveInSection(sec.items, idx, -1)} disabled={idx === 0} className="text-gray-300 hover:text-red-600 disabled:opacity-20"><ChevronUp size={13} /></button>
                              <button onClick={() => moveInSection(sec.items, idx, 1)} disabled={idx === sec.items.length - 1} className="text-gray-300 hover:text-red-600 disabled:opacity-20"><ChevronDown size={13} /></button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <div>
        {!current ? <Empty msg="Select a template to edit, or add a new one." /> : (
          <>
            {canEdit ? (
              <div className="flex flex-wrap items-end gap-2 mb-2">
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-[11px] text-gray-500 mb-0.5">Label</label>
                  <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. 100 visit-days 🎉"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-red-400" />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-0.5">Channel</label>
                  <select value={channel} onChange={e => setChannel(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white">
                    {CHANNEL_OPTS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <p className="text-sm font-semibold text-gray-800 mb-1">{current.label}</p>
            )}
            <p className="text-[11px] text-gray-400 mb-2">{isNew ? 'New script' : `Key: ${current.template_key} · ${current.channel}`}. Use <b>B</b> for bold and the list button for bullets. Edits apply on the next Daily List refresh.</p>
            <RichEditor key={sel} value={body} onChange={setBody} disabled={!canEdit} />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {VARS.map(v => <span key={v} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">{`{${v}}`}</span>)}
            </div>
            <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Preview</p>
              <RichView html={renderPreview(body)} />
            </div>
            {canEdit && (
              <div className="flex items-center gap-2 mt-3">
                <button onClick={save} className="bg-red-600 text-white text-sm font-semibold px-5 py-2 rounded-xl hover:bg-red-700">
                  {saved ? '✓ Saved' : isNew ? 'Create script' : 'Save template'}
                </button>
                {!isNew && (
                  <button onClick={del} className="text-sm font-semibold text-gray-500 px-3 py-2 rounded-xl hover:bg-gray-100 hover:text-red-600 flex items-center gap-1">
                    <X size={14} /> Delete
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
      </div>
    </div>
  )
}

// ─── Studio Trends metrics (computed + override) ──────────────────────────────
function MetricsTab({ canEdit }) {
  const { currentStudio } = useStudio()
  const [monthKey, setMonthKey] = useState(new Date().toISOString().slice(0, 7))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await apiGet(`${BASE}/metrics?month_key=${monthKey}`)) } catch { setData(null) }
    finally { setLoading(false) }
  }, [monthKey, currentStudio?.id])
  useEffect(() => { load() }, [load])

  const setOverride = async (metric, computed) => {
    const raw = window.prompt(`Override value for ${metric === 'cancellations' ? 'cancellations' : 'active members'} (computed = ${computed ?? '—'}):`)
    if (raw == null || raw.trim() === '') return
    const val = parseInt(raw, 10)
    if (isNaN(val)) return
    const reason = window.prompt('Reason for the override (required):')
    if (!reason) return
    await apiPut(`${BASE}/metric-overrides`, { metric, month_key: monthKey, override_value: val, reason })
    load()
  }
  const clearOverride = async (metric) => {
    if (!window.confirm('Remove this override and revert to the computed value?')) return
    await apiDelete(`${BASE}/metric-overrides`, { metric, month_key: monthKey })
    load()
  }

  const Card = ({ metric, label, m, disabled }) => (
    <div className="border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
        {m?.override != null && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700"
            title={`Computed ${m.computed ?? '—'} · ${m.reason || ''} · ${m.set_by || ''}`}>OVERRIDDEN</span>
        )}
      </div>
      {disabled ? (
        <p className="text-sm text-gray-400 py-2">Active-member count is a point-in-time snapshot — shown for the current month only.</p>
      ) : (
        <>
          <p className="text-3xl font-bold text-gray-900">{m?.resolved ?? '—'}</p>
          {m?.override != null
            ? <p className="text-xs text-amber-600 mt-1">Override · computed was {m.computed ?? '—'} — {m.reason}</p>
            : <p className="text-xs text-gray-400 mt-1">Computed from the ledger/roster</p>}
          {canEdit && (
            <div className="flex gap-3 mt-2">
              <button onClick={() => setOverride(metric, m?.computed)} className="text-xs font-semibold text-red-600 hover:underline">
                {m?.override != null ? 'Change override' : 'Set override'}
              </button>
              {m?.override != null && (
                <button onClick={() => clearOverride(metric)} className="text-xs text-gray-500 hover:underline">Remove override</button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <label className="text-sm text-gray-600">Month</label>
        <input type="month" value={monthKey} onChange={e => setMonthKey(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
        <p className="text-xs text-gray-400 ml-2">This number flows into Studio Trends (and Goals). The override wins and survives every re-import. Total Member Count is entered manually in Studio Trends.</p>
      </div>
      {loading ? <Spinner /> : (
        <div className="grid sm:grid-cols-2 gap-3">
          <Card metric="cancellations" label="Monthly cancellations" m={data?.cancellations} />
        </div>
      )}
    </div>
  )
}

// ─── Cards & Birthdays (recognition checklist) ────────────────────────────────
const firstOf = (name) => (name || '').trim().split(/\s+/)[0] || 'there'
const renderBday = (body, name) => String(body || '').replace(/\{(\w+)\}/g, (_, k) => (k === 'first_name' ? firstOf(name) : ''))

function RecognitionTab({ canImport }) {
  const { currentStudio } = useStudio()
  const [sub, setSub] = useState('cards')  // cards | birthdays
  const [monthKey, setMonthKey] = useState(new Date().toISOString().slice(0, 7))
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [bdayMember, setBdayMember] = useState('Happy Birthday, {first_name}! 🎂')
  const [bdayNonMember, setBdayNonMember] = useState('Happy Birthday, {first_name}! 🎂 Come in for a FREE workout on us! 🔥')
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState('')
  const [scriptFor, setScriptFor] = useState(null)
  const fileRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (sub === 'cards') {
        setRows(await apiGet(`${BASE}/recognition?type=thank_you_card`))
      } else {
        const [b, tpls] = await Promise.all([
          apiGet(`${BASE}/recognition?type=birthday&month_key=${monthKey}`),
          apiGet(`${BASE}/templates`).catch(() => []),
        ])
        setRows(b)
        const tm = (tpls || []).find(x => x.template_key === 'birthday_text')
        const tn = (tpls || []).find(x => x.template_key === 'birthday_text_nonmember')
        if (tm) setBdayMember(tm.body)
        if (tn) setBdayNonMember(tn.body)
      }
    } catch { setRows([]) }
    finally { setLoading(false) }
  }, [sub, monthKey, currentStudio?.id])
  useEffect(() => { load() }, [load])

  const complete = async (r) => {
    setRows(rs => rs.map(x => x.id === r.id ? { ...x, status: 'completed' } : x))
    try { await apiPost(`${BASE}/recognition/${r.id}/complete`, {}) } catch { /* ignore */ }
  }
  const onUpload = async (e) => {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    setUploading(true); setMsg('')
    try {
      const name = file.name.toLowerCase()
      let parsed
      if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
        parsed = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false })
      } else { parsed = parseCSV(await file.text()) }
      const res = await apiPost(`${BASE}/recognition/birthdays/import`, { rows: parsed })
      setMsg(`Imported ${res.created} birthday${res.created !== 1 ? 's' : ''}`
        + (res.excluded ? ` · ${res.excluded} excluded (not interested / do not call)` : '')
        + (res.address_updated ? ` · ${res.address_updated} member addresses saved` : '')
        + (res.skipped ? ` · ${res.skipped} skipped (missing name/date)` : '') + '.')
      load()
    } catch (e) { setMsg('Upload failed: ' + (e?.message || 'error')) }
    finally { setUploading(false) }
  }

  const pending = rows.filter(r => r.status === 'pending')
  const doneCount = rows.filter(r => r.status === 'completed').length
  const pct = rows.length ? Math.round(doneCount / rows.length * 100) : 0

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        {[{ k: 'cards', label: 'Thank-You Cards', icon: Gift }, { k: 'birthdays', label: 'Birthdays', icon: Cake }].map(s => {
          const Icon = s.icon
          return (
            <button key={s.k} onClick={() => setSub(s.k)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border ${sub === s.k ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-300'}`}>
              <Icon size={14} /> {s.label}
            </button>
          )
        })}
        {sub === 'birthdays' && (
          <>
            <input type="month" value={monthKey} onChange={e => setMonthKey(e.target.value)}
              className="ml-2 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            {canImport && (
              <>
                <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" onChange={onUpload} className="hidden" />
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Upload birthday list
                </button>
              </>
            )}
          </>
        )}
      </div>

      {msg && <div className="mb-3 bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg px-3 py-2">{msg}</div>}

      {sub === 'cards' && (
        <div className="mb-4 bg-orange-50 border border-orange-200 rounded-xl p-3.5 text-sm text-orange-900">
          <p className="font-semibold mb-1">✍️ How to send a thank-you card</p>
          <p className="text-[13px] leading-relaxed">
            Handwrite a warm welcome card for each new member and tuck in a <b>$5 retail gift card</b>.
            Address it to them by name, welcome them to the studio, and let them know you're excited to sweat with them.
            For example: <i>"Hi Sarah, welcome to the HOTWORX Pewaukee family! We're so glad you're here — enjoy this
            $5 gift toward anything in our retail shop. See you in the sauna! 🔥 — The HOTWORX Team."</i> Drop it in the mail,
            then tap the circle to mark it sent.
          </p>
        </div>
      )}

      {/* Progress */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden max-w-xs">
          <div className="h-full bg-red-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs text-gray-500">{doneCount}/{rows.length} done</span>
      </div>

      {loading ? <Spinner /> : rows.length === 0 ? (
        <Empty msg={sub === 'cards'
          ? 'No new members yet — thank-you cards appear here as members are uploaded.'
          : 'No birthdays for this month. Upload the birthday list to populate it.'} />
      ) : (
        <div className="space-y-2">
          {rows.map(r => {
            const done = r.status === 'completed'
            const isBday = sub === 'birthdays'
            const isMemberRow = /^(member|customer|reciprocal member|employee)$/i.test((r.lead_status || '').trim())
            const script = htmlToText(renderBday(isMemberRow ? bdayMember : bdayNonMember, r.member_name))
            return (
              <div key={r.id} className={`border rounded-xl p-3 transition-colors ${done ? 'bg-blue-50 border-blue-200 opacity-70' : 'bg-white border-gray-200'}`}>
                <div className="flex items-start gap-3">
                  <button onClick={() => !done && complete(r)} disabled={done}
                    className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center ${done ? 'bg-blue-500 border-blue-500' : 'border-gray-300 hover:border-blue-400'}`}>
                    {done && <Check size={13} className="text-white" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-semibold ${done ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{r.member_name || '—'}</span>
                      <span className="text-xs text-gray-400">
                        {isBday ? `🎂 ${r.ref_date || ''}` : `joined ${r.ref_date || '—'}`}
                      </span>
                      {isBday && r.sub_status && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{r.sub_status}</span>}
                      {isBday && isMemberRow && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">MEMBER</span>}
                      {isBday && !isMemberRow && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">FREE WORKOUT OFFER</span>}
                    </div>
                    {isBday && (r.lead_status || r.last_session) && (
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {r.lead_status || ''}{r.last_session ? `${r.lead_status ? ' · ' : ''}last session ${r.last_session}` : ''}
                      </p>
                    )}
                    {!isBday && !done && <p className="text-xs text-gray-500 mt-0.5">Write & mail a thank-you card. Tap the circle when sent.</p>}
                  </div>
                  {isBday && !done && (
                    <button onClick={() => setScriptFor({ channel: 'text', member_name: r.member_name, phone: r.phone, label: isMemberRow ? 'Birthday text' : 'Birthday — free workout offer', script })}
                      title="See & copy script"
                      className="mt-0.5 flex-shrink-0 p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-300">
                      <MessageSquare size={16} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {scriptFor && <ScriptModal item={scriptFor} onClose={() => setScriptFor(null)} />}
    </div>
  )
}

// ─── Shared bits ──────────────────────────────────────────────────────────────
// Stable, module-level file drop (must NOT be defined inside a render, or the
// <input> remounts on every state change and selections don't stick).
function FileDrop({ label, hint, file, onPick }) {
  return (
    <div className="border-2 border-dashed border-gray-200 rounded-xl p-4">
      <p className="text-sm font-semibold text-gray-800">{label}</p>
      <p className="text-[11px] text-gray-400 mb-2">{hint}</p>
      <input type="file" accept=".csv,.txt,.tsv,.xlsx,.xls,text/csv,text/plain" onChange={onPick} className="text-xs" />
      {file && <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1"><Check size={12} /> {file.name} — {file.rows.length} rows</p>}
    </div>
  )
}

const Spinner = () => <div className="flex justify-center py-16"><Loader2 className="animate-spin text-gray-300" size={26} /></div>
const Empty = ({ msg }) => <div className="text-center py-16 text-sm text-gray-400">{msg}</div>
