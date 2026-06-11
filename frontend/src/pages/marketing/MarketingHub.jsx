import { useState, useEffect, useCallback, useRef } from 'react'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import { supabase } from '@/lib/supabase'
import { useStudio } from '@/contexts/StudioContext'
import { useRole } from '@/hooks/useRole'
import {
  CheckCircle2, Circle, Loader2, Camera, Megaphone, ChevronDown, ChevronUp,
  ListTodo, Images, X, Download, Trash2, CheckCheck, Send, Play, Quote,
  Trophy, Flame, RefreshCw, Gift, Check,
} from 'lucide-react'

const CATEGORY_STYLE = {
  content:    { label: 'Content',    cls: 'bg-purple-100 text-purple-700' },
  engagement: { label: 'Engagement', cls: 'bg-blue-100 text-blue-700' },
  social:     { label: 'Social',     cls: 'bg-pink-100 text-pink-700' },
  community:  { label: 'Community',   cls: 'bg-green-100 text-green-700' },
  retention:  { label: 'Retention',  cls: 'bg-amber-100 text-amber-700' },
}

const CONTENT_CATEGORIES = [
  { value: 'member_photos',  label: 'Member Photos' },
  { value: 'member_videos',  label: 'Member Videos' },
  { value: 'testimonials',   label: 'Testimonials' },
  { value: 'transformation', label: 'Transformation Stories' },
  { value: 'milestone',      label: 'Member Milestones' },
  { value: 'event',          label: 'Event Content' },
  { value: 'reels_raw',      label: 'Reels / TikTok Raw' },
  { value: 'guest_visit',    label: 'Guest Visit Content' },
]
const catLabel = (v) => CONTENT_CATEGORIES.find(c => c.value === v)?.label || v

async function downloadFile(url, name) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name || 'content'
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(a.href)
  } catch { window.open(url, '_blank') }
}

