import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost } from '@/hooks/useApi'
import { CheckCircle2, Circle, Loader2, Camera, Megaphone, ChevronDown, ChevronUp } from 'lucide-react'

const CATEGORY_STYLE = {
  content:    { label: 'Content',    cls: 'bg-purple-100 text-purple-700' },
  engagement: { label: 'Engagement', cls: 'bg-blue-100 text-blue-700' },
  social:     { label: 'Social',     cls: 'bg-pink-100 text-pink-700' },
  community:  { label: 'Community',   cls: 'bg-green-100 text-green-700' },
  retention:  { label: 'Retention',  cls: 'bg-amber-100 text-amber-700' },
}

// ─── One task card ────────────────────────────────────────────────────────────
function TaskCard({ task, onCompleted }) {
  const [open, setOpen]     = useState(false)
  const [vals, setVals]     = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const done = task.completed
  const cat = CATEGORY_STYLE[task.category] || CATEGORY_STYLE.content
  const fields = Array.isArray(task.required_fields) ? task.required_fields : []

  const setV = (k, v) => setVals(s => ({ ...s, [k]: v }))

  const complete = async () => {
    // Validate required text fields
    for (const f of fields) {
      if (f.required && !(vals[f.key] || '').trim()) { setError(`Please fill in “${f.label}”`); return }
    }
    setSaving(true); setError('')
    try {
      await apiPost(`/api/marketing/tasks/${task.id}/complete`, { field_values: vals })
      onCompleted(task.id)
    } catch (e) { setError(e.message); setSaving(false) }
  }

  return (
    <div className={`bg-white border rounded-xl overflow-hidden transition-all ${done ? 'border-green-200 opacity-75' : 'border-gray-200'}`}>
      <button onClick={() => !done && setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left">
        {done ? <CheckCircle2 size={20} className="text-green-500 flex-shrink-0" />
              : <Circle size={20} className="text-gray-300 flex-shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${done ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${cat.cls}`}>{cat.label}</span>
            {task.required_uploads > 0 && (
              <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><Camera size={10} /> {task.required_uploads}</span>
            )}
            <span className="text-[10px] text-gray-400 capitalize">· {task.cadence}</span>
          </div>
        </div>
        <span className="text-xs font-bold text-[#E8611A] flex-shrink-0">+{task.point_value} pts</span>
        {!done && (open ? <ChevronUp size={15} className="text-gray-300" /> : <ChevronDown size={15} className="text-gray-300" />)}
      </button>

      {open && !done && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-gray-100">
          {task.description && <p className="text-xs text-gray-500 leading-relaxed">{task.description}</p>}
          {fields.map(f => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {f.label}{f.required && <span className="text-red-500"> *</span>}
              </label>
              {f.key === 'quote' || f.key === 'idea'
                ? <textarea rows={2} value={vals[f.key] || ''} onChange={e => setV(f.key, e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#E8611A]/30 focus:border-[#E8611A]" />
                : <input value={vals[f.key] || ''} onChange={e => setV(f.key, e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8611A]/30 focus:border-[#E8611A]" />}
            </div>
          ))}
          {task.required_uploads > 0 && (
            <p className="text-[11px] text-gray-400 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
              📷 This task asks for {task.required_uploads} photo/video — inline upload arrives in the next update. For now, mark it complete after you've captured it.
            </p>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button onClick={complete} disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#E8611A] hover:bg-orange-600 text-white text-sm font-bold rounded-lg disabled:opacity-50">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Mark Complete
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Marketing Hub (Phase 1: My Tasks) ────────────────────────────────────────
export default function MarketingHub() {
  const [tasks, setTasks]   = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setTasks(await apiGet('/api/marketing/tasks')) }
    catch {} finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const onCompleted = (id) => {
    const t = tasks.find(x => x.id === id)
    setTasks(prev => prev.map(x => x.id === id ? { ...x, completed: true } : x))
    if (t) { setToast(`Task complete! +${t.point_value} pts`); setTimeout(() => setToast(null), 2200) }
  }

  const todo = tasks.filter(t => !t.completed)
  const done = tasks.filter(t => t.completed)

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1A1A1A] text-white text-sm font-semibold px-5 py-2.5 rounded-full shadow-lg flex items-center gap-2">
          <CheckCircle2 size={16} className="text-green-400" /> {toast}
        </div>
      )}

      <div className="flex items-center gap-2 mb-1">
        <Megaphone size={18} className="text-[#E8611A]" />
        <h2 className="text-base font-bold text-gray-900">My Marketing Tasks</h2>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Complete these during your shift. {todo.length} to do{done.length > 0 ? ` · ${done.length} done today` : ''}.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 size={22} className="animate-spin text-gray-300" /></div>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">No marketing tasks set up yet.</p>
      ) : (
        <div className="space-y-2">
          {todo.map(t => <TaskCard key={t.id} task={t} onCompleted={onCompleted} />)}
          {done.length > 0 && (
            <>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider pt-3">Completed</p>
              {done.map(t => <TaskCard key={t.id} task={t} onCompleted={onCompleted} />)}
            </>
          )}
        </div>
      )}
    </div>
  )
}
