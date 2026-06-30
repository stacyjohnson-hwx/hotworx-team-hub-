import { useState, useEffect, useRef } from 'react'
import { CheckCircle, ExternalLink, AlertTriangle, Phone, MessageSquare, Sparkles, ClipboardCheck, Wrench, ShieldAlert, Loader2, GraduationCap, ShoppingCart, UserMinus } from 'lucide-react'
import { apiGet, apiPost } from '@/hooks/useApi'
import { useAuth } from '@/contexts/AuthContext'
import { REASONS as CANCEL_REASONS, OUTCOMES as CANCEL_OUTCOMES } from '@/pages/cancellations/CancellationsPage'

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

// ─── Maintenance & Escalations section ───────────────────────────────────────

const SAUNA_AREAS = [
  'Sauna 1','Sauna 2','Sauna 3','Sauna 4','Sauna 5',
  'Sauna 6','Sauna 7','Sauna 8','Sauna 9','Sauna 10',
  'Lobby','Restrooms','Break Room','HVAC','Plumbing',
  'Electrical','Exterior','TV / AV','Equipment - Other','General',
]

const ESC_TYPES = [
  { value: 'member_complaint', label: 'Member Complaint' },
  { value: 'safety_incident',  label: 'Safety Incident'  },
  { value: 'staff_issue',      label: 'Staff Issue'      },
  { value: 'operational',      label: 'Operational'      },
]

function isTodayLocal(iso) {
  if (!iso) return false
  return new Date(iso).toLocaleDateString('en-CA') === new Date().toLocaleDateString('en-CA')
}

const priColor = (p) =>
  p === 'urgent' ? 'bg-red-100 text-red-700' :
  p === 'high'   ? 'bg-orange-100 text-orange-700' :
  p === 'medium' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'