// ─── Task card (with inline upload) ───────────────────────────────────────────
function TaskCard({ task, studioId, onCompleted }) {
  const [open, setOpen]       = useState(false)
  const [vals, setVals]       = useState({})
  const [uploads, setUploads] = useState([]) // {file_url, file_path, file_type, name}
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const fileRef = useRef(null)
  const done = task.completed
  const cat = CATEGORY_STYLE[task.category] || CATEGORY_STYLE.content
  const fields = Array.isArray(task.required_fields) ? task.required_fields : []
  const setV = (k, v) => setVals(s => ({ ...s, [k]: v }))

  const pickFiles = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true); setError('')
    try {
      for (const file of files) {
        const isVideo = file.type.startsWith('video')
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${studioId}/${task.id}/${Date.now()}-${safe}`
        const { error: upErr } = await supabase.storage.from('marketing-content')
          .upload(path, file, { upsert: false, contentType: file.type })
        if (upErr) throw upErr
        const { data: { publicUrl } } = supabase.storage.from('marketing-content').getPublicUrl(path)
        setUploads(prev => [...prev, { file_url: publicUrl, file_path: path, file_type: isVideo ? 'video' : 'photo', name: file.name }])
      }
    } catch (err) { setError('Upload failed: ' + (err.message || 'try a smaller file')) }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const removeUpload = (i) => setUploads(prev => prev.filter((_, idx) => idx !== i))

  const complete = async () => {
    for (const f of fields) {
      if (f.required && !(vals[f.key] || '').trim()) { setError(`Please fill in “${f.label}”`); return }
    }
    if (task.required_uploads > 0 && uploads.length === 0) { setError('Please add at least one photo or video.'); return }
    setSaving(true); setError('')
    try {
      const completion = await apiPost(`/api/marketing/tasks/${task.id}/complete`, { field_values: vals })
      const member = vals.member_name || null
      // Register uploaded files as content assets
      for (const u of uploads) {
        await apiPost('/api/marketing/content', {
          file_url: u.file_url, file_path: u.file_path, file_type: u.file_type,
          category: u.file_type === 'video' ? 'member_videos' : 'member_photos',
          member_name: member, task_id: task.id, completion_id: completion.id,
        })
      }
      // A testimonial task also creates a text testimonial card
      if (vals.quote) {
        await apiPost('/api/marketing/content', {
          file_type: 'testimonial', category: 'testimonials',
          caption: vals.quote, member_name: member, task_id: task.id, completion_id: completion.id,
        })
      }
      onCompleted(task.id)
    } catch (e) { setError(e.message); setSaving(false) }
  }

  return (
    <div className={`bg-white border rounded-xl overflow-hidden transition-all ${done ? 'border-green-200 opacity-75' : 'border-gray-200'}`}>
      <button onClick={() => !done && setOpen(o => !o)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        {done ? <CheckCircle2 size={20} className="text-green-500 flex-shrink-0" /> : <Circle size={20} className="text-gray-300 flex-shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${done ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${cat.cls}`}>{cat.label}</span>
            {task.required_uploads > 0 && <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><Camera size={10} /> {task.required_uploads}</span>}
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
              <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}{f.required && <span className="text-red-500"> *</span>}</label>
              {(f.key === 'quote' || f.key === 'idea' || f.key === 'caption')
                ? <textarea rows={2} value={vals[f.key] || ''} onChange={e => setV(f.key, e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#E8611A]/30 focus:border-[#E8611A]" />
                : <input value={vals[f.key] || ''} onChange={e => setV(f.key, e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8611A]/30 focus:border-[#E8611A]" />}
            </div>
          ))}

          {/* Upload */}
          {task.required_uploads > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Photos / Videos</label>
              <div className="flex gap-2 flex-wrap">
                {uploads.map((u, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
                    {u.file_type === 'video'
                      ? <div className="w-full h-full flex items-center justify-center"><Play size={18} className="text-gray-400" /></div>
                      : <img src={u.file_url} alt="" className="w-full h-full object-cover" />}
                    <button onClick={() => removeUpload(i)} className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5"><X size={10} className="text-white" /></button>
                  </div>
                ))}
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-[#E8611A] hover:text-[#E8611A] disabled:opacity-50">
                  {uploading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
                </button>
                <input ref={fileRef} type="file" accept="image/*,video/*" capture="environment" multiple onChange={pickFiles} className="hidden" />
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
          <button onClick={complete} disabled={saving || uploading}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#E8611A] hover:bg-orange-600 text-white text-sm font-bold rounded-lg disabled:opacity-50">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Mark Complete
          </button>
        </div>
      )}
    </div>
  )
}

// ─── My Tasks view ────────────────────────────────────────────────────────────
function MyTasks() {
  const { currentStudio } = useStudio()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setTasks(await apiGet('/api/marketing/tasks')) } catch {} finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const onCompleted = (id) => {
    const t = tasks.find(x => x.id === id)
    setTasks(prev => prev.map(x => x.id === id ? { ...x, completed: true } : x))
    if (t) { setToast(`Task complete! +${t.point_value} pts`); setTimeout(() => setToast(null), 2200) }
  }

  const todo = tasks.filter(t => !t.completed)
  const done = tasks.filter(t => t.completed)

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 size={22} className="animate-spin text-gray-300" /></div>

  return (
    <div>
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1A1A1A] text-white text-sm font-semibold px-5 py-2.5 rounded-full shadow-lg flex items-center gap-2">
          <CheckCircle2 size={16} className="text-green-400" /> {toast}
        </div>
      )}
      <p className="text-xs text-gray-500 mb-4">Complete these during your shift. {todo.length} to do{done.length > 0 ? ` · ${done.length} done today` : ''}.</p>
      {tasks.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">No marketing tasks set up yet.</p>
      ) : (
        <div className="space-y-2">
          {todo.map(t => <TaskCard key={t.id} task={t} studioId={currentStudio?.id} onCompleted={onCompleted} />)}
          {done.length > 0 && <>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider pt-3">Completed</p>
            {done.map(t => <TaskCard key={t.id} task={t} studioId={currentStudio?.id} onCompleted={onCompleted} />)}
          </>}
        </div>
      )}
    </div>
  )
}

