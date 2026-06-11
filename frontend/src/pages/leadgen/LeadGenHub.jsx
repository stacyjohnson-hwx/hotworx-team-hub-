import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import { useRole } from '@/hooks/useRole'
import OutreachTab from '@/pages/leads/OutreachTab'
import {
  CheckCircle2, Circle, Loader2, ChevronDown, ChevronUp, Sprout, ListTodo,
  Library, Lightbulb, Phone, Power, Plus, Pencil, Trash2, X, Check, ArrowUpCircle,
  Home, Building2, Users, Calendar, Globe, Target,
} from 'lucide-react'

const CATS = {
  neighborhood: { label: 'Neighborhood', icon: Home,      cls: 'bg-green-100 text-green-700' },
  b2b:          { label: 'B2B',          icon: Building2,  cls: 'bg-blue-100 text-blue-700' },
  referral:     { label: 'Referral',     icon: Users,      cls: 'bg-purple-100 text-purple-700' },
  events:       { label: 'Events',       icon: Calendar,   cls: 'bg-amber-100 text-amber-700' },
  digital:      { label: 'Digital',      icon: Globe,      cls: 'bg-cyan-100 text-cyan-700' },
  in_studio:    { label: 'In-Studio',    icon: Target,     cls: 'bg-orange-100 text-orange-700' },
}
const CAT_KEYS = Object.keys(CATS)
const CADENCES = [{ v: 'daily', l: 'Daily' }, { v: 'weekly', l: 'Weekly' }, { v: 'one_off', l: 'One-off' }]
const ROLE_TARGETS = [{ v: 'all', l: 'Everyone' }, { v: 'manager', l: 'Managers' }, { v: 'tsa', l: 'TSAs' }]

// ─── My Lead Gen: active plays as tasks ───────────────────────────────────────
function PlayTaskCard({ play, onCompleted }) {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const done = play.completed
  const cat = CATS[play.category] || CATS.in_studio

  const complete = async () => {
    setSaving(true)
    try { await apiPost(`/api/leadgen/plays/${play.id}/complete`, { notes }); onCompleted(play.id) }
    catch { setSaving(false) }
  }
  return (
    <div className={`bg-white border rounded-xl overflow-hidden ${done ? 'border-green-200 opacity-75' : 'border-gray-200'}`}>
      <button onClick={() => !done && setOpen(o => !o)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        {done ? <CheckCircle2 size={20} className="text-green-500 flex-shrink-0" /> : <Circle size={20} className="text-gray-300 flex-shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${done ? 'line-through text-gray-400' : 'text-gray-900'}`}>{play.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${cat.cls}`}>{cat.label}</span>
            <span className="text-[10px] text-gray-400 capitalize">· {play.cadence.replace('_', '-')}</span>
          </div>
        </div>
        <span className="text-xs font-bold text-[#E8611A] flex-shrink-0">+{play.point_value} pts</span>
        {!done && (open ? <ChevronUp size={15} className="text-gray-300" /> : <ChevronDown size={15} className="text-gray-300" />)}
      </button>
      {open && !done && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-gray-100">
          {play.description && <p className="text-xs text-gray-500 leading-relaxed">{play.description}</p>}
          {play.steps && <div className="bg-gray-50 rounded-lg p-3"><p className="text-[11px] text-gray-600 whitespace-pre-line leading-relaxed">{play.steps}</p></div>}
          <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional) — who, where, result…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#E8611A]/30 focus:border-[#E8611A]" />
          <button onClick={complete} disabled={saving} className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#E8611A] hover:bg-orange-600 text-white text-sm font-bold rounded-lg disabled:opacity-50">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Mark Complete
          </button>
        </div>
      )}
    </div>
  )
}