function MaintenanceEscalationsSection() {
  const [mItems, setMItems]   = useState([])
  const [eItems, setEItems]   = useState([])
  const [cItems, setCItems]   = useState([])   // today's cancellations
  const [loaded, setLoaded]   = useState(false)
  const [adding, setAdding]   = useState(null) // null | 'maintenance' | 'escalation' | 'cancellation'
  const [saving, setSaving]   = useState(false)
  const blankForm = { title:'', description:'', area:'', priority:'medium', type:'operational', member_name:'', cancel_reason:'', reason_notes:'', conversation_notes:'', outcome:'cancelled' }
  const [form, setForm]       = useState(blankForm)

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600'
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    Promise.all([
      apiGet('/api/maintenance').catch(() => []),
      apiGet('/api/escalations').catch(() => []),
      apiGet('/api/cancellations').catch(() => []),
    ]).then(([m, e, c]) => {
      setMItems((Array.isArray(m) ? m : []).filter(x => isTodayLocal(x.created_at)))
      setEItems((Array.isArray(e) ? e : []).filter(x => isTodayLocal(x.created_at)))
      setCItems((Array.isArray(c) ? c : []).filter(x => isTodayLocal(x.created_at)))
    }).finally(() => setLoaded(true))
  }, [])

  const handleQuickLog = async () => {
    if (adding === 'cancellation') {
      if (!form.member_name.trim() || !form.cancel_reason) return
      if (form.cancel_reason === 'other' && !form.reason_notes.trim()) return
    } else if (!form.title.trim()) return
    setSaving(true)
    try {
      if (adding === 'maintenance') {
        const created = await apiPost('/api/maintenance', {
          title: form.title, area: form.area || null,
          priority: form.priority, description: form.description || null,
        })
        setMItems(prev => [created, ...prev])
      } else if (adding === 'cancellation') {
        const created = await apiPost('/api/cancellations', {
          member_name: form.member_name, cancel_reason: form.cancel_reason,
          reason_notes: form.reason_notes || null, conversation_notes: form.conversation_notes || null, outcome: form.outcome,
        })
        setCItems(prev => [created, ...prev])
      } else {
        const created = await apiPost('/api/escalations', {
          type: form.type, title: form.title,
          description: form.description || form.title,
          member_name: (form.type === 'member_complaint' || form.type === 'safety_incident')
            ? form.member_name || null : null,
          priority: form.priority,
        })
        setEItems(prev => [created, ...prev])
      }
      setForm(blankForm)
      setAdding(null)
    } catch { } finally { setSaving(false) }
  }

  const totalToday = mItems.length + eItems.length + cItems.length

  return (
    <Section
      title="Maintenance & Escalations"
      badge={totalToday > 0
        ? <span className="text-xs bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded-full">{totalToday} logged today</span>
        : null}
    >
      {/* Today's maintenance items */}
      {mItems.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Maintenance Issues</p>
          {mItems.map(item => (
            <div key={item.id} className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
              <Wrench size={13} className="text-orange-500 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-gray-800 truncate">{item.title}</p>
                {item.area && <p className="text-xs text-gray-500">{item.area}</p>}
              </div>
              <span className={`flex-shrink-0 text-xs font-medium px-1.5 py-0.5 rounded-full capitalize ${priColor(item.priority)}`}>
                {item.priority}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Today's escalation items */}
      {eItems.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Escalations</p>
          {eItems.map(item => (
            <div key={item.id} className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <ShieldAlert size={13} className="text-red-500 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-gray-800 truncate">{item.title}</p>
                <p className="text-xs text-gray-500 capitalize">{(item.type || '').replace(/_/g, ' ')}</p>
              </div>
              <span className={`flex-shrink-0 text-xs font-medium px-1.5 py-0.5 rounded-full capitalize ${priColor(item.priority)}`}>
                {item.priority}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Today's cancellations */}
      {cItems.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Cancellations</p>
          {cItems.map(item => {
            const oc = CANCEL_OUTCOMES.find(o => o.value === item.outcome)
            return (
              <div key={item.id} className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <UserMinus size={13} className="text-red-500 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-800 truncate">{item.member_name}</p>
                  <p className="text-xs text-gray-500">{CANCEL_REASONS.find(r => r.value === item.cancel_reason)?.label}</p>
                </div>
                <span className={`flex-shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded-full border ${oc?.cls || ''}`}>{oc?.label || item.outcome}</span>
              </div>
            )
          })}
        </div>
      )}

      {totalToday === 0 && loaded && !adding && (
        <p className="text-xs text-gray-400 italic">Nothing logged yet today.</p>
      )}

      {/* Quick-add inline form */}
      {adding && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2.5">
          <p className="text-xs font-semibold text-gray-700">
            {adding === 'maintenance' ? 'Log Maintenance Issue' : adding === 'cancellation' ? 'Log Cancellation' : 'Log Escalation'}
          </p>

          {adding === 'cancellation' && (
            <>
              <input className={inp} placeholder="Member name" value={form.member_name} onChange={e => set('member_name', e.target.value)} />
              <select className={inp} value={form.cancel_reason} onChange={e => set('cancel_reason', e.target.value)}>
                <option value="">— Reason —</option>
                {CANCEL_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              {form.cancel_reason === 'other' && (
                <input className={inp} placeholder="What was the reason?" value={form.reason_notes} onChange={e => set('reason_notes', e.target.value)} />
              )}
              <select className={inp} value={form.outcome} onChange={e => set('outcome', e.target.value)}>
                {CANCEL_OUTCOMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <textarea className={`${inp} resize-none`} rows={3} placeholder="Conversation notes — what they said (context for the win-back call)"
                value={form.conversation_notes} onChange={e => set('conversation_notes', e.target.value)} />
              <p className="text-[11px] text-gray-400">Logs to the Cancellations module — add the save-flow details there later.</p>
            </>
          )}

          {adding === 'escalation' && (
            <select className={inp} value={form.type} onChange={e => set('type', e.target.value)}>
              {ESC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          )}

          {adding !== 'cancellation' && (
            <input className={inp}
              placeholder={adding === 'maintenance' ? 'e.g. Sauna 3 not heating' : 'Brief summary'}
              value={form.title} onChange={e => set('title', e.target.value)} />
          )}

          {adding === 'maintenance' && (
            <div className="grid grid-cols-2 gap-2">
              <select className={inp} value={form.area} onChange={e => set('area', e.target.value)}>
                <option value="">— Area —</option>
                {SAUNA_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <select className={inp} value={form.priority} onChange={e => set('priority', e.target.value)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          )}

          {adding === 'escalation' && (
            <>
              {(form.type === 'member_complaint' || form.type === 'safety_incident') && (
                <input className={inp} placeholder="Member name (if applicable)"
                  value={form.member_name} onChange={e => set('member_name', e.target.value)} />
              )}
              <textarea className={`${inp} resize-none`} rows={2}
                placeholder="Describe what happened…"
                value={form.description} onChange={e => set('description', e.target.value)} />
              <select className={inp} value={form.priority} onChange={e => set('priority', e.target.value)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setAdding(null); setForm(blankForm) }}
              className="px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="button" onClick={handleQuickLog}
              disabled={saving || (adding === 'cancellation' ? (!form.member_name.trim() || !form.cancel_reason) : !form.title.trim())}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5">
              {saving && <Loader2 size={12} className="animate-spin" />}
              Log {adding === 'maintenance' ? 'Issue' : adding === 'cancellation' ? 'Cancellation' : 'Escalation'}
            </button>
          </div>
        </div>
      )}

      {/* Add buttons */}
      {!adding && (
        <div className="flex gap-2 flex-wrap pt-1">
          <button type="button" onClick={() => setAdding('maintenance')}
            className="flex items-center gap-1.5 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5 hover:bg-orange-100 transition-colors">
            <Wrench size={12} /> Log Maintenance Issue
          </button>
          <button type="button" onClick={() => setAdding('escalation')}
            className="flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-100 transition-colors">
            <ShieldAlert size={12} /> Log Escalation
          </button>
          <button type="button" onClick={() => setAdding('cancellation')}
            className="flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-100 transition-colors">
            <UserMinus size={12} /> Log Cancellation
          </button>
        </div>
      )}
    </Section>
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

function ShiftAtAGlance({ missionTitles = [], onToggleMission, topTasks = [], onCompleteTask }) {
  const [cleaning, setCleaning]   = useState(null)
  const [loading,  setLoading]    = useState(true)

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    apiGet(`/api/cleaning/today?date=${today}`)
      .then(clean => setCleaning(clean))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const allTasks         = cleaning?.tasks || []
  const cleaningTasks    = allTasks.filter(t => t.task_type !== 'Operations')
  const operationsTasks  = allTasks.filter(t => t.task_type === 'Operations')

  const doneClean    = cleaningTasks.filter(t => t.completed)
  const pendingClean = cleaningTasks.filter(t => !t.completed)
  const doneOps      = operationsTasks.filter(t => t.completed)
  const pendingOps   = operationsTasks.filter(t => !t.completed)

  function TaskGroup({ tasks, done, pending, label, doneColor, doneIcon: DoneIcon }) {
    if (tasks.length === 0) return null
    return (
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
          <span>{label}</span>
          {done.length > 0 && (
            <span className={`${doneColor} text-[9px] font-bold px-1.5 py-0.5 rounded-full`}>
              {done.length}/{tasks.length} done
            </span>
          )}
        </p>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {done.map((task, i) => (
            <div key={task.id}
              className={`flex items-center gap-2.5 px-3 py-2 text-xs ${i < tasks.length - 1 ? 'border-b border-gray-100' : ''}`}>
              <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${label === 'Operations' ? 'bg-indigo-100' : 'bg-green-100'}`}>
                <ClipboardCheck size={10} className={label === 'Operations' ? 'text-indigo-600' : 'text-green-600'} />
              </div>
              <span className="text-gray-700 font-medium truncate">{task.title}</span>
              <span className="ml-auto text-gray-300 text-[10px] flex-shrink-0 capitalize">{task.frequency}</span>
            </div>
          ))}
          {pending.map((task, i) => (
            <div key={task.id}
              className={`flex items-center gap-2.5 px-3 py-2 text-xs ${done.length + i < tasks.length - 1 ? 'border-b border-gray-100' : ''}`}>
              <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                <div className="w-2 h-2 rounded-full bg-gray-300" />
              </div>
              <span className="text-gray-400 truncate">{task.title}</span>
              <span className="ml-auto text-gray-300 text-[10px] flex-shrink-0 capitalize">{task.frequency}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="bg-[#1A1A1A] px-4 py-3 flex items-center gap-2">
        <Sparkles size={14} className="text-[#E8611A]" />
        <h3 className="text-xs font-bold tracking-widest text-white uppercase">Shift at a Glance</h3>
        <span className="ml-auto text-[10px] text-white/40">Auto-populated</span>
      </div>

      <div className="bg-gray-50 p-4 space-y-4">
        {/* ── Marketing (tasks completed in My Tasks) ── */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Marketing</p>

          {/* Completed today — tap to remove */}
          {missionTitles.length > 0 && (
            <div className="space-y-1 mb-2">
              {missionTitles.map((title, i) => (
                <button key={i} type="button" onClick={() => onToggleMission?.(title)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-left bg-orange-50 border border-orange-200 text-orange-800 hover:bg-orange-100 transition-colors">
                  <span className="flex-shrink-0 w-4 h-4 rounded-full bg-orange-500 text-white flex items-center justify-center text-[10px]">✓</span>
                  <span className="font-medium flex-1">{title}</span>
                  <span className="text-orange-400 flex-shrink-0">tap to remove</span>
                </button>
              ))}
            </div>
          )}

          {/* Nudge — open tasks the staffer can log right here */}
          {topTasks.length > 0 && (
            <>
              {missionTitles.length === 0 && (
                <p className="text-xs text-gray-600 font-medium mb-2">Did you complete any marketing tasks today? Tap one to log it:</p>
              )}
              <div className="space-y-1">
                {topTasks.map(t => (
                  <button key={t.id} type="button" onClick={() => onCompleteTask?.(t)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-left bg-white border border-orange-200 text-orange-800 hover:bg-orange-50 transition-colors">
                    <span className="flex-shrink-0 w-4 h-4 rounded-full border-2 border-orange-400" />
                    <span className="font-medium flex-1">{t.title}</span>
                    {t.point_value ? <span className="text-orange-400 flex-shrink-0">+{t.point_value} pts</span> : null}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Nothing set up */}
          {missionTitles.length === 0 && topTasks.length === 0 && (
            <p className="text-xs text-gray-400 italic">No marketing tasks completed yet today. Finish tasks in <strong>Marketing Tasks → My Tasks</strong> and they'll appear here.</p>
          )}

          <a href="/leads?tab=marketing" className="inline-block mt-2 text-[11px] font-medium text-gray-500 hover:text-orange-600">See all marketing tasks →</a>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-[#E8611A] rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* ── Cleaning ── */}
            <TaskGroup
              tasks={cleaningTasks}
              done={doneClean}
              pending={pendingClean}
              label="Cleaning"
              doneColor="bg-green-100 text-green-700"
            />

            {/* ── Operations ── */}
            <TaskGroup
              tasks={operationsTasks}
              done={doneOps}
              pending={pendingOps}
              label="Operations"
              doneColor="bg-indigo-100 text-indigo-700"
            />

            {allTasks.length === 0 && (
              <p className="text-xs text-gray-400 italic">No tasks for today.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Completed Training (pulled from the Training module) ─────────────────────
function CompletedTrainingSection({ userId, onChange }) {
  const [items, setItems]   = useState([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    apiGet('/api/training').then(resources => {
      const mine = (Array.isArray(resources) ? resources : [])
        .map(r => {
          const c = (r.completions || []).find(c => c.user_id === userId && isTodayLocal(c.completed_at))
          return c ? { id: r.id, title: r.title, category: r.category } : null
        })
        .filter(Boolean)
      setItems(mine)
      onChange?.(mine.map(m => m.title))
    }).catch(() => {}).finally(() => setLoaded(true))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  return (
    <Section title="Training Completed" badge={items.length > 0 ? `${items.length}` : null}>
      {!loaded ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-gray-400">
          No training marked complete today. Finish a course in the <strong>Resources → Training</strong> section and it will appear here automatically.
        </p>
      ) : (
        <div className="space-y-1.5">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-2.5 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <GraduationCap size={14} className="text-green-600 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-800 flex-1 truncate">{item.title}</span>
              {item.category && <span className="text-[10px] text-gray-400 flex-shrink-0">{item.category}</span>}
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

// ─── Orders (structured entries — same pattern as Maintenance/Escalations) ────
const ORDER_CATEGORIES = [
  { value: 'supplies',  label: 'Supplies'  },
  { value: 'retail',    label: 'Retail'    },
  { value: 'equipment', label: 'Equipment' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'other',     label: 'Other'     },
]

function OrdersSection() {
  const [items, setItems] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const blank = { item_name: '', quantity: '1', category: 'supplies', notes: '' }
  const [form, setForm] = useState(blank)

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600'
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    apiGet('/api/orders').then(rows => {
      setItems((Array.isArray(rows) ? rows : []).filter(x => isTodayLocal(x.created_at)))
    }).catch(() => {}).finally(() => setLoaded(true))
  }, [])

  const handleAdd = async () => {
    if (!form.item_name.trim()) return
    setSaving(true)
    try {
      const created = await apiPost('/api/orders', {
        item_name: form.item_name.trim(),
        quantity: parseInt(form.quantity) || 1,
        category: form.category,
        notes: form.notes || null,
      })
      setItems(prev => [created, ...prev])
      setForm(blank)
      setAdding(false)
    } catch { } finally { setSaving(false) }
  }

  return (
    <Section
      title="Orders Needed"
      badge={items.length > 0
        ? <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full">{items.length} logged today</span>
        : null}
    >
      {items.length > 0 && (
        <div className="space-y-1.5">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              <ShoppingCart size={13} className="text-blue-500 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-gray-800 truncate">{item.item_name}</p>
                {item.notes && <p className="text-xs text-gray-500 truncate">{item.notes}</p>}
              </div>
              <span className="flex-shrink-0 text-xs text-gray-500">×{item.quantity}</span>
              <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">{item.category}</span>
            </div>
          ))}
        </div>
      )}

      {items.length === 0 && loaded && !adding && (
        <p className="text-xs text-gray-400 italic">No orders logged yet today.</p>
      )}

      {adding && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2.5">
          <p className="text-xs font-semibold text-gray-700">Log Order Item</p>
          <input className={inp} placeholder="e.g. Hot Exercise Gel 8oz"
            value={form.item_name} onChange={e => set('item_name', e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input className={inp} type="number" min="1" placeholder="Qty"
              value={form.quantity} onChange={e => set('quantity', e.target.value)} />
            <select className={inp} value={form.category} onChange={e => set('category', e.target.value)}>
              {ORDER_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <textarea className={`${inp} resize-none`} rows={2} placeholder="Notes (optional)"
            value={form.notes} onChange={e => set('notes', e.target.value)} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setAdding(false); setForm(blank) }}
              className="px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="button" onClick={handleAdd} disabled={saving || !form.item_name.trim()}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5">
              {saving && <Loader2 size={12} className="animate-spin" />}
              Add Order
            </button>
          </div>
        </div>
      )}

      {!adding && (
        <div className="pt-1">
          <button type="button" onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-100 transition-colors">
            <ShoppingCart size={12} /> Add Order Item
          </button>
        </div>
      )}
    </Section>
  )
}

const INITIAL_FORM = {
  shift_type: '',
  drawer_start: '', cash_collected: '', credit_collected: '', drawer_end: '',
  sweat_basic: '', sweat_elite: '', cancellations_count: '', cancellations_notes: '',
  retail_amount: '', sales_notes: '',
  phone_calls: '', sms_sent: '',
  general_notes: '', support_notes: '',
}

export default function EodForm({ submittedShifts, onSubmitted }) {
  const { profile, user } = useAuth()
  const [form, setForm] = useState(INITIAL_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  // Auto-read today's mission completions from Growth HQ (localStorage)
  const [missionTitles, setMissionTitles] = useState([])
  const [topTasks, setTopTasks] = useState([])
  // Training the user marked complete today (pulled from the Training module)
  const [completedTraining, setCompletedTraining] = useState([])

  // ── Save Progress (draft) ────────────────────────────────────────────────────
  // Notes/data are kept safe on this device throughout the day, restored on return,
  // and cleared once the shift is submitted.
  const draftKey = user?.id ? `eod_draft_${user.id}_${new Date().toLocaleDateString('en-CA')}` : null
  const [draftSaved, setDraftSaved] = useState(false)
  const [restored, setRestored] = useState(false)
  const draftLoaded = useRef(false)

  // Restore a saved draft once, on first load
  useEffect(() => {
    if (!draftKey || draftLoaded.current) return
    draftLoaded.current = true
    try {
      const raw = localStorage.getItem(draftKey)
      if (raw) {
        const d = JSON.parse(raw)
        if (d.form) setForm(f => ({ ...f, ...d.form }))
        if (Array.isArray(d.missionTitles)) setMissionTitles(d.missionTitles)
        if (Array.isArray(d.completedTraining)) setCompletedTraining(d.completedTraining)
        setRestored(true)
      }
    } catch {}
  }, [draftKey])

  // Auto-save as they type so notes are never lost even without clicking Save
  useEffect(() => {
    if (!draftKey || !draftLoaded.current) return
    try { localStorage.setItem(draftKey, JSON.stringify({ form, missionTitles, completedTraining, savedAt: Date.now() })) } catch {}
  }, [draftKey, form, missionTitles, completedTraining])

  const saveProgress = () => {
    if (!draftKey) return
    try {
      localStorage.setItem(draftKey, JSON.stringify({ form, missionTitles, completedTraining, savedAt: Date.now() }))
      setRestored(false); setDraftSaved(true)
      setTimeout(() => setDraftSaved(false), 2500)
    } catch {}
  }

  // Pull today's completed Marketing tasks (from "My Tasks") for the EOD summary,
  // plus the top open tasks so the team can be nudged to log any they did this
  // shift. Refreshes on mount and whenever the user returns to the tab.
  useEffect(() => {
    async function loadMarketing() {
      try {
        const [titles, tasks] = await Promise.all([
          apiGet('/api/marketing/my-completions').catch(() => []),
          apiGet('/api/marketing/tasks').catch(() => []),
        ])
        if (Array.isArray(titles)) setMissionTitles(titles)
        if (Array.isArray(tasks)) {
          const open = tasks
            .filter(t => !t.completed)
            .sort((a, b) => (b.point_value || 0) - (a.point_value || 0))
            .slice(0, 3)
          setTopTasks(open)
        }
      } catch {}
    }
    loadMarketing()
    function onVisible() { if (document.visibilityState === 'visible') loadMarketing() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])

  // Log an open marketing task straight from the EOD form: record the completion,
  // move it into today's completed list, and drop it from the nudge.
  async function completeMarketingTask(task) {
    try {
      await apiPost(`/api/marketing/tasks/${task.id}/complete`, {})
      setMissionTitles(prev => prev.includes(task.title) ? prev : [...prev, task.title])
      setTopTasks(prev => prev.filter(t => t.id !== task.id))
    } catch {}
  }

  function toggleMissionTitle(title) {
    setMissionTitles(prev =>
      prev.includes(title) ? prev.filter(t => t !== title) : [...prev, title]
    )
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
      // Completed Marketing tasks from "My Tasks" (already loaded into missionTitles)
      const finalMissions = missionTitles
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
        mission_titles: finalMissions,
        completed_training: completedTraining,
      }
      await apiPost('/api/eod', payload)
      if (draftKey) { try { localStorage.removeItem(draftKey) } catch {} }
      setSuccess(true)
      setMissionTitles([])
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

          {/* Training Completed — pulled from the Training module */}
          <CompletedTrainingSection userId={user?.id} onChange={setCompletedTraining} />

          {/* Outreach — editable: enter calls/texts directly */}
          <Section title="Outreach">
            <p className="text-xs text-gray-400 -mt-1">Enter the calls and texts you made this shift.</p>
            <div className="grid grid-cols-2 gap-3">
              <NumberInput label="Calls Made" value={form.phone_calls} onChange={v => set('phone_calls', v)} />
              <NumberInput label="Texts Sent" value={form.sms_sent} onChange={v => set('sms_sent', v)} />
            </div>
          </Section>

          {/* Shift at a Glance — includes Lead Generation, Cleaning, Operations */}
          <ShiftAtAGlance missionTitles={missionTitles} onToggleMission={toggleMissionTitle}
            topTasks={topTasks} onCompleteTask={completeMarketingTask} />

          {/* Maintenance & Escalations */}
          <MaintenanceEscalationsSection />

          {/* Orders — structured items (same pattern as Maintenance/Escalations) */}
          <OrdersSection />

          {/* Notes */}
          <Section title="Notes">
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

          {(draftSaved || restored) && (
            <p className={`text-xs text-center font-medium ${draftSaved ? 'text-green-600' : 'text-blue-600'}`}>
              {draftSaved ? '✓ Progress saved on this device' : '↩ Restored your saved progress from earlier today'}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={saveProgress}
              className="flex-1 bg-white text-gray-700 font-semibold py-3 rounded-xl border border-gray-300 hover:bg-gray-50 transition-colors text-sm">
              Save Progress
            </button>
            <button type="submit" disabled={saving}
              className="flex-[2] bg-red-600 text-white font-semibold py-3 rounded-xl hover:bg-red-600-hover transition-colors disabled:opacity-60 text-sm">
              {saving ? 'Submitting…' : `Submit ${form.shift_type === 'mid' ? 'Mid' : 'Closing'} Shift EOD`}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 text-center">Save Progress keeps your notes on this device — Submit sends the report &amp; email.</p>
        </>
      )}
    </form>
  )
}
