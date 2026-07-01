import { useState, useEffect, useCallback } from 'react'
import { Upload, Users, HeartHandshake, AlertTriangle, Check, Loader2, RefreshCw, Gauge, ListChecks, Phone, MessageSquare, SkipForward, FileText, Trophy, Gift, Cake, Pencil } from 'lucide-react'
import { apiGet, apiPost, apiPatch, apiPut, apiDelete } from '@/hooks/useApi'
import { useRole } from '@/hooks/useRole'
import { useStudio } from '@/contexts/StudioContext'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

const BASE = '/api/member-activation'

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
  { k: 'scripts',  label: 'Scripts',             icon: FileText },
  { k: 'recognition', label: 'Cards & Birthdays', icon: Gift },
  { k: 'import',   label: 'Daily Import',        icon: Upload },
  { k: 'metrics',  label: 'Studio Trends',       icon: Gauge },
  { k: 'unrecon',  label: 'Unreconciled',        icon: AlertTriangle },
]

export default function MemberActivationPage() {
  const { isOwnerOrManager } = useRole()
  const [tab, setTab] = useState('daily')

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
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
      {tab === 'recognition' && <RecognitionTab canImport={isOwnerOrManager} />}
      {tab === 'import'  && <ImportTab canImport={isOwnerOrManager} />}
      {tab === 'metrics' && <MetricsTab canEdit={isOwnerOrManager} />}
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
  const todayISO = new Date().toISOString().slice(0, 10)

  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await apiGet(`${BASE}/members`)) } catch { setRows([]) }
    finally { setLoading(false) }
  }, [currentStudio?.id])
  useEffect(() => { load() }, [load])

  const GET = {
    full_name: r => (r.full_name || '').toLowerCase(),
    status: r => (r.status || '').toLowerCase(),
    join_date: r => r.join_date || '',
    visit_days: r => r.visit_days || 0,
    total_sessions: r => r.total_sessions || 0,
    workouts_tried: r => r.workouts_tried || 0,
    last_booking_date: r => r.last_booking_date || '',
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
                {isOwnerOrManager && <th className="px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.id} className={`border-b border-gray-100 ${r.is_cancelled ? 'bg-gray-50 text-gray-400' : ''}`}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-800 flex items-center gap-1.5">
                      {r.full_name || r.customer_id}
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
          {running ? 'Importing…' : 'Run Import'}
        </button>
        <p className="text-xs text-gray-400">Re-running with the same files is safe — nothing double-counts.</p>
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
  const [form, setForm] = useState({ full_name: '', member_type: 'employee', origin_studio: '', expiration_date: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await apiGet(`${BASE}/unreconciled`)) } catch { setRows([]) }
    finally { setLoading(false) }
  }, [currentStudio?.id])
  useEffect(() => { load() }, [load])

  // Group the unreconciled bookings by email so each person is one row.
  const groups = Object.values(rows.reduce((acc, r) => {
    const e = (r.member_email || '(no email)').toLowerCase()
    if (!acc[e]) acc[e] = { email: e, count: 0, last: null }
    acc[e].count++
    if (!acc[e].last || (r.booking_date || '') > acc[e].last) acc[e].last = r.booking_date
    return acc
  }, {})).sort((a, b) => b.count - a.count)

  const openAdd = (email) => { setAddFor(email); setForm({ full_name: '', member_type: 'employee', origin_studio: '', expiration_date: '' }) }
  const addPerson = async () => {
    setSaving(true)
    try {
      await apiPost(`${BASE}/members`, { email: addFor, full_name: form.full_name, member_type: form.member_type, origin_studio: form.origin_studio, expiration_date: form.expiration_date })
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
                    <select value={form.member_type} onChange={e => setForm(f => ({ ...f, member_type: e.target.value }))}
                      className="border border-gray-300 rounded px-2 py-1 text-sm bg-white">
                      {MEMBER_TYPE_OPTS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
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

// Edit a member's name / type / contact.
function MemberEditModal({ member, onClose, onSaved }) {
  const [form, setForm] = useState({
    full_name: member.full_name || '', member_type: member.member_type || 'member',
    phone: member.phone || '', email: member.email || '', origin_studio: member.origin_studio || '',
    expiration_date: member.expiration_date || '',
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
  { k: 'reengage', label: 'Re-engagement', match: r => r.trigger_ref?.startsWith('reengage') },
  { k: 'milestone', label: 'Milestones', match: r => r.trigger_ref?.startsWith('milestone') || r.trigger_ref === 'passport_sticker' },
  { k: 'onboarding', label: 'Onboarding', match: r => r.trigger_kind === 'day_based' || r.trigger_ref?.startsWith('save') },
]

function DailyListTab() {
  const { currentStudio } = useStudio()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [drafts, setDrafts] = useState({})   // id -> edited script
  const [done, setDone] = useState({})        // id -> true (row flashes blue then drops)
  const [fulfil, setFulfil] = useState({})    // id -> reward fulfilled checkbox
  const [day2, setDay2] = useState(null)      // the Day-2 item being captured

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
      else await apiPost(`${BASE}/daily-list/${r.id}/complete`, { fulfilled: !!fulfil[r.id] })
    } catch { /* ignore */ }
  }
  const skip = async (r) => {
    try { if (r.kind !== 'reengage') await apiPost(`${BASE}/daily-list/${r.id}/skip`, {}) } catch { /* ignore */ }
    setRows(rs => rs.filter(x => x.id !== r.id))
  }
  const setFlag = async (r, flag) => {
    try { await apiPatch(`${BASE}/journeys/${r.journey_id}`, { first_session_flag: flag }) } catch { /* ignore */ }
    load()
  }

  const f = FILTERS.find(x => x.k === filter)
  const shown = filter === 'all' ? rows : rows.filter(f.match)

  if (loading) return <Spinner />
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {FILTERS.map(x => (
          <button key={x.k} onClick={() => setFilter(x.k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${filter === x.k ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-300'}`}>
            {x.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400">{shown.length} to reach</span>
      </div>

      {shown.length === 0 ? <Empty msg="Nobody to reach right now. Run a Daily Import to refresh the queue. 🎉" /> : (
        <div className="space-y-2.5">
          {shown.map(r => {
            const isDone = done[r.id]
            const script = drafts[r.id] != null ? drafts[r.id] : r.script
            const isCall = r.channel === 'call'
            return (
              <div key={r.id} className={`border rounded-xl p-3.5 transition-colors ${isDone ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200'}`}>
                <div className="flex items-start gap-3">
                  <button onClick={() => complete(r)} title="Mark done"
                    className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${isDone ? 'bg-blue-500 border-blue-500' : 'border-gray-300 hover:border-blue-400'}`}>
                    {isDone && <Check size={13} className="text-white" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-900">{r.member_name}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 ${isCall ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {isCall ? <Phone size={9} /> : <MessageSquare size={9} />}{isCall ? 'Call' : 'Text'}
                      </span>
                      {r.priority <= 3 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">PRIORITY</span>}
                      {r.reward_key && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1"><Trophy size={9} />{r.reward_key.replace(/_/g, ' ')}</span>}
                    </div>
                    <p className="text-xs text-gray-500 mb-2">{r.label}</p>
                    <textarea value={script} onChange={e => setDrafts(d => ({ ...d, [r.id]: e.target.value }))}
                      rows={isCall ? 3 : 2}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-red-400 bg-gray-50" />
                    {r.reward_key && (
                      <label className="flex items-center gap-1.5 mt-2 text-xs text-gray-600">
                        <input type="checkbox" checked={!!fulfil[r.id]} onChange={e => setFulfil(ff => ({ ...ff, [r.id]: e.target.checked }))} />
                        Reward handed over ({r.reward_key.replace(/_/g, ' ')})
                      </label>
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
                      {!isCall && r.phone && (
                        <a href={`sms:${r.phone}?&body=${encodeURIComponent(script)}`}
                          className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"><MessageSquare size={12} /> Open text</a>
                      )}
                      <button onClick={() => navigator.clipboard?.writeText(script)} className="text-xs text-gray-500 hover:text-gray-800">Copy script</button>
                      <button onClick={() => skip(r)} className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1 ml-auto"><SkipForward size={12} /> Skip</button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {day2 && <Day2Modal item={day2} onClose={() => setDay2(null)}
        onDone={() => { const id = day2.id; setDay2(null); drop(id) }} />}
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

function ScriptAdminTab({ canEdit }) {
  const { currentStudio } = useStudio()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState(null)
  const [body, setBody] = useState('')
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { const d = await apiGet(`${BASE}/templates`); setRows(d); if (d[0]) { setSel(d[0].template_key); setBody(d[0].body || '') } }
    catch { setRows([]) }
    finally { setLoading(false) }
  }, [currentStudio?.id])
  useEffect(() => { load() }, [load])

  const select = (t) => { setSel(t.template_key); setBody(t.body || ''); setSaved(false) }
  const current = rows.find(t => t.template_key === sel)
  const save = async () => {
    await apiPut(`${BASE}/templates/${sel}`, { body })
    setRows(rs => rs.map(t => t.template_key === sel ? { ...t, body } : t))
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <Spinner />
  return (
    <div className="grid md:grid-cols-[240px_1fr] gap-4">
      <div className="border border-gray-200 rounded-xl overflow-hidden max-h-[70vh] overflow-y-auto">
        {rows.map(t => (
          <button key={t.template_key} onClick={() => select(t)}
            className={`w-full text-left px-3 py-2 text-xs border-b border-gray-100 ${sel === t.template_key ? 'bg-red-50 text-red-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}>
            {t.label || t.template_key}
            <span className="block text-[10px] text-gray-400">{t.channel}</span>
          </button>
        ))}
      </div>
      <div>
        {!current ? <Empty msg="Select a template to edit." /> : (
          <>
            <p className="text-sm font-semibold text-gray-800 mb-1">{current.label}</p>
            <p className="text-[11px] text-gray-400 mb-2">Key: {current.template_key} · {current.channel}. Edits apply on the next Daily List refresh.</p>
            <textarea value={body} onChange={e => setBody(e.target.value)} disabled={!canEdit} rows={5}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-red-400 disabled:bg-gray-50" />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {VARS.map(v => <span key={v} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">{`{${v}}`}</span>)}
            </div>
            <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Preview</p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{renderPreview(body)}</p>
            </div>
            {canEdit && (
              <button onClick={save} className="mt-3 bg-red-600 text-white text-sm font-semibold px-5 py-2 rounded-xl hover:bg-red-700">
                {saved ? '✓ Saved' : 'Save template'}
              </button>
            )}
          </>
        )}
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
        <p className="text-xs text-gray-400 ml-2">These two numbers flow into Studio Trends (and Goals). The override wins and survives every re-import.</p>
      </div>
      {loading ? <Spinner /> : (
        <div className="grid sm:grid-cols-2 gap-3">
          <Card metric="cancellations" label="Monthly cancellations" m={data?.cancellations} />
          <Card metric="active_members" label="Active member count" m={data?.active_members} disabled={!data?.is_current_month} />
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
  const [bdayBody, setBdayBody] = useState('Happy Birthday, {first_name}! 🎂')
  const [drafts, setDrafts] = useState({})
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState('')
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
        const t = (tpls || []).find(x => x.template_key === 'birthday_text')
        if (t) setBdayBody(t.body)
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
      setMsg(`Imported ${res.created} birthday${res.created !== 1 ? 's' : ''}${res.skipped ? ` · ${res.skipped} skipped (missing name/date)` : ''}.`)
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
            const script = drafts[r.id] != null ? drafts[r.id] : renderBday(bdayBody, r.member_name)
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
                    </div>
                    {isBday && !done && (
                      <>
                        <textarea value={script} onChange={e => setDrafts(d => ({ ...d, [r.id]: e.target.value }))} rows={2}
                          className="w-full mt-2 border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none bg-gray-50 focus:outline-none focus:border-red-400" />
                        <div className="flex items-center gap-3 mt-1.5">
                          {r.phone && <a href={`sms:${r.phone}?&body=${encodeURIComponent(script)}`} className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1"><MessageSquare size={12} /> Open text</a>}
                          <button onClick={() => navigator.clipboard?.writeText(script)} className="text-xs text-gray-500 hover:text-gray-800">Copy</button>
                        </div>
                      </>
                    )}
                    {!isBday && !done && <p className="text-xs text-gray-500 mt-0.5">Write & mail a thank-you card. Tap the circle when sent.</p>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
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
