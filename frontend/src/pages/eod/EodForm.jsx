import { useState, useEffect } from 'react'
import { CheckCircle, ExternalLink, AlertTriangle, Phone, MessageSquare, Sparkles, ClipboardCheck } from 'lucide-react'
import { apiPost, apiGet } from '@/hooks/useApi'

const VARIANCE_THRESHOLD = 5

function calcVariance(form) {
  const start = parseFloat(form.drawer_start) || 0
  const cash  = parseFloat(form.cash_collected) || 0
  const end   = parseFloat(form.drawer_end) || 0
  return end - start - cash
}

function MoneyInput({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
        <input
          type="number" min="0" step="0.01" value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600"
        />
      </div>
    </div>
  )
}

function NumberInput({ label, value, onChange, goal }) {
  const num = parseInt(value) || 0
  const hitGoal = goal && num >= goal
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label}
        {goal && <span className="ml-1 text-gray-400 font-normal">Goal: {goal}</span>}
      </label>
      <input
        type="number" min="0" value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600 ${hitGoal ? 'border-green-400 bg-green-50' : 'border-gray-300'}`}
      />
    </div>
  )
}

function Section({ title, children, badge }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</h3>
        {badge}
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  )
}

function CheckRow({ label, checked, onChange, href }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-600/40 flex-shrink-0"
      />
      <span className="text-sm text-gray-700 flex-1 leading-snug">{label}</span>
      {href && (
        <a href={href} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
          className="text-gray-400 hover:text-red-600 flex-shrink-0 mt-0.5" title="Open link">
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </label>
  )
}

// ─── Shift at a Glance ────────────────────────────────────────────────────────

function StatPill({ label, value, icon: Icon, color }) {
  return (
    <div className={`flex items-center gap-2 bg-white rounded-xl border px-3 py-2.5 ${color}`}>
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${color.replace('border-', 'bg-').replace('-200', '-100')}`}>
        <Icon size={14} className={color.replace('border-', 'text-').replace('-200', '-600')} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide leading-none mb-0.5">{label}</p>
        <p className="text-base font-bold text-gray-900 leading-none">{value}</p>
      </div>
    </div>
  )
}

