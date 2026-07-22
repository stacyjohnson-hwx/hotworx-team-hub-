import { useState, useEffect, useCallback, useRef } from 'react'
import { useRole } from '@/hooks/useRole'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import { UserMinus, Plus, X, Trash2, Edit2, Target, Loader2, Filter, Upload, Phone, MessageSquare, Mail, Dumbbell, Search, Check } from 'lucide-react'
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
const fmtDate = s => s ? new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

// ── Win-back score tiers (score computed by the backend: winback_score/tier/parts) ──
const TIER_STYLES = {
  hot:  { label: 'Hot',  emoji: '🔥', cls: 'bg-red-100 text-red-700 border-red-300' },
  warm: { label: 'Warm', emoji: '🌤', cls: 'bg-amber-100 text-amber-700 border-amber-300' },
  cool: { label: 'Cool', emoji: '❄️', cls: 'bg-sky-100 text-sky-700 border-sky-200' },
  cold: { label: 'Cold', emoji: '', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
  won:  { label: 'Won',  emoji: '✓', cls: 'bg-green-100 text-green-700 border-green-300' },
}

function ScorePill({ r, onClick }) {
  if (r.winback_tier === 'won') {
    return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${TIER_STYLES.won.cls}`}>✓ Won</span>
  }
  if (r.winback_score == null) return <span className="text-gray-300">—</span>
  const t = TIER_STYLES[r.winback_tier] || TIER_STYLES.cold
  return (
    <button onClick={onClick} title="Why this score? Click for the breakdown"
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${t.cls} hover:ring-1 hover:ring-gray-300`}>
      {t.emoji && <span className="text-[11px]">{t.emoji}</span>}{r.winback_score}
    </button>
  )
}