// ─── Content Library view ─────────────────────────────────────────────────────
function ContentLibrary() {
  const { isOwnerOrManager } = useRole()
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [fCat, setFCat] = useState('')
  const [fType, setFType] = useState('')
  const [fStaff, setFStaff] = useState('')
  const [fReady, setFReady] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const qs = new URLSearchParams()
    if (fCat) qs.set('category', fCat)
    if (fType) qs.set('type', fType)
    if (fStaff) qs.set('staff_id', fStaff)
    if (fReady) qs.set('ready', 'true')
    try { setAssets(await apiGet(`/api/marketing/content?${qs}`)) } catch {} finally { setLoading(false) }
  }, [fCat, fType, fStaff, fReady])
  useEffect(() => { load() }, [load])

  const staffOptions = Array.from(new Map(assets.map(a => [a.staff_id, a.staff_name])).entries())

  const setStatus = async (id, patch) => {
    try { const u = await apiPut(`/api/marketing/content/${id}`, patch); setAssets(prev => prev.map(a => a.id === id ? u : a)) } catch {}
  }
  const del = async (id) => {
    if (!confirm('Delete this asset?')) return
    try { await apiDelete(`/api/marketing/content/${id}`); setAssets(prev => prev.filter(a => a.id !== id)) } catch {}
  }
  const downloadAll = async () => {
    for (const a of assets.filter(x => x.file_url)) { await downloadFile(a.file_url, `${a.category}-${a.id}`) }
  }

  const downloadable = assets.filter(a => a.file_url).length

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <select className="bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-700" value={fCat} onChange={e => setFCat(e.target.value)}>
          <option value="">All categories</option>
          {CONTENT_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select className="bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-700" value={fType} onChange={e => setFType(e.target.value)}>
          <option value="">All types</option>
          <option value="photo">Photos</option><option value="video">Videos</option><option value="testimonial">Testimonials</option>
        </select>
        <select className="bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs text-gray-700" value={fStaff} onChange={e => setFStaff(e.target.value)}>
          <option value="">All staff</option>
          {staffOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 px-2 py-1.5 bg-white border border-gray-300 rounded-lg cursor-pointer">
          <input type="checkbox" checked={fReady} onChange={e => setFReady(e.target.checked)} /> Ready for SOCi
        </label>
        {downloadable > 0 && (
          <button onClick={downloadAll} className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-white bg-[#1A1A1A] rounded-lg px-3 py-1.5 hover:bg-gray-800">
            <Download size={13} /> Download all ({downloadable})
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 size={22} className="animate-spin text-gray-300" /></div>
      ) : assets.length === 0 ? (
        <div className="text-center py-12 text-gray-400"><Images size={28} className="mx-auto mb-2 opacity-30" /><p className="text-sm">No content yet. Complete tasks with photos/videos and they'll land here.</p></div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {assets.map(a => (
            <div key={a.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="aspect-square bg-gray-100 flex items-center justify-center relative">
                {a.file_type === 'photo' && a.file_url ? <img src={a.file_url} alt="" className="w-full h-full object-cover" />
                  : a.file_type === 'video' ? <a href={a.file_url} target="_blank" rel="noreferrer" className="flex flex-col items-center text-gray-400"><Play size={28} /><span className="text-[10px] mt-1">Video</span></a>
                  : <div className="p-3 text-center"><Quote size={20} className="text-gray-300 mx-auto mb-1" /><p className="text-[11px] text-gray-600 leading-snug line-clamp-4">"{a.caption}"</p></div>}
                {a.ready_for_soci && <span className="absolute top-1.5 left-1.5 text-[9px] font-bold bg-green-600 text-white px-1.5 py-0.5 rounded-full">SOCi ✓</span>}
              </div>
              <div className="p-2">
                <p className="text-[10px] text-gray-500 truncate">{catLabel(a.category)}{a.member_name ? ` · ${a.member_name}` : ''}</p>
                <p className="text-[10px] text-gray-400 truncate">{a.staff_name}</p>
                <div className="flex items-center gap-1 mt-1.5">
                  {a.file_url && <button onClick={() => downloadFile(a.file_url, `${a.category}-${a.id}`)} className="p-1 text-gray-400 hover:text-gray-700" title="Download"><Download size={13} /></button>}
                  {isOwnerOrManager && <>
                    <button onClick={() => setStatus(a.id, { ready_for_soci: !a.ready_for_soci })} title="Toggle Ready for SOCi"
                      className={`p-1 ${a.ready_for_soci ? 'text-green-600' : 'text-gray-400 hover:text-green-600'}`}><Send size={13} /></button>
                    <button onClick={() => setStatus(a.id, { status: 'approved' })} title="Approve"
                      className={`p-1 ${a.status === 'approved' ? 'text-blue-600' : 'text-gray-400 hover:text-blue-600'}`}><CheckCheck size={13} /></button>
                    <button onClick={() => del(a.id)} className="p-1 text-gray-400 hover:text-red-500 ml-auto" title="Delete"><Trash2 size={13} /></button>
                  </>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Leaderboard + weekly summary view ───────────────────────────────────────
function Leaderboard() {
  const { isOwnerOrManager, userId } = useRole()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editingReward, setEditingReward] = useState(false)
  const [rewardDraft, setRewardDraft] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { const d = await apiGet('/api/marketing/leaderboard'); setData(d); setRewardDraft(d.reward_label || '') } catch {} finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const reset = async () => {
    if (!confirm('Reset the weekly leaderboard to 0? (All-time points are kept.)')) return
    await apiPost('/api/marketing/leaderboard/reset', {}); load()
  }
  const saveReward = async () => {
    await apiPut('/api/marketing/settings', { weekly_reward_label: rewardDraft })
    setEditingReward(false); load()
  }

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 size={22} className="animate-spin text-gray-300" /></div>
  if (!data) return null
  const { rows = [], me = {}, team = {}, reward_label } = data

  return (
    <div className="space-y-4">
      {/* Your week */}
      <div className="bg-[#1A1A1A] rounded-xl p-4 text-white">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#E8611A] mb-2">Your week</p>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div><p className="text-xl font-black text-[#E8611A]">{me.weekly_points || 0}</p><p className="text-[10px] text-white/50">points</p></div>
          <div><p className="text-xl font-black">{me.tasks_this_week || 0}</p><p className="text-[10px] text-white/50">tasks</p></div>
          <div><p className="text-xl font-black">{me.content_this_week || 0}</p><p className="text-[10px] text-white/50">content</p></div>
          <div><p className="text-xl font-black flex items-center justify-center gap-1"><Flame size={14} className="text-[#E8611A]" />{me.streak || 0}</p><p className="text-[10px] text-white/50">wk streak</p></div>
        </div>
      </div>

      {/* Weekly reward */}
      <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-center gap-2">
        <Gift size={16} className="text-[#E8611A] flex-shrink-0" />
        {editingReward ? (
          <div className="flex items-center gap-2 flex-1">
            <input value={rewardDraft} onChange={e => setRewardDraft(e.target.value)} placeholder='e.g. "$10 bonus" or "Free session"'
              className="flex-1 border border-orange-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8611A]/30" />
            <button onClick={saveReward} className="p-1.5 text-green-600"><Check size={16} /></button>
            <button onClick={() => setEditingReward(false)} className="p-1.5 text-gray-400"><X size={16} /></button>
          </div>
        ) : (
          <>
            <p className="text-sm text-orange-800 flex-1">
              <span className="font-semibold">This week's reward:</span> {reward_label || <span className="text-orange-400 italic">not set</span>}
            </p>
            {isOwnerOrManager && <button onClick={() => setEditingReward(true)} className="text-xs font-semibold text-[#E8611A] hover:underline">Edit</button>}
          </>
        )}
      </div>

      {/* Team totals + reset */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Team this week: <strong className="text-gray-800">{team.points || 0}</strong> pts · {team.tasks || 0} tasks · {team.content || 0} content</span>
        {isOwnerOrManager && <button onClick={reset} className="flex items-center gap-1 text-gray-400 hover:text-gray-700"><RefreshCw size={12} /> Reset week</button>}
      </div>

      {/* Leaderboard */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
          <Trophy size={15} className="text-[#E8611A]" /><p className="text-sm font-bold text-gray-900">Leaderboard</p>
          <span className="ml-auto text-[10px] text-gray-400">weekly · resets Sunday</span>
        </div>
        <div className="divide-y divide-gray-50">
          {rows.length === 0 && <p className="px-4 py-6 text-sm text-gray-400 text-center">No points logged yet this week.</p>}
          {rows.map((r, i) => {
            const isMe = r.staff_id === userId
            const medal = ['🥇', '🥈', '🥉'][i]
            return (
              <div key={r.staff_id} className={`flex items-center gap-3 px-4 py-2.5 ${isMe ? 'bg-orange-50' : ''}`}>
                <span className="w-6 text-center text-sm font-bold text-gray-400">{medal || `#${i + 1}`}</span>
                <div className="w-7 h-7 rounded-full bg-[#E8611A] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{r.name[0]}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">{r.name}{isMe && <span className="text-[10px] text-orange-500 ml-1">(you)</span>}</p>
                  <p className="text-[10px] text-gray-400">{r.all_time_points} all-time{r.streak > 0 ? ` · 🔥 ${r.streak} wk` : ''}</p>
                </div>
                <span className="text-base font-black text-[#E8611A] flex-shrink-0">{r.weekly_points}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Marketing Hub shell ──────────────────────────────────────────────────────
export default function MarketingHub() {
  const [sub, setSub] = useState('tasks')
  const TABS = [
    { id: 'tasks',       label: 'My Tasks',        icon: ListTodo },
    { id: 'library',     label: 'Content Library', icon: Images },
    { id: 'leaderboard', label: 'Leaderboard',     icon: Trophy },
  ]
  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-3">
        <Megaphone size={18} className="text-[#E8611A]" />
        <h2 className="text-base font-bold text-gray-900">Marketing Hub</h2>
      </div>
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-0.5 w-fit">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setSub(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${sub === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <Icon size={13} /> {t.label}
            </button>
          )
        })}
      </div>
      {sub === 'tasks' && <MyTasks />}
      {sub === 'library' && <ContentLibrary />}
      {sub === 'leaderboard' && <Leaderboard />}
    </div>
  )
}