function ShiftAtAGlance() {
  const [outreach, setOutreach]   = useState(null)
  const [cleaning, setCleaning]   = useState(null)
  const [loading,  setLoading]    = useState(true)

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    Promise.all([
      apiGet(`/api/outreach/logs/summary?date=${today}`),
      apiGet(`/api/cleaning/today?date=${today}`),
    ])
      .then(([out, clean]) => { setOutreach(out); setCleaning(clean) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const totalCalls  = outreach?.totalCalls  || 0
  const totalTexts  = outreach?.totalTexts  || 0
  const activeTiles = (outreach?.byTile || []).filter(t => (t.calls_made || 0) + (t.texts_made || 0) > 0)
  const allTasks    = cleaning?.tasks || []
  const doneTasks   = allTasks.filter(t => t.completed)
  const pendingTasks = allTasks.filter(t => !t.completed)

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="bg-[#1A1A1A] px-4 py-3 flex items-center gap-2">
        <Sparkles size={14} className="text-[#E8611A]" />
        <h3 className="text-xs font-bold tracking-widest text-white uppercase">Shift at a Glance</h3>
        <span className="ml-auto text-[10px] text-white/40">Auto-populated · read only</span>
      </div>

      <div className="bg-gray-50 p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-[#E8611A] rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* ── Outreach ── */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Outreach</p>
              {totalCalls === 0 && totalTexts === 0 ? (
                <p className="text-xs text-gray-400 italic">No outreach logged today yet.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <StatPill label="Calls Made"  value={totalCalls} icon={Phone}          color="border-blue-200" />
                    <StatPill label="Texts Sent"  value={totalTexts} icon={MessageSquare}  color="border-violet-200" />
                  </div>
                  {activeTiles.length > 0 && (
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      {activeTiles.map((tile, i) => (
                        <div key={tile.tile_id || i}
                          className={`flex items-center justify-between px-3 py-2 text-xs ${i < activeTiles.length - 1 ? 'border-b border-gray-100' : ''}`}>
                          <span className="font-medium text-gray-700 truncate pr-2">{tile.outreach_tiles?.title || 'Outreach Tile'}</span>
                          <span className="text-gray-400 flex-shrink-0">
                            {tile.calls_made > 0 && <span className="text-blue-600 font-semibold">{tile.calls_made}c</span>}
                            {tile.calls_made > 0 && tile.texts_made > 0 && <span className="text-gray-300 mx-1">·</span>}
                            {tile.texts_made > 0 && <span className="text-violet-600 font-semibold">{tile.texts_made}t</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── Cleaning ── */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <span>Cleaning</span>
                {doneTasks.length > 0 && (
                  <span className="bg-green-100 text-green-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                    {doneTasks.length}/{allTasks.length} done
                  </span>
                )}
              </p>
              {allTasks.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No cleaning tasks for today.</p>
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  {doneTasks.map((task, i) => (
                    <div key={task.id}
                      className={`flex items-center gap-2.5 px-3 py-2 text-xs ${i < allTasks.length - 1 ? 'border-b border-gray-100' : ''}`}>
                      <div className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                        <ClipboardCheck size={10} className="text-green-600" />
                      </div>
                      <span className="text-gray-700 font-medium truncate">{task.title}</span>
                      <span className="ml-auto text-gray-300 text-[10px] flex-shrink-0 capitalize">{task.frequency}</span>
                    </div>
                  ))}
                  {pendingTasks.map((task, i) => (
                    <div key={task.id}
                      className={`flex items-center gap-2.5 px-3 py-2 text-xs ${doneTasks.length + i < allTasks.length - 1 ? 'border-b border-gray-100' : ''}`}>
                      <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <div className="w-2 h-2 rounded-full bg-gray-300" />
                      </div>
                      <span className="text-gray-400 truncate">{task.title}</span>
                      <span className="ml-auto text-gray-300 text-[10px] flex-shrink-0 capitalize">{task.frequency}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const INITIAL_FORM = {
  shift_type: '',
  drawer_start: '', cash_collected: '', credit_collected: '', drawer_end: '',
  sweat_basic: '', sweat_elite: '', cancellations_count: '', cancellations_notes: '',
  retail_amount: '', sales_notes: '',
  watched_training_video: false, used_sales_gpt: false, role_played_script: false,
  orders_needed: '', general_notes: '', support_notes: '',
}

export default function EodForm({ submittedShifts, onSubmitted }) {
  const [form, setForm] = useState(INITIAL_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [missions, setMissions] = useState([])
  const [checkedMissions, setCheckedMissions] = useState(new Set())

  useEffect(() => {
    apiGet('/api/missions').then(setMissions).catch(() => {})
  }, [])

  function toggleMission(id) {
    setCheckedMissions(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const variance = calcVariance(form)
  const hasVarianceAlert = form.drawer_end !== '' && Math.abs(variance) > VARIANCE_THRESHOLD

  const alreadySubmitted = submittedShifts.map(s => s.shift_type)
  const availableShifts = ['mid', 'closing'].filter(s => !alreadySubmitted.includes(s))

  async function submit(e) {
    e.preventDefault()
    if (!form.shift_type) return setError('Please select a shift type.')
    setSaving(true)
    setError(null)
    try {
      const payload = {
        ...form,
        drawer_start: parseFloat(form.drawer_start) || 0,
        cash_collected: parseFloat(form.cash_collected) || 0,
        credit_collected: parseFloat(form.credit_collected) || 0,
        drawer_end: parseFloat(form.drawer_end) || 0,
        sweat_basic: parseInt(form.sweat_basic) || 0,
        sweat_elite: parseInt(form.sweat_elite) || 0,
        cancellations_count: parseInt(form.cancellations_count) || 0,
        retail_amount: parseFloat(form.retail_amount) || 0,
        phone_calls: parseInt(form.phone_calls) || 0,
        sms_sent: parseInt(form.sms_sent) || 0,
        red_appt_scheduled: parseInt(form.red_appt_scheduled) || 0,
        mission_ids: [...checkedMissions],
      }
      await apiPost('/api/eod', payload)
      setSuccess(true)
      setCheckedMissions(new Set())
      onSubmitted()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
          <CheckCircle className="w-9 h-9 text-green-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Shift submitted!</h2>
        <p className="text-gray-500 text-sm">
          {form.shift_type === 'closing'
            ? 'The EOD email digest has been sent to the owner and manager.'
            : 'Your EOD report has been recorded.'}
        </p>
        <button onClick={() => { setSuccess(false); setForm(INITIAL_FORM) }}
          className="mt-6 text-sm text-red-600 hover:underline">
          Submit another shift
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>
      )}

      {/* Shift type */}
      <Section title="Shift Info">
        {availableShifts.length === 0 ? (
          <p className="text-sm text-gray-500">All shifts have been submitted for today.</p>
        ) : (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Shift Type *</label>
            <div className="flex gap-2">
              {availableShifts.map(type => (
                <button key={type} type="button" onClick={() => set('shift_type', type)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border capitalize transition-colors ${
                    form.shift_type === type
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                  }`}>
                  {type}
                </button>
              ))}
            </div>
            {alreadySubmitted.length > 0 && (
              <p className="text-xs text-gray-400 mt-2">Already submitted: {alreadySubmitted.join(', ')}</p>
            )}
          </div>
        )}
      </Section>

      {form.shift_type && availableShifts.length > 0 && (
        <>
          {/* Drawer */}
          <Section title="Drawer Count">
            <div className="grid grid-cols-2 gap-3">
              <MoneyInput label="Starting Drawer" value={form.drawer_start} onChange={v => set('drawer_start', v)} />
              <MoneyInput label="Cash Collected" value={form.cash_collected} onChange={v => set('cash_collected', v)} />
              <MoneyInput label="Credit / Check Collected" value={form.credit_collected} onChange={v => set('credit_collected', v)} />
              <MoneyInput label="Ending Drawer (counted)" value={form.drawer_end} onChange={v => set('drawer_end', v)} />
            </div>
            {form.drawer_end !== '' && (
              <div className={`flex items-center gap-2 p-3 rounded-lg text-sm font-medium ${hasVarianceAlert ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                {hasVarianceAlert && <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
                Variance: {variance >= 0 ? '+' : ''}${variance.toFixed(2)}
                {hasVarianceAlert ? ' — over threshold, double-check your count.' : ' ✓'}
              </div>
            )}
          </Section>

          {/* Sales */}
          <Section title="Sales">
            <div className="grid grid-cols-3 gap-3">
              <NumberInput label="Sweat Basic" value={form.sweat_basic} onChange={v => set('sweat_basic', v)} />
              <NumberInput label="Sweat Elite" value={form.sweat_elite} onChange={v => set('sweat_elite', v)} />
              <NumberInput label="Cancellations" value={form.cancellations_count} onChange={v => set('cancellations_count', v)} />
            </div>
            {(parseInt(form.cancellations_count) > 0) && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Cancellation names / reasons</label>
                <textarea rows={2} value={form.cancellations_notes} onChange={e => set('cancellations_notes', e.target.value)}
                  placeholder="Who cancelled and why?"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600 resize-none" />
              </div>
            )}
            <MoneyInput label="Retail Sales" value={form.retail_amount} onChange={v => set('retail_amount', v)} />
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea rows={2} value={form.sales_notes} onChange={e => set('sales_notes', e.target.value)}
                placeholder="Any sales context?"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600 resize-none" />
            </div>
          </Section>

          {/* Sales Training */}
          <Section title="Sales Training">
            <CheckRow label="Watched sales training video" checked={form.watched_training_video} onChange={v => set('watched_training_video', v)} href={import.meta.env.VITE_SALES_VIDEO_URL} />
            <CheckRow label="Role played / practiced script" checked={form.role_played_script} onChange={v => set('role_played_script', v)} />
            <CheckRow label="Practiced with Sales GPT" checked={form.used_sales_gpt} onChange={v => set('used_sales_gpt', v)} href={import.meta.env.VITE_SALES_GPT_URL} />
          </Section>

          {/* Missions (Growth HQ) */}
          {missions.length > 0 && (
            <Section title="Missions Completed" badge={checkedMissions.size > 0 ? `${checkedMissions.size}` : null}>
              <p className="text-xs text-gray-400 -mt-1 mb-2">Check off the Growth HQ missions you completed this shift.</p>
              <div className="space-y-1">
                {missions.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMission(m.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-colors border ${
                      checkedMissions.has(m.id)
                        ? 'bg-orange-50 border-orange-200 text-orange-800'
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs transition-colors ${
                      checkedMissions.has(m.id)
                        ? 'border-orange-500 bg-orange-500 text-white'
                        : 'border-gray-300'
                    }`}>
                      {checkedMissions.has(m.id) && '✓'}
                    </span>
                    <span className={checkedMissions.has(m.id) ? 'font-medium' : ''}>{m.title}</span>
                  </button>
                ))}
              </div>
            </Section>
          )}

          {/* Shift at a Glance */}
          <ShiftAtAGlance />

          {/* Orders & Notes */}
          <Section title="Orders & Notes">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Items to Order <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea rows={2} value={form.orders_needed} onChange={e => set('orders_needed', e.target.value)}
                placeholder="List anything that needs to be ordered or restocked…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600 resize-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">General Notes <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea rows={3} value={form.general_notes} onChange={e => set('general_notes', e.target.value)}
                placeholder="Anything the manager or owner should know…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600 resize-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">How can we better support you in achieving your goals? <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea rows={3} value={form.support_notes} onChange={e => set('support_notes', e.target.value)}
                placeholder="Resources, coaching, tools, or anything else that would help…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600 resize-none" />
            </div>
          </Section>

          <button type="submit" disabled={saving}
            className="w-full bg-red-600 text-white font-semibold py-3 rounded-xl hover:bg-red-600-hover transition-colors disabled:opacity-60 text-sm">
            {saving ? 'Submitting…' : `Submit ${form.shift_type === 'mid' ? 'Mid' : 'Closing'} Shift EOD`}
          </button>
        </>
      )}
    </form>
  )
}
