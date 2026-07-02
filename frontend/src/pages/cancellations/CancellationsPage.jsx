import { useState, useEffect, useCallback, useRef } from 'react'
import { useRole } from '@/hooks/useRole'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import { UserMinus, Plus, X, Trash2, Edit2, Target, Loader2, Filter, Upload } from 'lucide-react'
import * as XLSX from 'xlsx'

// Parse a cancelled CSV/Excel to raw header-keyed rows (backend maps the columns).
async function parseCancelFile(file) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false })
  }
  const text = await file.text()
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
    const vals = parseLine(line); const obj = {}
    headers.forEach((h, i) => { obj[h] = vals[i] }); return obj
  })
}

// ─── Controlled vocab (mirrors the PRD) ───────────────────────────────────────
export const REASONS = [
  { value: 'non_payment', label: 'Non-payment (auto-cancel)' },
  { value: 'cost',        label: 'Cost / financial' },
  { value: 'not_using',   label: 'Not using it / no time' },
  { value: 'no_results',  label: 'Not seeing results' },
  { value: 'moving',      label: 'Moving / relocating' },
  { value: 'medical',     label: 'Medical / injury' },
  { value: 'unhappy',     label: 'Unhappy with experience' },
  { value: 'competitor',  label: 'Going to a competitor' },
  { value: 'other',       label: 'Other' },
]
// Reason → the save to surface FIRST (PRD Step 2).
const MATCHED_OFFER = {
  non_payment: 'Auto-cancelled for non-payment. Call to update their card and reactivate — recover the account before treating it as a true cancel.',
  cost:       'Offer a pause/freeze first — only offer the free month if the pause is refused.',
  not_using:  'Re-engage: rebook 3 sessions now, reset goals, schedule a coach check-in.',
  no_results: 'Free upgrade to Sweat Elite for the month + Training Trax goal reset.',
  moving:     'Transfer to the nearest HOTWORX studio, or process gracefully.',
  medical:    'Freeze the account (a hold, not a discount). Set a return date.',
  unhappy:    'Service recovery — escalate to a Lead. Do NOT lead with a discount.',
  competitor: 'Re-anchor on goals + a Sweat Elite trial; understand what’s pulling them.',
  other:      'Listen, re-anchor on their original goal, and match the cheapest save that fits.',
}
const OFFERS = [
  { value: 're_engage',  label: 'Re-engage (rebook + goals)' },
  { value: 'freeze',     label: 'Freeze / pause' },
  { value: 'sweat_elite',label: 'Sweat Elite month' },
  { value: 'free_month', label: 'Free month (last resort)' },
]
const OFFER_ACCEPTED = [
  { value: 'none',        label: 'None' },
  { value: 're_engage',   label: 'Re-engage' },
  { value: 'freeze',      label: 'Freeze / pause' },
  { value: 'sweat_elite', label: 'Sweat Elite month' },
  { value: 'free_month',  label: 'Free month' },
]
export const OUTCOMES = [
  { value: 'saved',     label: 'Saved',     cls: 'bg-green-100 text-green-700 border-green-200' },
  { value: 'pending',   label: 'Pending',   cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  { value: 'cancelled', label: 'Cancelled', cls: 'bg-red-100 text-red-700 border-red-200' },
]
const WIN_BACK_STEPS = [
  { value: 'at_pos',            label: 'At-POS save attempted' },
  { value: 'monitoring',        label: 'Offer accepted — monitoring' },
  { value: 'freeze_active',     label: 'Freeze active — return date set' },
  { value: 'call_scheduled',    label: 'Post-cancel call scheduled' },
  { value: 'call_completed',    label: 'Post-cancel call completed' },
  { value: 'outreach_sent',     label: 'Win-back outreach sent' },
  { value: 'reactivated',       label: 'Re-activated ✅' },
  { value: 'lost_declined',     label: 'Lost — declined all offers' },
  { value: 'lost_no_response',  label: 'Lost — no response' },
]
const WOULD_RETURN = [
  { value: '', label: '—' }, { value: 'yes', label: 'Yes' }, { value: 'maybe', label: 'Maybe' }, { value: 'no', label: 'No' },
]

const labelOf = (arr, v) => arr.find(x => x.value === v)?.label || v || '—'
const fmtDate = s => s ? new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'
const todayStr = () => new Date().toISOString().split('T')[0]
const input = 'w-full rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500'
const lbl = 'block text-xs font-semibold text-gray-600 mb-1'

// ─── Form (guided save flow) ──────────────────────────────────────────────────
function CancellationForm({ entry, users, currentUserId, onSave, onClose }) {
  const [form, setForm] = useState({
    member_name: entry?.member_name || '',
    member_id: entry?.member_id || '',
    date_requested: entry?.date_requested || todayStr(),
    handled_by: entry?.handled_by || currentUserId || '',
    cancel_reason: entry?.cancel_reason || '',
    reason_notes: entry?.reason_notes || '',
    competitor_name: entry?.competitor_name || '',
    conversation_notes: entry?.conversation_notes || '',
    offers_presented: Array.isArray(entry?.offers_presented) ? entry.offers_presented : [],
    offer_accepted: entry?.offer_accepted || 'none',
    goal_recaptured: entry?.goal_recaptured || false,
    outcome: entry?.outcome || 'saved',
    win_back_step: entry?.win_back_step || 'at_pos',
    follow_up_date: entry?.follow_up_date || '',
    postcancel_feedback: entry?.postcancel_feedback || '',
    would_return: entry?.would_return || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const toggleOffer = (v) => set('offers_presented', form.offers_presented.includes(v)
    ? form.offers_presented.filter(o => o !== v)
    : [...form.offers_presented, v])

  const submit = async (e) => {
    e.preventDefault()
    if (!form.member_name.trim()) { setError('Member name is required'); return }
    if (!form.cancel_reason) { setError('Pick a cancellation reason'); return }
    if (form.cancel_reason === 'other' && !form.reason_notes.trim()) { setError('Add a note for "Other"'); return }
    setSaving(true); setError('')
    try {
      const saved = entry
        ? await apiPut(`/api/cancellations/${entry.id}`, form)
        : await apiPost('/api/cancellations', form)
      onSave(saved)
    } catch (err) { setError(err.message || 'Save failed'); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-800 rounded-t-2xl sticky top-0">
          <h2 className="text-white font-bold text-lg">{entry ? 'Edit Cancellation' : 'Log Cancellation'}</h2>
          <button type="button" onClick={onClose} className="text-gray-300 hover:text-white"><X size={20} /></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {error && <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>Member name *</label><input className={input} value={form.member_name} onChange={e => set('member_name', e.target.value)} placeholder="Jane Doe" /></div>
            <div><label className={lbl}>SAIL Member ID</label><input className={input} value={form.member_id} onChange={e => set('member_id', e.target.value)} placeholder="optional" /></div>
            <div><label className={lbl}>Date requested</label><input type="date" className={input} value={form.date_requested} onChange={e => set('date_requested', e.target.value)} /></div>
            <div>
              <label className={lbl}>Handled by</label>
              <select className={input} value={form.handled_by} onChange={e => set('handled_by', e.target.value)}>
                <option value="">—</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>

          {/* Step 1 — reason */}
          <div>
            <label className={lbl}>1 · Cancellation reason *</label>
            <select className={input} value={form.cancel_reason} onChange={e => set('cancel_reason', e.target.value)}>
              <option value="">Select a reason…</option>
              {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            {form.cancel_reason === 'other' && (
              <input className={`${input} mt-2`} value={form.reason_notes} onChange={e => set('reason_notes', e.target.value)} placeholder="What was the reason?" />
            )}
            {form.cancel_reason === 'competitor' && (
              <input className={`${input} mt-2`} value={form.competitor_name} onChange={e => set('competitor_name', e.target.value)} placeholder="Which competitor? (e.g. Orangetheory, Planet Fitness)" />
            )}
          </div>

          {/* Step 2 — matched offer */}
          {form.cancel_reason && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-xs font-bold text-red-700 uppercase tracking-wide mb-1">2 · Try this save first</p>
              <p className="text-sm text-gray-700">{MATCHED_OFFER[form.cancel_reason]}</p>
            </div>
          )}

          {/* Conversation notes — context for the win-back call */}
          <div>
            <label className={lbl}>Conversation notes <span className="text-gray-400 font-normal">— what they said; context for when we reach back out</span></label>
            <textarea rows={3} className={`${input} resize-none`} value={form.conversation_notes} onChange={e => set('conversation_notes', e.target.value)} placeholder="e.g. Loves the workouts but new baby + tight on money; open to coming back in the fall…" />
          </div>

          {/* Step 3 — goal refocus */}
          <label className="flex items-center gap-2.5 cursor-pointer bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5">
            <input type="checkbox" checked={form.goal_recaptured} onChange={e => set('goal_recaptured', e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-orange-500" />
            <Target size={15} className="text-orange-500" />
            <span className="text-sm font-semibold text-gray-800">3 · Recaptured their original goal + rebooked a session</span>
          </label>

          {/* Step 4 — offers presented */}
          <div>
            <label className={lbl}>4 · Offers presented <span className="text-gray-400 font-normal">(check all you offered — free month is never blocked, just recorded)</span></label>
            <div className="grid grid-cols-2 gap-2">
              {OFFERS.map(o => (
                <label key={o.value} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${form.offers_presented.includes(o.value) ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}>
                  <input type="checkbox" checked={form.offers_presented.includes(o.value)} onChange={() => toggleOffer(o.value)} className="w-4 h-4 rounded border-gray-300 text-red-500" />
                  {o.label}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Offer that saved them</label>
              <select className={input} value={form.offer_accepted} onChange={e => set('offer_accepted', e.target.value)}>
                {OFFER_ACCEPTED.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {/* Step 5 — outcome */}
            <div>
              <label className={lbl}>5 · Outcome</label>
              <select className={input} value={form.outcome} onChange={e => set('outcome', e.target.value)}>
                {OUTCOMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Win-back step</label>
              <select className={input} value={form.win_back_step} onChange={e => set('win_back_step', e.target.value)}>
                {WIN_BACK_STEPS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div><label className={lbl}>Follow-up date</label><input type="date" className={input} value={form.follow_up_date || ''} onChange={e => set('follow_up_date', e.target.value)} /></div>
          </div>

          {form.outcome === 'cancelled' && (
            <div className="border-t border-gray-100 pt-4 space-y-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Post-cancel learning call</p>
              <div><label className={lbl}>What could we have done better?</label><textarea rows={2} className={`${input} resize-none`} value={form.postcancel_feedback} onChange={e => set('postcancel_feedback', e.target.value)} /></div>
              <div className="w-1/2"><label className={lbl}>Would return?</label>
                <select className={input} value={form.would_return} onChange={e => set('would_return', e.target.value)}>
                  {WOULD_RETURN.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium">Cancel</button>
          <button type="submit" disabled={saving} className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />}{entry ? 'Save Changes' : 'Log Cancellation'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Reporting ────────────────────────────────────────────────────────────────
function Stat({ label, value, cls = 'text-gray-900' }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-center shadow-sm">
      <p className={`text-2xl font-black leading-none ${cls}`}>{value}</p>
      <p className="text-[11px] text-gray-500 font-medium mt-1 uppercase tracking-wide">{label}</p>
    </div>
  )
}
function RBar({ label, value, max, cls = 'bg-red-400' }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-36 flex-shrink-0 text-xs font-semibold text-gray-600 truncate">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden"><div className={`${cls} h-full rounded-full`} style={{ width: `${(value / max) * 100}%` }} /></div>
      <span className="w-8 text-right text-sm font-bold text-gray-800">{value}</span>
    </div>
  )
}
function CancellationReport() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { apiGet('/api/cancellations/report').then(setD).catch(e => setErr(e.message)) }, [])
  if (err) return <div className="text-sm text-red-600 py-8">{err}</div>
  if (!d) return <div className="flex items-center justify-center h-40"><div className="w-7 h-7 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /></div>

  const saveRate = d.total ? Math.round((d.saved / d.total) * 100) : 0
  const reasonMax = Math.max(1, ...Object.values(d.byReason || {}))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Cancellation Requests" value={d.total} />
        <Stat label="Saved" value={d.saved} cls="text-green-600" />
        <Stat label="Save Rate" value={`${saveRate}%`} cls="text-green-600" />
        <Stat label="Re-activated" value={d.reactivated} cls="text-orange-500" />
        <Stat label="Free Months Given" value={d.freeMonthGiven} cls="text-red-500" />
      </div>

      {/* Reasons */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900 mb-4">Why members cancel</h3>
        <div className="space-y-2.5">
          {REASONS.map(r => <RBar key={r.value} label={r.label} value={d.byReason?.[r.value] || 0} max={reasonMax} />)}
        </div>
      </div>

      {/* Per-rep save rate + free-month coaching signal */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm overflow-x-auto">
        <h3 className="text-sm font-bold text-gray-900 mb-1">By team member <span className="text-gray-400 font-normal">— save rate &amp; free-month usage</span></h3>
        {(d.byRep || []).length === 0 ? <p className="text-sm text-gray-400 py-3">No cancellations handled yet.</p> : (
          <table className="w-full text-sm mt-2">
            <thead className="text-gray-500 text-xs uppercase border-b border-gray-200">
              <tr><th className="text-left py-2 font-semibold">Team Member</th><th className="text-right py-2 font-semibold px-3">Requests</th><th className="text-right py-2 font-semibold px-3">Saved</th><th className="text-right py-2 font-semibold px-3">Save Rate</th><th className="text-right py-2 font-semibold px-3">Free Months</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {d.byRep.map(r => {
                const sr = r.requests ? Math.round((r.saved / r.requests) * 100) : 0
                return (
                  <tr key={r.id}>
                    <td className="py-2 font-semibold text-gray-900">{r.name}</td>
                    <td className="py-2 px-3 text-right text-gray-600">{r.requests}</td>
                    <td className="py-2 px-3 text-right text-gray-600">{r.saved}</td>
                    <td className="py-2 px-3 text-right font-semibold text-green-600">{sr}%</td>
                    <td className={`py-2 px-3 text-right font-semibold ${r.freeMonth > r.saved ? 'text-red-600' : 'text-gray-600'}`}>{r.freeMonth}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <p className="text-[11px] text-gray-400 mt-2">Free months in red where they exceed saves — a coaching signal, not a rule.</p>
      </div>

      {/* Feedback feed */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900 mb-3">“What could we have done better?”</h3>
        {(d.feedback || []).length === 0 ? <p className="text-sm text-gray-400">No post-cancel feedback captured yet.</p> : (
          <div className="space-y-3">
            {d.feedback.map(fb => (
              <div key={fb.id} className="border-l-2 border-red-200 pl-3">
                <p className="text-sm text-gray-700">“{fb.postcancel_feedback}”</p>
                <p className="text-xs text-gray-400 mt-0.5">{fb.member_name} · {fmtDate(fb.date)}{fb.would_return ? ` · would return: ${fb.would_return}` : ''}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CancellationsPage() {
  const { role } = useRole()
  const isOwnerOrManager = role === 'owner' || role === 'manager'
  const [rows, setRows] = useState([])
  const [users, setUsers] = useState([])
  const [me, setMe] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)   // null | false(new) | entry
  const [error, setError] = useState('')
  const [tab, setTab] = useState('log')   // 'log' | 'report'
  const [sort, setSort] = useState({ key: 'date_requested', dir: 'desc' })
  const [f, setF] = useState({ reason: '', outcome: '', win_back_step: '', handled_by: '' })

  const load = useCallback(async () => {
    try {
      const [data, ud, meRow] = await Promise.all([
        apiGet('/api/cancellations'),
        apiGet('/api/users'),
        apiGet('/api/users/me').catch(() => null),
      ])
      setRows(data)
      setUsers((ud || []).filter(u => u.is_active !== false).map(u => ({ id: u.id, name: u.full_name || u.email })))
      if (meRow?.id) setMe(meRow.id)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')

  // Upload the SAIL cancelled export → creates ledger + Cancellations entries via the import engine.
  const onUploadCancels = async (e) => {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    setUploading(true); setUploadMsg(''); setError('')
    try {
      const cancelled = await parseCancelFile(file)
      if (!cancelled.length) { setError(`"${file.name}" has no data rows.`); return }
      const res = await apiPost('/api/member-activation/import', { cancelled })
      const c = res?.cancelled || {}
      setUploadMsg(`Imported ${c.ledgered || 0} cancellation${(c.ledgered || 0) !== 1 ? 's' : ''}${c.skipped ? ` · ${c.skipped} skipped (missing id/date)` : ''}.`)
      load()
    } catch (err) {
      setError(err?.message ? `Upload failed: ${err.message}` : 'Upload failed.')
    } finally { setUploading(false) }
  }

  const onSaved = (saved) => {
    setRows(prev => { const i = prev.findIndex(r => r.id === saved.id); return i >= 0 ? prev.map(r => r.id === saved.id ? { ...r, ...saved } : r) : [saved, ...prev] })
    setModal(null)
  }
  const onDelete = async (id) => {
    if (!confirm('Delete this cancellation entry?')) return
    await apiDelete(`/api/cancellations/${id}`)
    setRows(prev => prev.filter(r => r.id !== id))
  }

  const filtered = rows.filter(r =>
    (!f.reason || r.cancel_reason === f.reason) &&
    (!f.outcome || r.outcome === f.outcome) &&
    (!f.win_back_step || r.win_back_step === f.win_back_step) &&
    (!f.handled_by || r.handled_by === f.handled_by))

  const SORT_GETTERS = {
    member_name:    r => (r.member_name || '').toLowerCase(),
    date_requested: r => r.date_requested || '',
    cancel_reason:  r => labelOf(REASONS, r.cancel_reason),
    handled_by_name:r => (r.handled_by_name || '').toLowerCase(),
    outcome:        r => r.outcome || '',
    win_back_step:  r => WIN_BACK_STEPS.findIndex(s => s.value === r.win_back_step),
    follow_up_date: r => r.follow_up_date || '',
  }
  const sorted = [...filtered].sort((a, b) => {
    const g = SORT_GETTERS[sort.key] || SORT_GETTERS.date_requested
    const av = g(a), bv = g(b)
    const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))
    return sort.dir === 'asc' ? cmp : -cmp
  })
  const sortBy = (key) => setSort(s => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))
  const arrow = (key) => sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''

  const saveRate = rows.length ? Math.round((rows.filter(r => r.outcome === 'saved').length / rows.length) * 100) : 0

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5"><UserMinus size={24} className="text-red-600" /> Cancellations &amp; Saves</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            <span className="font-semibold text-gray-900">{rows.length}</span> logged
            <span className="mx-1.5 text-gray-300">·</span>
            <span className="font-semibold text-green-600">{saveRate}%</span> save rate
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isOwnerOrManager && (
            <>
              <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls,text/csv" onChange={onUploadCancels} className="hidden" />
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 disabled:opacity-50"
                title="Upload the SAIL cancelled export to auto-populate this list">
                {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                {uploading ? 'Uploading…' : 'Upload SAIL Cancellations'}
              </button>
            </>
          )}
          <button onClick={() => setModal(false)} className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg shadow-sm">
            <Plus size={16} /> Log Cancellation
          </button>
        </div>
      </div>

      {uploadMsg && <div className="mb-4 bg-green-50 border border-green-300 text-green-800 text-sm rounded-lg px-4 py-3 flex items-center gap-2"><Upload size={14} /> {uploadMsg}</div>}
      {error && <div className="mb-4 bg-red-50 border border-red-300 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {[{ k: 'log', label: 'Log' }, { k: 'report', label: 'Reports' }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === t.k ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'report' ? <CancellationReport /> : (<>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <Filter size={15} className="text-gray-400" />
        <select className="text-sm border border-gray-300 rounded-lg px-2.5 py-1.5" value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })}>
          <option value="">All reasons</option>{REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <select className="text-sm border border-gray-300 rounded-lg px-2.5 py-1.5" value={f.outcome} onChange={e => setF({ ...f, outcome: e.target.value })}>
          <option value="">All outcomes</option>{OUTCOMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className="text-sm border border-gray-300 rounded-lg px-2.5 py-1.5" value={f.win_back_step} onChange={e => setF({ ...f, win_back_step: e.target.value })}>
          <option value="">All win-back steps</option>{WIN_BACK_STEPS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select className="text-sm border border-gray-300 rounded-lg px-2.5 py-1.5" value={f.handled_by} onChange={e => setF({ ...f, handled_by: e.target.value })}>
          <option value="">All team</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wide select-none">
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold cursor-pointer hover:text-gray-700" onClick={() => sortBy('member_name')}>Member{arrow('member_name')}</th>
              <th className="text-left px-3 py-2.5 font-semibold cursor-pointer hover:text-gray-700" onClick={() => sortBy('date_requested')}>Requested{arrow('date_requested')}</th>
              <th className="text-left px-3 py-2.5 font-semibold cursor-pointer hover:text-gray-700" onClick={() => sortBy('cancel_reason')}>Reason{arrow('cancel_reason')}</th>
              <th className="text-left px-3 py-2.5 font-semibold cursor-pointer hover:text-gray-700" onClick={() => sortBy('package_name')}>Package{arrow('package_name')}</th>
              <th className="text-left px-3 py-2.5 font-semibold cursor-pointer hover:text-gray-700" onClick={() => sortBy('handled_by_name')}>Handled By{arrow('handled_by_name')}</th>
              <th className="text-left px-3 py-2.5 font-semibold cursor-pointer hover:text-gray-700" onClick={() => sortBy('outcome')}>Outcome{arrow('outcome')}</th>
              <th className="text-left px-3 py-2.5 font-semibold cursor-pointer hover:text-gray-700" onClick={() => sortBy('win_back_step')}>Win-Back Step{arrow('win_back_step')}</th>
              <th className="text-left px-3 py-2.5 font-semibold cursor-pointer hover:text-gray-700" onClick={() => sortBy('follow_up_date')}>Follow-Up{arrow('follow_up_date')}</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.length === 0 ? (
              <tr><td colSpan={9} className="text-center text-gray-400 py-12">No cancellations logged yet.</td></tr>
            ) : sorted.map(r => {
              const oc = OUTCOMES.find(o => o.value === r.outcome)
              return (
                <tr key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setModal(r)}>
                  <td className="px-4 py-2.5 font-semibold text-gray-900">
                    {r.member_name}
                    {r.source === 'sail_import' && <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 align-middle">SAIL</span>}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">{fmtDate(r.date_requested)}</td>
                  <td className="px-3 py-2.5 text-gray-600">{labelOf(REASONS, r.cancel_reason)}{r.cancel_reason === 'competitor' && r.competitor_name ? ` · ${r.competitor_name}` : ''}</td>
                  <td className="px-3 py-2.5 text-gray-600 text-xs">{r.package_name || '—'}{r.monthly_payment != null ? ` · $${r.monthly_payment}/mo` : ''}</td>
                  <td className="px-3 py-2.5 text-gray-600">{r.handled_by_name || '—'}</td>
                  <td className="px-3 py-2.5"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${oc?.cls || ''}`}>{oc?.label || r.outcome}</span></td>
                  <td className="px-3 py-2.5 text-gray-600 text-xs">{labelOf(WIN_BACK_STEPS, r.win_back_step)}</td>
                  <td className="px-3 py-2.5 text-gray-600">{fmtDate(r.follow_up_date)}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setModal(r)} className="p-1.5 text-gray-300 hover:text-red-500"><Edit2 size={14} /></button>
                    {isOwnerOrManager && <button onClick={() => onDelete(r.id)} className="p-1.5 text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      </>)}

      {modal !== null && (
        <CancellationForm entry={modal || null} users={users} currentUserId={me} onSave={onSaved} onClose={() => setModal(null)} />
      )}
    </div>
  )
}