// Why-this-score breakdown — lists each component's points.
function ScoreBreakdown({ row, onClose }) {
  const t = TIER_STYLES[row.winback_tier] || TIER_STYLES.cold
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-gray-900">{row.member_name}</h3>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-600"><X size={18} /></button>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Win-back score <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${t.cls}`}>{t.emoji} {row.winback_score} · {t.label}</span>
        </p>
        <div className="divide-y divide-gray-100 text-sm">
          {(row.winback_parts || []).map((p, i) => (
            <div key={i} className="flex items-center justify-between py-1.5">
              <span className="text-gray-600">{p.label}</span>
              <span className={`font-bold ${p.pts > 0 ? 'text-gray-900' : p.pts < 0 ? 'text-red-600' : 'text-gray-400'}`}>{p.pts > 0 ? `+${p.pts}` : p.pts}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-3">Higher = more likely to win back. Reason, engagement, recency, tenure, how they left, and anything they told us.</p>
      </div>
    </div>
  )
}
const fmtMoney = n => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const todayStr = () => new Date().toISOString().split('T')[0]
const input = 'w-full rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500'
const lbl = 'block text-xs font-semibold text-gray-600 mb-1'

// ─── Follow-up tasks on a cancellation (schedule multiple dated touches) ───────
function FollowupTasks({ cancellationId }) {
  const [tasks, setTasks] = useState(null)
  const [due, setDue]   = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try { setTasks(await apiGet(`/api/cancellations/${cancellationId}/tasks`)) } catch { setTasks([]) }
  }, [cancellationId])
  useEffect(() => { load() }, [load])

  const add = async () => {
    if (!due && !note.trim()) return
    setBusy(true)
    try { await apiPost(`/api/cancellations/${cancellationId}/tasks`, { due_date: due || null, note: note.trim() || null }); setDue(''); setNote(''); await load() }
    catch { /* ignore */ } finally { setBusy(false) }
  }
  const toggle = async (t) => { setTasks(ts => ts.map(x => x.id === t.id ? { ...x, done: !x.done } : x)); try { await apiPut(`/api/cancellations/tasks/${t.id}`, { done: !t.done }) } catch { /* ignore */ } load() }
  const del = async (t) => { setTasks(ts => ts.filter(x => x.id !== t.id)); try { await apiDelete(`/api/cancellations/tasks/${t.id}`) } catch { /* ignore */ } }

  const today = todayStr()
  return (
    <div className="border-t border-gray-100 pt-4">
      <label className={lbl}>Follow-up tasks <span className="text-gray-400 font-normal">— schedule each touch; check them off as you go</span></label>
      <div className="space-y-1.5 mb-2">
        {tasks === null ? <p className="text-xs text-gray-400">Loading…</p>
          : tasks.length === 0 ? <p className="text-xs text-gray-400">No follow-up tasks yet — add the next touch below.</p>
          : tasks.map(t => {
            const overdue = !t.done && t.due_date && t.due_date < today
            return (
              <div key={t.id} className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 ${t.done ? 'bg-gray-50 border-gray-200' : overdue ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
                <button type="button" onClick={() => toggle(t)} title={t.done ? 'Mark not done' : 'Mark done'}
                  className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${t.done ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-green-400'}`}>
                  {t.done && <Check size={12} className="text-white" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {t.due_date && <span className={`text-xs font-semibold ${t.done ? 'text-gray-400' : overdue ? 'text-red-600' : 'text-gray-700'}`}>{fmtDate(t.due_date)}{overdue ? ' · overdue' : ''}</span>}
                    {t.created_by_name && <span className="text-[11px] text-gray-400">· {t.created_by_name}</span>}
                  </div>
                  {t.note && <p className={`text-xs mt-0.5 ${t.done ? 'text-gray-400 line-through' : 'text-gray-600'}`}>{t.note}</p>}
                </div>
                <button type="button" onClick={() => del(t)} className="p-1 text-gray-300 hover:text-red-500 flex-shrink-0"><Trash2 size={13} /></button>
              </div>
            )
          })}
      </div>
      <div className="flex items-end gap-2">
        <div><span className="text-[11px] text-gray-500">Due</span><input type="date" className={input} value={due} onChange={e => setDue(e.target.value)} /></div>
        <div className="flex-1"><span className="text-[11px] text-gray-500">What to do</span><input className={input} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Text about the summer challenge" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} /></div>
        <button type="button" onClick={add} disabled={busy || (!due && !note.trim())} className="px-3 py-2 bg-gray-800 hover:bg-black text-white text-sm font-semibold rounded-lg disabled:opacity-40 flex items-center gap-1"><Plus size={14} /> Add</button>
      </div>
    </div>
  )
}

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
    likely_to_return: entry?.likely_to_return || false,
    conversation_notes: entry?.conversation_notes || '',
    offers_presented: Array.isArray(entry?.offers_presented) ? entry.offers_presented : [],
    offer_accepted: entry?.offer_accepted || 'none',
    goal_recaptured: entry?.goal_recaptured || false,
    outcome: entry?.outcome || 'pending',
    win_back_step: entry?.win_back_step || 'at_pos',
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

          {entry && entry.total_sessions != null && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                <span className="font-semibold text-gray-500 flex items-center gap-1"><Dumbbell size={13} /> Workout history</span>
                <span><b className="text-gray-800">{entry.total_sessions}</b> session{entry.total_sessions === 1 ? '' : 's'}</span>
                {entry.visit_days != null && <span><b className="text-gray-800">{entry.visit_days}</b> visit-days</span>}
                {entry.workouts_tried != null && <span><b className="text-gray-800">{entry.workouts_tried}</b>/12 workouts tried</span>}
                {entry.last_booking_date && <span>last workout <b className="text-gray-800">{fmtDate(entry.last_booking_date)}</b></span>}
              </div>
              {(entry.phone || entry.email) && (
                <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-200">
                  {entry.phone && <a href={`tel:${entry.phone}`} className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600"><Phone size={12} /> {entry.phone}</a>}
                  {entry.phone && <a href={`sms:${entry.phone}`} className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600"><MessageSquare size={12} /> Text</a>}
                  {entry.email && <a href={`mailto:${entry.email}`} className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600"><Mail size={12} /> {entry.email}</a>}
                </div>
              )}
            </div>
          )}

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

          {/* Likely to return — warm win-back prospect */}
          <label className="flex items-center gap-2.5 cursor-pointer bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
            <input type="checkbox" checked={form.likely_to_return} onChange={e => set('likely_to_return', e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-green-600" />
            <span className="text-sm font-semibold text-gray-800">Likely to return — flag as a warm win-back</span>
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

          <div>
            <label className={lbl}>Win-back step</label>
            <select className={input} value={form.win_back_step} onChange={e => set('win_back_step', e.target.value)}>
              {WIN_BACK_STEPS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          {/* Follow-up tasks — a running list of dated touches, not just one date */}
          {entry ? <FollowupTasks cancellationId={entry.id} />
            : <p className="text-xs text-gray-400 border-t border-gray-100 pt-4">Save this cancellation first, then reopen it to schedule follow-up tasks.</p>}

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
  const competitors = Object.entries(d.byCompetitor || {}).sort((a, b) => b[1] - a[1])
  const compMax = Math.max(1, ...competitors.map(c => c[1]))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Cancellation Requests" value={d.total} />
        <Stat label="Saved" value={d.saved} cls="text-green-600" />
        <Stat label="Save Rate" value={`${saveRate}%`} cls="text-green-600" />
        <Stat label="Re-activated" value={d.reactivated} cls="text-orange-500" />
        <Stat label="Free Months Given" value={d.freeMonthGiven} cls="text-red-500" />
      </div>

      {/* Monthly recurring revenue at stake */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Stat label="MRR Saved / mo" value={fmtMoney(d.savedMrr)} cls="text-green-600" />
        <Stat label="MRR Lost / mo" value={fmtMoney(d.lostMrr)} cls="text-red-600" />
        <Stat label="MRR In Play / mo" value={fmtMoney(d.pendingMrr)} cls="text-amber-600" />
      </div>

      {/* Reasons */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-gray-900 mb-4">Why members cancel</h3>
        <div className="space-y-2.5">
          {REASONS.map(r => <RBar key={r.value} label={r.label} value={d.byReason?.[r.value] || 0} max={reasonMax} />)}
        </div>
      </div>

      {/* Where members are going — competitor takeaway */}
      {competitors.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900 mb-1">Where members are going <span className="text-gray-400 font-normal">— competitors named at cancel</span></h3>
          <div className="space-y-2.5 mt-3">
            {competitors.map(([name, count]) => <RBar key={name} label={name} value={count} max={compMax} />)}
          </div>
        </div>
      )}

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
  const [activeOnly, setActiveOnly] = useState(false)  // only cancelled members who were actually working out (10+ sessions)
  const [tierFilter, setTierFilter] = useState('')     // '' | hot | warm | cool | cold
  const [scoreFor, setScoreFor] = useState(null)       // row whose score breakdown is open
  const [search, setSearch] = useState('')             // free-text: name / email / phone

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

  const [scheduling, setScheduling] = useState(false)
  const runSchedule = async () => {
    if (!confirm('Assign follow-up dates to all unresolved cancellations — hottest win-backs first, 15 per day, skipping Sundays?\n\nThis overwrites existing follow-up dates on unresolved entries.')) return
    setScheduling(true); setUploadMsg(''); setError('')
    try {
      const r = await apiPost('/api/cancellations/schedule-followups', { per_day: 15, skip_sundays: true })
      setUploadMsg(`Scheduled ${r.scheduled} win-back follow-ups across ${r.days} days (15/day, no Sundays) — ${r.first_day} → ${r.last_day}.`)
      load()
    } catch (e) { setError(e?.message ? `Scheduling failed: ${e.message}` : 'Scheduling failed.') }
    finally { setScheduling(false) }
  }

  const onSaved = (saved) => {
    setRows(prev => { const i = prev.findIndex(r => r.id === saved.id); return i >= 0 ? prev.map(r => r.id === saved.id ? { ...r, ...saved } : r) : [saved, ...prev] })
    setModal(null)
  }

  // One-click win-back loop from the queue: log a touch (reschedules the next
  // follow-up) or close it out as won/lost. Merges the updated row so it leaves
  // the "due" list immediately.
  const [touchBusyId, setTouchBusyId] = useState(null)
  const logTouch = async (id, opts = {}) => {
    setTouchBusyId(id); setError('')
    try {
      const updated = await apiPost(`/api/cancellations/${id}/log-touch`, opts)
      setRows(prev => prev.map(r => r.id === id ? { ...r, ...updated } : r))
    } catch (e) {
      setError(e?.message ? `Could not log follow-up: ${e.message}` : 'Could not log follow-up.')
    } finally { setTouchBusyId(null) }
  }
  const onDelete = async (id) => {
    if (!confirm('Delete this cancellation entry?')) return
    await apiDelete(`/api/cancellations/${id}`)
    setRows(prev => prev.filter(r => r.id !== id))
  }

  const q = search.trim().toLowerCase()
  const filtered = rows.filter(r =>
    (!f.reason || r.cancel_reason === f.reason) &&
    (!f.outcome || r.outcome === f.outcome) &&
    (!f.win_back_step || r.win_back_step === f.win_back_step) &&
    (!f.handled_by || r.handled_by === f.handled_by) &&
    (!activeOnly || (r.total_sessions || 0) >= 10) &&
    (!tierFilter || r.winback_tier === tierFilter) &&
    (!q || [r.member_name, r.email, r.phone].some(v => String(v || '').toLowerCase().includes(q))))

  const SORT_GETTERS = {
    winback_score:  r => r.winback_score ?? -1,
    member_name:    r => (r.member_name || '').toLowerCase(),
    date_requested: r => r.date_requested || '',
    cancel_reason:  r => labelOf(REASONS, r.cancel_reason),
    package_name:   r => (r.package_name || '').toLowerCase(),
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

  // Win-back queue: unresolved saves/cancels whose follow-up is due today or
  // overdue — the "reach out now" list so in-progress saves don't go stale.
  const todayLocal = new Date().toLocaleDateString('en-CA')
  const followUps = rows
    .filter(r => ['pending', 'cancelled'].includes(r.outcome) && !r.date_resolved && r.follow_up_date && r.follow_up_date <= todayLocal)
    .sort((a, b) => (a.follow_up_date || '').localeCompare(b.follow_up_date || ''))

  // 🔥 Hottest win-backs — best unresolved leads by score (only shown while genuinely warm+).
  const hotList = rows
    .filter(r => r.winback_score != null && r.winback_tier !== 'won' && !r.date_resolved)
    .sort((a, b) => b.winback_score - a.winback_score)
    .slice(0, 6)
    .filter(r => r.winback_score >= 45)

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
              <button onClick={runSchedule} disabled={scheduling}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 disabled:opacity-50"
                title="Assign follow-up dates by win-back score — 15/day, skipping Sundays">
                {scheduling ? <Loader2 size={15} className="animate-spin" /> : <Target size={15} />}
                {scheduling ? 'Scheduling…' : 'Schedule win-backs'}
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

      {/* Win-back queue — follow-ups due today or overdue, worked inline */}
      {followUps.length > 0 && (
        <div className="mb-5 bg-amber-50 border border-amber-300 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Target size={16} className="text-amber-700" />
            <h3 className="text-sm font-bold text-amber-900">
              {followUps.length} win-back follow-up{followUps.length !== 1 ? 's' : ''} due
            </h3>
          </div>
          <p className="text-xs text-amber-700/80 mb-3">
            Tap the name for details. <b>Reached out</b> logs the touch and schedules the next in 1 month; <b>Won</b>/<b>Lost</b> closes it out.
          </p>
          <div className="space-y-1.5 max-h-[26rem] overflow-y-auto">
            {followUps.map(r => {
              const overdue = r.follow_up_date < todayLocal
              const busy = touchBusyId === r.id
              return (
                <div key={r.id}
                  className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2">
                  <button onClick={() => setModal(r)} className="flex-1 min-w-0 text-left group">
                    <span className="font-semibold text-gray-900 text-sm truncate group-hover:text-red-600 block">{r.member_name}</span>
                    <span className="text-[11px] text-gray-500">
                      {labelOf(REASONS, r.cancel_reason)}
                      <span className={`ml-1.5 font-semibold ${overdue ? 'text-red-600' : 'text-amber-700'}`}>
                        · {overdue ? `${Math.round((new Date(todayLocal) - new Date(r.follow_up_date)) / 86400000)}d overdue` : 'due today'}
                      </span>
                    </span>
                  </button>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {busy ? (
                      <Loader2 size={16} className="animate-spin text-amber-600 mx-6" />
                    ) : (
                      <>
                        <button onClick={() => logTouch(r.id)} title="Logged a follow-up — reschedule next touch in 1 month"
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors">
                          <Phone size={12} /> Reached out
                        </button>
                        <button onClick={() => logTouch(r.id, { resolve: 'won' })} title="Won back — mark saved &amp; resolved"
                          className="flex items-center gap-1 px-2 py-1.5 text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg transition-colors">
                          <Check size={12} /> Won
                        </button>
                        <button onClick={() => logTouch(r.id, { resolve: 'lost' })} title="Lost — close out this win-back"
                          className="px-2 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors">
                          Lost
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 🔥 Hottest win-backs — the best calls to make right now */}
      {hotList.length > 0 && (
        <div className="mb-5 bg-gradient-to-br from-red-50 to-orange-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2.5">
            <h3 className="text-sm font-bold text-red-900">🔥 Hottest win-backs</h3>
            <span className="text-xs text-red-400">most likely to come back — call these first</span>
          </div>
          <div className="space-y-1.5">
            {hotList.map(r => (
              <button key={r.id} onClick={() => setModal(r)}
                className="w-full flex items-center gap-3 text-left bg-white border border-red-100 hover:border-red-300 rounded-lg px-3 py-2 transition-colors">
                <ScorePill r={r} onClick={(e) => { e.stopPropagation(); setScoreFor(r) }} />
                <span className="font-semibold text-gray-900 text-sm flex-1 min-w-0 truncate">{r.member_name}</span>
                <span className="text-xs text-gray-500 hidden sm:inline">{labelOf(REASONS, r.cancel_reason)}</span>
                {r.monthly_payment != null && <span className="text-xs font-semibold text-gray-600 hidden md:inline">worth ${r.monthly_payment}/mo</span>}
                {(r.phone || r.email) && (
                  <span className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    {r.phone && <a href={`tel:${r.phone}`} title={`Call ${r.phone}`} className="text-gray-400 hover:text-red-600"><Phone size={14} /></a>}
                    {r.phone && <a href={`sms:${r.phone}`} title={`Text ${r.phone}`} className="text-gray-400 hover:text-red-600"><MessageSquare size={14} /></a>}
                    {r.email && <a href={`mailto:${r.email}`} title={r.email} className="text-gray-400 hover:text-red-600"><Mail size={14} /></a>}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search + filters */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, phone…"
            className="text-sm border border-gray-300 rounded-lg pl-8 pr-7 py-1.5 w-56 focus:ring-2 focus:ring-red-200 focus:border-red-400 outline-none" />
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-600"><X size={13} /></button>}
        </div>
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
        <button type="button" onClick={() => setActiveOnly(v => !v)}
          title="Cancelled members who were actually working out — the best win-back calls"
          className={`flex items-center gap-1.5 text-sm rounded-lg px-2.5 py-1.5 border font-medium ${activeOnly ? 'bg-red-600 text-white border-red-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
          <Dumbbell size={14} /> Active before leaving (10+)
        </button>
        {['hot', 'warm', 'cool', 'cold'].map(t => (
          <button key={t} type="button" onClick={() => setTierFilter(v => v === t ? '' : t)}
            className={`text-xs font-semibold rounded-lg px-2.5 py-1.5 border ${tierFilter === t ? TIER_STYLES[t].cls + ' ring-1 ring-gray-300' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
            {TIER_STYLES[t].emoji} {TIER_STYLES[t].label}
          </button>
        ))}
        {(activeOnly || tierFilter || q) && <span className="text-xs text-gray-400">{filtered.length} of {rows.length}</span>}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wide select-none">
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold cursor-pointer hover:text-gray-700" onClick={() => sortBy('member_name')}>Member{arrow('member_name')}</th>
              <th className="text-left px-3 py-2.5 font-semibold cursor-pointer hover:text-gray-700" onClick={() => sortBy('winback_score')} title="Win-back likelihood, 0–100">Score{arrow('winback_score')}</th>
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
              <tr><td colSpan={10} className="text-center text-gray-400 py-12">No cancellations logged yet.</td></tr>
            ) : sorted.map(r => {
              const oc = OUTCOMES.find(o => o.value === r.outcome)
              return (
                <tr key={r.id} className={`cursor-pointer ${r.likely_to_return ? 'bg-green-50 hover:bg-green-100' : 'hover:bg-gray-50'}`} onClick={() => setModal(r)}>
                  <td className="px-4 py-2.5 font-semibold text-gray-900">
                    {r.member_name}
                    {r.source === 'sail_import' && <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 align-middle">SAIL</span>}
                    {r.likely_to_return && <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 align-middle">LIKELY TO RETURN</span>}
                    {(r.phone || r.email) && (
                      <div className="flex items-center gap-2 mt-1" onClick={e => e.stopPropagation()}>
                        {r.phone && <a href={`tel:${r.phone}`} title={`Call ${r.phone}`} className="text-gray-400 hover:text-red-600"><Phone size={13} /></a>}
                        {r.phone && <a href={`sms:${r.phone}`} title={`Text ${r.phone}`} className="text-gray-400 hover:text-red-600"><MessageSquare size={13} /></a>}
                        {r.email && <a href={`mailto:${r.email}`} title={r.email} className="text-gray-400 hover:text-red-600"><Mail size={13} /></a>}
                      </div>
                    )}
                    {r.total_sessions != null && (
                      <div className="text-[11px] text-gray-400 font-normal mt-0.5">
                        <Dumbbell size={11} className="inline align-[-1px] mr-1 text-gray-400" />
                        {r.total_sessions} session{r.total_sessions === 1 ? '' : 's'}
                        {r.workouts_tried != null ? ` · ${r.workouts_tried}/12 workouts` : ''}
                        {r.last_booking_date ? ` · last ${fmtDate(r.last_booking_date)}` : ''}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    <ScorePill r={r} onClick={() => setScoreFor(r)} />
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
        <CancellationForm entry={modal || null} users={users} currentUserId={me} onSave={onSaved} onClose={() => { setModal(null); load() }} />
      )}
      {scoreFor && <ScoreBreakdown row={scoreFor} onClose={() => setScoreFor(null)} />}
    </div>
  )
}