function MyLeadGen() {
  const [plays, setPlays] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const load = useCallback(async () => {
    setLoading(true)
    try { setPlays(await apiGet('/api/leadgen/tasks')) } catch {} finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  const onCompleted = (id) => {
    const p = plays.find(x => x.id === id)
    setPlays(prev => prev.map(x => x.id === id ? { ...x, completed: true } : x))
    if (p) { setToast(`Nice! +${p.point_value} pts`); setTimeout(() => setToast(null), 2200) }
  }
  const todo = plays.filter(p => !p.completed), done = plays.filter(p => p.completed)
  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 size={22} className="animate-spin text-gray-300" /></div>
  return (
    <div>
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1A1A1A] text-white text-sm font-semibold px-5 py-2.5 rounded-full shadow-lg flex items-center gap-2"><CheckCircle2 size={16} className="text-green-400" /> {toast}</div>}
      <p className="text-xs text-gray-500 mb-4">Your active lead-gen plays for this shift. {todo.length} to do{done.length > 0 ? ` · ${done.length} done` : ''}.</p>
      {plays.length === 0 ? <div className="text-center py-12 text-gray-400"><Sprout size={26} className="mx-auto mb-2 opacity-30" /><p className="text-sm">No active plays yet — your manager will activate some from the Idea Bank.</p></div>
        : <div className="space-y-2">
            {todo.map(p => <PlayTaskCard key={p.id} play={p} onCompleted={onCompleted} />)}
            {done.length > 0 && <><p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider pt-3">Completed</p>{done.map(p => <PlayTaskCard key={p.id} play={p} onCompleted={onCompleted} />)}</>}
          </div>}
    </div>
  )
}

// ─── Idea Bank (Play Library) — manager ───────────────────────────────────────
function PlayEditModal({ play, onSaved, onClose }) {
  const [f, setF] = useState({
    title: play?.title || '', description: play?.description || '', steps: play?.steps || '',
    category: play?.category || 'in_studio', point_value: play?.point_value ?? 20,
    cadence: play?.cadence || 'weekly', role_target: play?.role_target || 'all', active: play?.active ?? false,
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8611A]/30 focus:border-[#E8611A]'
  const save = async () => {
    if (!f.title.trim()) return
    setSaving(true)
    try { const saved = play?.id ? await apiPut(`/api/leadgen/plays/${play.id}`, f) : await apiPost('/api/leadgen/plays', f); onSaved(saved) }
    catch { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-gray-900">{play ? 'Edit play' : 'New play'}</h2>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Title *</label><input className={inp} value={f.title} onChange={e => set('title', e.target.value)} autoFocus /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Description</label><textarea rows={2} className={`${inp} resize-none`} value={f.description} onChange={e => set('description', e.target.value)} /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Steps (one per line)</label><textarea rows={4} className={`${inp} resize-none`} value={f.steps} onChange={e => set('steps', e.target.value)} placeholder={'1. …\n2. …'} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Category</label><select className={inp} value={f.category} onChange={e => set('category', e.target.value)}>{CAT_KEYS.map(c => <option key={c} value={c}>{CATS[c].label}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Cadence</label><select className={inp} value={f.cadence} onChange={e => set('cadence', e.target.value)}>{CADENCES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">For</label><select className={inp} value={f.role_target} onChange={e => set('role_target', e.target.value)}>{ROLE_TARGETS.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Points</label><input type="number" className={inp} value={f.point_value} onChange={e => set('point_value', e.target.value)} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={f.active} onChange={e => set('active', e.target.checked)} /> Active now (TSAs see it as a task)</label>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50 sticky bottom-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 font-medium">Cancel</button>
          <button onClick={save} disabled={saving || !f.title.trim()} className="px-5 py-2 bg-[#E8611A] hover:bg-orange-600 text-white text-sm font-bold rounded-lg disabled:opacity-50 flex items-center gap-2">{saving && <Loader2 size={14} className="animate-spin" />} {play ? 'Save' : 'Add play'}</button>
        </div>
      </div>
    </div>
  )
}

function IdeaBank() {
  const [plays, setPlays] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const load = useCallback(async () => {
    setLoading(true)
    try { setPlays(await apiGet('/api/leadgen/plays')) } catch {} finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  const onSaved = () => { setModal(null); load() }
  const toggle = async (p) => { const u = await apiPut(`/api/leadgen/plays/${p.id}`, { active: !p.active }); setPlays(prev => prev.map(x => x.id === p.id ? u : x)) }
  const del = async (id) => { if (!confirm('Remove this play from the bank?')) return; await apiDelete(`/api/leadgen/plays/${id}`); setPlays(prev => prev.filter(p => p.id !== id)) }
  const activeCount = plays.filter(p => p.active).length
  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 size={22} className="animate-spin text-gray-300" /></div>
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500">{activeCount} active · {plays.length - activeCount} in the bank. Toggle <Power size={11} className="inline" /> to activate a play for your TSAs.</p>
        <button onClick={() => setModal(false)} className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#E8611A] rounded-lg px-3 py-1.5 hover:bg-orange-600"><Plus size={13} /> New play</button>
      </div>
      <div className="space-y-2">
        {plays.map(p => {
          const cat = CATS[p.category] || CATS.in_studio
          return (
            <div key={p.id} className={`bg-white border rounded-xl px-4 py-3 flex items-center gap-3 ${p.active ? 'border-green-200' : 'border-gray-200'}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate flex items-center gap-2">{p.title}{p.active && <span className="text-[9px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">ACTIVE</span>}</p>
                <p className="text-[10px] text-gray-400"><span className={`px-1.5 py-0.5 rounded-full ${cat.cls}`}>{cat.label}</span> · {p.cadence.replace('_', '-')} · {ROLE_TARGETS.find(r => r.v === p.role_target)?.l || p.role_target}</p>
              </div>
              <span className="text-xs font-bold text-[#E8611A] flex-shrink-0">+{p.point_value}</span>
              <button onClick={() => toggle(p)} className={`p-1.5 ${p.active ? 'text-green-500 hover:text-gray-400' : 'text-gray-300 hover:text-green-500'}`} title={p.active ? 'Deactivate' : 'Activate'}><Power size={15} /></button>
              <button onClick={() => setModal(p)} className="p-1.5 text-gray-400 hover:text-gray-700" title="Edit"><Pencil size={13} /></button>
              <button onClick={() => del(p.id)} className="p-1.5 text-gray-400 hover:text-red-500" title="Remove"><Trash2 size={13} /></button>
            </div>
          )
        })}
      </div>
      {modal !== null && <PlayEditModal play={modal || null} onSaved={onSaved} onClose={() => setModal(null)} />}
    </div>
  )
}

// ─── Suggestion board ─────────────────────────────────────────────────────────
const SUGG_STATUS = {
  pending:   { label: 'New',       cls: 'bg-gray-100 text-gray-600' },
  reviewed:  { label: 'Reviewed',  cls: 'bg-blue-100 text-blue-700' },
  promoted:  { label: 'In Bank',   cls: 'bg-green-100 text-green-700' },
  dismissed: { label: 'Dismissed', cls: 'bg-gray-100 text-gray-400' },
}
function Suggestions() {
  const { isOwnerOrManager, userId } = useRole()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ text: '', category: 'in_studio' })
  const [saving, setSaving] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await apiGet('/api/leadgen/suggestions')) } catch {} finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8611A]/30 focus:border-[#E8611A]'
  const submit = async () => {
    if (!form.text.trim()) return
    setSaving(true)
    try { const c = await apiPost('/api/leadgen/suggestions', form); setItems(prev => [{ ...c, staff_name: 'You' }, ...prev]); setForm({ text: '', category: 'in_studio' }) }
    catch {} finally { setSaving(false) }
  }
  const setStatus = async (id, status) => { const u = await apiPut(`/api/leadgen/suggestions/${id}`, { status }); setItems(prev => prev.map(i => i.id === id ? { ...i, ...u } : i)) }
  const promote = async (id) => { await apiPost(`/api/leadgen/suggestions/${id}/promote`, {}); setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'promoted' } : i)) }
  const del = async (id) => { await apiDelete(`/api/leadgen/suggestions/${id}`); setItems(prev => prev.filter(i => i.id !== id)) }
  return (
    <div>
      <div className="bg-white border border-gray-200 rounded-xl p-3 mb-4 space-y-2">
        <textarea rows={2} className={`${inp} resize-none`} placeholder="Suggest a new lead-gen tactic the studio should try…" value={form.text} onChange={e => setForm(f => ({ ...f, text: e.target.value }))} />
        <div className="flex gap-2">
          <select className={`${inp} w-auto`} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>{CAT_KEYS.map(c => <option key={c} value={c}>{CATS[c].label}</option>)}</select>
          <button onClick={submit} disabled={saving || !form.text.trim()} className="ml-auto px-4 py-2 bg-[#E8611A] hover:bg-orange-600 text-white text-sm font-bold rounded-lg disabled:opacity-50 flex items-center gap-1.5">{saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Submit</button>
        </div>
      </div>
      {loading ? <div className="flex items-center justify-center py-10"><Loader2 size={22} className="animate-spin text-gray-300" /></div>
        : items.length === 0 ? <div className="text-center py-10 text-gray-400"><Lightbulb size={26} className="mx-auto mb-2 opacity-30" /><p className="text-sm">No suggestions yet — drop the first idea.</p></div>
        : <div className="space-y-2">
            {items.map(i => {
              const st = SUGG_STATUS[i.status] || SUGG_STATUS.pending
              const cat = CATS[i.category] || CATS.in_studio
              const canDelete = isOwnerOrManager || i.staff_id === userId
              return (
                <div key={i.id} className={`bg-white border border-gray-200 rounded-xl p-3 ${i.status === 'dismissed' ? 'opacity-60' : ''}`}>
                  <div className="flex items-start gap-2">
                    <Lightbulb size={15} className="text-[#E8611A] flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-800 leading-snug">{i.text}</p>
                      <div className="flex items-center gap-2 mt-1"><span className={`text-[10px] px-1.5 py-0.5 rounded-full ${cat.cls}`}>{cat.label}</span><span className="text-[10px] text-gray-300">· {i.staff_name}</span></div>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${st.cls}`}>{st.label}</span>
                  </div>
                  {(isOwnerOrManager || canDelete) && (
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-50">
                      {isOwnerOrManager && i.status !== 'promoted' && <>
                        <button onClick={() => promote(i.id)} className="flex items-center gap-1 text-[11px] font-semibold text-green-600 hover:underline"><ArrowUpCircle size={13} /> Add to bank</button>
                        <button onClick={() => setStatus(i.id, i.status === 'dismissed' ? 'pending' : 'dismissed')} className="text-[11px] text-gray-400 hover:underline">{i.status === 'dismissed' ? 'Restore' : 'Dismiss'}</button>
                      </>}
                      {canDelete && <button onClick={() => del(i.id)} className="ml-auto p-1 text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>}
    </div>
  )
}

// ─── Lead Gen Hub shell ───────────────────────────────────────────────────────
export default function LeadGenHub() {
  const { isOwnerOrManager } = useRole()
  const [sub, setSub] = useState('tasks')
  const TABS = [
    { id: 'tasks',     label: 'My Lead Gen', icon: ListTodo },
    ...(isOwnerOrManager ? [{ id: 'bank', label: 'Idea Bank', icon: Library }] : []),
    { id: 'ideas',     label: 'Suggestions', icon: Lightbulb },
    { id: 'outreach',  label: 'Outreach',    icon: Phone },
  ]
  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-3"><Sprout size={18} className="text-[#E8611A]" /><h2 className="text-base font-bold text-gray-900">Lead Gen Hub</h2></div>
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-0.5 w-fit flex-wrap">
        {TABS.map(t => { const Icon = t.icon; return (
          <button key={t.id} onClick={() => setSub(t.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${sub === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <Icon size={13} /> {t.label}
          </button>
        )})}
      </div>
      {sub === 'tasks' && <MyLeadGen />}
      {sub === 'bank' && isOwnerOrManager && <IdeaBank />}
      {sub === 'ideas' && <Suggestions />}
      {sub === 'outreach' && <OutreachTab />}
    </div>
  )
}
