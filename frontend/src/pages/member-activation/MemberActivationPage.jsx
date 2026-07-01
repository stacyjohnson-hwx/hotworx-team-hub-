import { useState, useEffect, useCallback } from 'react'
import { Upload, Users, HeartHandshake, AlertTriangle, Check, Loader2, RefreshCw, Gauge } from 'lucide-react'
import { apiGet, apiPost, apiPatch, apiPut, apiDelete } from '@/hooks/useApi'
import { useRole } from '@/hooks/useRole'
import { useStudio } from '@/contexts/StudioContext'

const BASE = '/api/member-activation'

// ─── CSV parsing (client-side; raw rows are POSTed and mapped on the backend) ──
function parseCSV(text) {
  const parseLine = (line) => {
    const out = []; let cur = '', q = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') q = !q
      else if (c === ',' && !q) { out.push(cur); cur = '' }
      else cur += c
    }
    out.push(cur)
    return out.map(v => v.replace(/^["']|["']$/g, '').trim())
  }
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) return []
  const headers = parseLine(lines[0])
  return lines.slice(1).map(line => {
    const vals = parseLine(line)
    const obj = {}
    headers.forEach((h, i) => { obj[h] = vals[i] })
    return obj
  })
}

const TABS = [
  { k: 'members',  label: 'Members',            icon: Users },
  { k: 'import',   label: 'Daily Import',        icon: Upload },
  { k: 'ledger',   label: 'Cancellation Ledger', icon: HeartHandshake },
  { k: 'metrics',  label: 'Studio Trends',       icon: Gauge },
  { k: 'unrecon',  label: 'Unreconciled',        icon: AlertTriangle },
]

export default function MemberActivationPage() {
  const { isOwnerOrManager } = useRole()
  const [tab, setTab] = useState('members')

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

      {tab === 'members' && <MembersTab />}
      {tab === 'import'  && <ImportTab canImport={isOwnerOrManager} />}
      {tab === 'ledger'  && <LedgerTab canEdit={isOwnerOrManager} />}
      {tab === 'metrics' && <MetricsTab canEdit={isOwnerOrManager} />}
      {tab === 'unrecon' && <UnreconciledTab />}
    </div>
  )
}

// ─── Members ──────────────────────────────────────────────────────────────────
function MembersTab() {
  const { currentStudio } = useStudio()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all') // all | new | cancelled
  const [sort, setSort] = useState({ key: 'join_date', dir: 'desc' })

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
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.id} className={`border-b border-gray-100 ${r.is_cancelled ? 'bg-gray-50 text-gray-400' : ''}`}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-800 flex items-center gap-1.5">
                      {r.full_name || r.customer_id}
                      {r.is_new_member && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">NEW</span>}
                      {r.is_cancelled && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">CANCELLED</span>}
                    </div>
                    <div className="text-[11px] text-gray-400">{r.email || '—'} · {r.package_name || '—'}</div>
                  </td>
                  <td className="px-3 py-2">{r.status || '—'}</td>
                  <td className="px-3 py-2">{r.join_date || '—'}</td>
                  <td className="px-3 py-2 text-right font-semibold">{r.visit_days}</td>
                  <td className="px-3 py-2 text-right">{r.total_sessions}</td>
                  <td className="px-3 py-2 text-right">{r.workouts_tried}/12</td>
                  <td className="px-3 py-2">{r.last_booking_date || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
    const rows = parseCSV(await file.text())
    setFiles(f => ({ ...f, [kind]: { name: file.name, rows } }))
  }

  const run = async () => {
    setRunning(true); setError(null); setResult(null)
    try {
      const payload = {
        bookings:  files.bookings?.rows || [],
        members:   files.members?.rows || [],
        cancelled: files.cancelled?.rows || [],
      }
      setResult(await apiPost(`${BASE}/import`, payload))
      loadHistory()
    } catch (e) { setError(e.message) }
    finally { setRunning(false) }
  }

  if (!canImport) return <Empty msg="Daily Import is limited to owners and managers." />

  const Drop = ({ kind, label, hint }) => (
    <div className="border-2 border-dashed border-gray-200 rounded-xl p-4">
      <p className="text-sm font-semibold text-gray-800">{label}</p>
      <p className="text-[11px] text-gray-400 mb-2">{hint}</p>
      <input type="file" accept=".csv,text/csv" onChange={onFile(kind)} className="text-xs" />
      {files[kind] && <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1"><Check size={12} /> {files[kind].name} — {files[kind].rows.length} rows</p>}
    </div>
  )
  const anyFile = files.bookings || files.members || files.cancelled

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-3">
        <Drop kind="bookings"  label="Booking export"   hint="Export A — one row per session (Id, Email, Booking Date, Session Type)" />
        <Drop kind="members"   label="Member roster"    hint="Export B — full active roster (Customer Id, SubscriptionDate, Status…)" />
        <Drop kind="cancelled" label="Cancelled export" hint="Export C — daily cancellations (Customer Id, Cancellation Date)" />
      </div>

      <div className="flex items-center gap-3">
        <button onClick={run} disabled={running || !anyFile}
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
function UnreconciledTab() {
  const { currentStudio } = useStudio()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await apiGet(`${BASE}/unreconciled`)) } catch { setRows([]) }
    finally { setLoading(false) }
  }, [currentStudio?.id])
  useEffect(() => { load() }, [load])

  if (loading) return <Spinner />
  return (
    <div>
      <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-3 text-sm text-orange-800">
        These bookings matched no member by email. Fix the email on the member (in SAIL) so their visit-days count — otherwise they silently read zero.
      </div>
      {rows.length === 0 ? <Empty msg="Every booking matched a member. Nothing to fix. 🎉" /> : (
        <div className="overflow-x-auto border border-gray-200 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left text-gray-600">
                <th className="px-3 py-2 font-semibold">Booking Id</th>
                <th className="px-3 py-2 font-semibold">Email on booking</th>
                <th className="px-3 py-2 font-semibold">Date</th>
                <th className="px-3 py-2 font-semibold">Session</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.booking_id} className="border-b border-gray-100">
                  <td className="px-3 py-2">{r.booking_id}</td>
                  <td className="px-3 py-2 text-gray-700">{r.member_email || '—'}</td>
                  <td className="px-3 py-2">{r.booking_date || '—'}</td>
                  <td className="px-3 py-2">{r.session_type || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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

// ─── Shared bits ──────────────────────────────────────────────────────────────
const Spinner = () => <div className="flex justify-center py-16"><Loader2 className="animate-spin text-gray-300" size={26} /></div>
const Empty = ({ msg }) => <div className="text-center py-16 text-sm text-gray-400">{msg}</div>
