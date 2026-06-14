import { useState, useEffect, useCallback, useRef } from 'react'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import { supabase } from '@/lib/supabase'
import { useStudio } from '@/contexts/StudioContext'
import { useRole } from '@/hooks/useRole'
import {
  CheckCircle2, Circle, Loader2, Camera, Megaphone, ChevronDown, ChevronUp,
  ListTodo, Images, X, Download, Trash2, CheckCheck, Send, Play, Quote,
  Trophy, Flame, RefreshCw, Gift, Check,
  BarChart3, Settings, Plus, Pencil, Copy, Flag, Archive, Star,
  Lightbulb, Power, ExternalLink,
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
                {r.avatar_url
                  ? <img src={r.avatar_url} alt={r.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                  : <div className="w-7 h-7 rounded-full bg-[#E8611A] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{r.name[0]}</div>}
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

// ─── Manager Dashboard ────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, icon: Icon, color = 'text-gray-900' }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className="text-gray-400" />
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      </div>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function Dashboard() {
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { apiGet('/api/marketing/dashboard').then(setD).catch(() => {}).finally(() => setLoading(false)) }, [])
  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 size={22} className="animate-spin text-gray-300" /></div>
  if (!d) return null
  return (
    <div>
      <p className="text-xs text-gray-500 mb-4">This week's marketing activity across the team.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <MetricCard label="Completion rate" value={`${d.completion_rate}%`} sub="of assigned tasks" icon={BarChart3} color="text-[#E8611A]" />
        <MetricCard label="Content uploaded" value={d.content_this_week} sub="this week" icon={Images} />
        <MetricCard label="Reviews requested" value={d.reviews_requested} sub="Google reviews" icon={Star} />
        <MetricCard label="Referrals requested" value={d.referrals_requested} sub="this week" icon={Send} />
        <MetricCard label="Pending review" value={d.pending_review} sub="content awaiting approval" icon={Flag} color={d.pending_review > 0 ? 'text-amber-600' : 'text-gray-900'} />
        <MetricCard label="Top performer" value={d.top_performer?.name || '—'} sub={d.top_performer ? `${d.top_performer.points} pts` : 'no activity yet'} icon={Trophy} />
      </div>
    </div>
  )
}

// ─── Content Review Queue ─────────────────────────────────────────────────────
function ReviewQueue() {
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    try { setAssets(await apiGet('/api/marketing/content?status=pending')) } catch {} finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const act = async (id, patch) => { try { await apiPut(`/api/marketing/content/${id}`, patch); setAssets(prev => prev.filter(a => a.id !== id)) } catch {} }
  const batchApprove = async () => { await apiPost('/api/marketing/content/batch-approve', {}); load() }

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 size={22} className="animate-spin text-gray-300" /></div>
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-gray-500">{assets.length} item{assets.length !== 1 ? 's' : ''} awaiting review.</p>
        {assets.length > 0 && <button onClick={batchApprove} className="flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg px-3 py-1.5 hover:bg-blue-700"><CheckCheck size={13} /> Approve all</button>}
      </div>
      {assets.length === 0 ? (
        <div className="text-center py-12 text-gray-400"><CheckCircle2 size={28} className="mx-auto mb-2 opacity-30" /><p className="text-sm">All caught up — nothing to review.</p></div>
      ) : (
        <div className="space-y-2">
          {assets.map(a => (
            <div key={a.id} className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3">
              <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                {a.file_type === 'photo' && a.file_url ? <img src={a.file_url} alt="" className="w-full h-full object-cover" />
                  : a.file_type === 'video' ? <Play size={18} className="text-gray-400" />
                  : <Quote size={16} className="text-gray-300" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">{catLabel(a.category)}{a.member_name ? ` · ${a.member_name}` : ''}</p>
                {a.caption && <p className="text-xs text-gray-500 truncate">"{a.caption}"</p>}
                <p className="text-[10px] text-gray-400">{a.staff_name}{a.task_title ? ` · ${a.task_title}` : ''}</p>
              </div>
              <button onClick={() => act(a.id, { status: 'approved' })} title="Approve" className="p-2 text-green-600 hover:bg-green-50 rounded-lg"><Check size={16} /></button>
              <button onClick={() => act(a.id, { status: 'archived' })} title="Archive" className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg"><Archive size={15} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Task Manager (create / edit / duplicate / delete) ────────────────────────
const TASK_TYPES = [{ v: 'studio_wide', l: 'Studio-Wide' }, { v: 'role', l: 'Role-Specific' }, { v: 'seasonal', l: 'Seasonal / Campaign' }]
const TASK_CATS  = ['content', 'engagement', 'social', 'community', 'retention']
const ROLE_TARGETS = [{ v: 'all', l: 'Everyone' }, { v: 'manager', l: 'Managers' }, { v: 'tsa', l: 'TSAs' }]
const CADENCES = [{ v: 'daily', l: 'Daily' }, { v: 'weekly', l: 'Weekly' }, { v: 'shift', l: 'Per shift' }]

function TaskEditModal({ task, onSaved, onClose }) {
  const [f, setF] = useState({
    title: task?.title || '', description: task?.description || '',
    type: task?.type || 'studio_wide', category: task?.category || 'content',
    role_target: task?.role_target || 'all', point_value: task?.point_value ?? 10,
    required_uploads: task?.required_uploads ?? 0, cadence: task?.cadence || 'daily',
    required_fields: Array.isArray(task?.required_fields) ? task.required_fields : [],
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8611A]/30 focus:border-[#E8611A]'

  const addField = () => setF(s => ({ ...s, required_fields: [...s.required_fields, { key: `field_${s.required_fields.length + 1}`, label: '', required: false }] }))
  const setField = (i, k, v) => setF(s => ({ ...s, required_fields: s.required_fields.map((x, idx) => idx === i ? { ...x, [k]: v, ...(k === 'label' ? { key: v.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `field_${i}` } : {}) } : x) }))
  const rmField = (i) => setF(s => ({ ...s, required_fields: s.required_fields.filter((_, idx) => idx !== i) }))

  const save = async () => {
    if (!f.title.trim()) return
    setSaving(true)
    try {
      const payload = { ...f, required_fields: f.required_fields.filter(x => x.label.trim()) }
      const saved = task?.id ? await apiPut(`/api/marketing/tasks/${task.id}`, payload) : await apiPost('/api/marketing/tasks', payload)
      onSaved(saved)
    } catch { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-gray-900">{task ? 'Edit task' : 'New task'}</h2>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Title *</label><input className={inp} value={f.title} onChange={e => set('title', e.target.value)} autoFocus /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Description</label><textarea rows={2} className={`${inp} resize-none`} value={f.description} onChange={e => set('description', e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Type</label><select className={inp} value={f.type} onChange={e => set('type', e.target.value)}>{TASK_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Category</label><select className={inp} value={f.category} onChange={e => set('category', e.target.value)}>{TASK_CATS.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">For</label><select className={inp} value={f.role_target} onChange={e => set('role_target', e.target.value)}>{ROLE_TARGETS.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Cadence</label><select className={inp} value={f.cadence} onChange={e => set('cadence', e.target.value)}>{CADENCES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Points</label><input type="number" className={inp} value={f.point_value} onChange={e => set('point_value', e.target.value)} /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Required uploads</label><input type="number" min="0" className={inp} value={f.required_uploads} onChange={e => set('required_uploads', e.target.value)} /></div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1"><label className="text-xs font-medium text-gray-600">Text fields to collect</label><button onClick={addField} className="text-xs text-[#E8611A] font-semibold">+ Add field</button></div>
            {f.required_fields.map((x, i) => (
              <div key={i} className="flex items-center gap-2 mb-1.5">
                <input placeholder="Field label (e.g. Member name)" className={`${inp} flex-1`} value={x.label} onChange={e => setField(i, 'label', e.target.value)} />
                <label className="flex items-center gap-1 text-xs text-gray-500"><input type="checkbox" checked={x.required} onChange={e => setField(i, 'required', e.target.checked)} /> req</label>
                <button onClick={() => rmField(i)} className="text-gray-400 hover:text-red-500"><X size={14} /></button>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50 sticky bottom-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 font-medium">Cancel</button>
          <button onClick={save} disabled={saving || !f.title.trim()} className="px-5 py-2 bg-[#E8611A] hover:bg-orange-600 text-white text-sm font-bold rounded-lg disabled:opacity-50 flex items-center gap-2">{saving && <Loader2 size={14} className="animate-spin" />} {task ? 'Save' : 'Add task'}</button>
        </div>
      </div>
    </div>
  )
}

function TaskManager() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | false (new) | task (edit)
  const load = useCallback(async () => {
    setLoading(true)
    try { setTasks(await apiGet('/api/marketing/tasks/all')) } catch {} finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const onSaved = () => { setModal(null); load() }
  const duplicate = async (t) => { await apiPost('/api/marketing/tasks', { ...t, title: `${t.title} (copy)` }); load() }
  const toggleActive = async (t) => { const u = await apiPut(`/api/marketing/tasks/${t.id}`, { active: !t.active }); setTasks(prev => prev.map(x => x.id === t.id ? u : x)) }

  const activeCount = tasks.filter(t => t.active).length
  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 size={22} className="animate-spin text-gray-300" /></div>
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-gray-500">{activeCount} active{tasks.length - activeCount > 0 ? ` · ${tasks.length - activeCount} inactive` : ''}.</p>
        <button onClick={() => setModal(false)} className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#E8611A] rounded-lg px-3 py-1.5 hover:bg-orange-600"><Plus size={13} /> New task</button>
      </div>
      <div className="space-y-2">
        {tasks.map(t => (
          <div key={t.id} className={`bg-white border rounded-xl px-4 py-3 flex items-center gap-3 ${t.active ? 'border-gray-200' : 'border-gray-200 opacity-50'}`}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 truncate flex items-center gap-2">
                {t.title}
                {!t.active && <span className="text-[9px] font-bold bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full">INACTIVE</span>}
                {t.type === 'seasonal' && <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">SEASONAL</span>}
              </p>
              <p className="text-[10px] text-gray-400 capitalize">{t.type.replace('_', '-')} · {t.category} · {ROLE_TARGETS.find(r => r.v === t.role_target)?.l || t.role_target} · {t.cadence}</p>
            </div>
            <span className="text-xs font-bold text-[#E8611A] flex-shrink-0">+{t.point_value}</span>
            <button onClick={() => toggleActive(t)} className={`p-1.5 ${t.active ? 'text-green-500 hover:text-gray-500' : 'text-gray-300 hover:text-green-500'}`} title={t.active ? 'Deactivate' : 'Activate'}><Power size={14} /></button>
            <button onClick={() => setModal(t)} className="p-1.5 text-gray-400 hover:text-gray-700" title="Edit"><Pencil size={13} /></button>
            <button onClick={() => duplicate(t)} className="p-1.5 text-gray-400 hover:text-gray-700" title="Duplicate"><Copy size={13} /></button>
          </div>
        ))}
      </div>
      {modal !== null && <TaskEditModal task={modal || null} onSaved={onSaved} onClose={() => setModal(null)} />}
    </div>
  )
}

// ─── Idea Board (Phase 5) ─────────────────────────────────────────────────────
const IDEA_CATS = [
  { v: 'social', l: 'Social' }, { v: 'reel', l: 'Reel' }, { v: 'tiktok', l: 'TikTok' },
  { v: 'campaign', l: 'Campaign' }, { v: 'other', l: 'Other' },
]
const IDEA_STATUS = {
  pending:            { label: 'New',          cls: 'bg-gray-100 text-gray-600' },
  reviewed:           { label: 'Reviewed',     cls: 'bg-blue-100 text-blue-700' },
  approved:           { label: 'Approved',     cls: 'bg-green-100 text-green-700' },
  added_to_calendar:  { label: 'Added to SOCi', cls: 'bg-[#E8611A]/10 text-[#E8611A]' },
  dismissed:          { label: 'Dismissed',    cls: 'bg-gray-100 text-gray-400' },
}
const IDEA_STATUS_ORDER = ['pending', 'reviewed', 'approved', 'added_to_calendar', 'dismissed']

function IdeaBoard() {
  const { isOwnerOrManager, userId } = useRole()
  const [ideas, setIdeas] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ text: '', category: 'social', reference_url: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setIdeas(await apiGet('/api/marketing/ideas')) } catch {} finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const submit = async () => {
    if (!form.text.trim()) return
    setSaving(true)
    try {
      const created = await apiPost('/api/marketing/ideas', form)
      setIdeas(prev => [{ ...created, staff_name: 'You' }, ...prev])
      setForm({ text: '', category: 'social', reference_url: '' })
    } catch {} finally { setSaving(false) }
  }
  const setStatus = async (id, status) => { try { const u = await apiPut(`/api/marketing/ideas/${id}`, { status }); setIdeas(prev => prev.map(i => i.id === id ? { ...i, ...u } : i)) } catch {} }
  const del = async (id) => { try { await apiDelete(`/api/marketing/ideas/${id}`); setIdeas(prev => prev.filter(i => i.id !== id)) } catch {} }
  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8611A]/30 focus:border-[#E8611A]'

  return (
    <div>
      {/* Submit */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 mb-4 space-y-2">
        <textarea rows={2} className={`${inp} resize-none`} placeholder="Share a content idea, caption, or trend you spotted…" value={form.text} onChange={e => setForm(f => ({ ...f, text: e.target.value }))} />
        <div className="flex gap-2">
          <select className={`${inp} w-auto`} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>{IDEA_CATS.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}</select>
          <input className={`${inp} flex-1`} placeholder="Reference link (optional)" value={form.reference_url} onChange={e => setForm(f => ({ ...f, reference_url: e.target.value }))} />
          <button onClick={submit} disabled={saving || !form.text.trim()} className="px-4 py-2 bg-[#E8611A] hover:bg-orange-600 text-white text-sm font-bold rounded-lg disabled:opacity-50 flex items-center gap-1.5">{saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Submit</button>
        </div>
      </div>

      {loading ? <div className="flex items-center justify-center py-10"><Loader2 size={22} className="animate-spin text-gray-300" /></div>
        : ideas.length === 0 ? <div className="text-center py-10 text-gray-400"><Lightbulb size={26} className="mx-auto mb-2 opacity-30" /><p className="text-sm">No ideas yet — be the first to drop one.</p></div>
        : (
          <div className="space-y-2">
            {ideas.map(i => {
              const st = IDEA_STATUS[i.status] || IDEA_STATUS.pending
              const canDelete = isOwnerOrManager || i.staff_id === userId
              return (
                <div key={i.id} className={`bg-white border border-gray-200 rounded-xl p-3 ${i.status === 'dismissed' ? 'opacity-60' : ''}`}>
                  <div className="flex items-start gap-2">
                    <Lightbulb size={15} className="text-[#E8611A] flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-800 leading-snug">{i.text}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[10px] text-gray-400 capitalize">{i.category}</span>
                        <span className="text-[10px] text-gray-300">· {i.staff_name}</span>
                        {i.reference_url && <a href={i.reference_url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-500 flex items-center gap-0.5"><ExternalLink size={9} /> link</a>}
                      </div>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${st.cls}`}>{st.label}</span>
                  </div>
                  {(isOwnerOrManager || canDelete) && (
                    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-50 flex-wrap">
                      {isOwnerOrManager && (
                        <select value={i.status} onChange={e => setStatus(i.id, e.target.value)} className="text-[11px] border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-600">
                          {IDEA_STATUS_ORDER.map(s => <option key={s} value={s}>{IDEA_STATUS[s].label}</option>)}
                        </select>
                      )}
                      {canDelete && <button onClick={() => del(i.id)} className="ml-auto p-1 text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
    </div>
  )
}

// ─── Marketing Hub shell ──────────────────────────────────────────────────────
export default function MarketingHub() {
  const { isOwnerOrManager } = useRole()
  const [sub, setSub] = useState('tasks')
  const TABS = [
    { id: 'tasks',       label: 'My Tasks',        icon: ListTodo },
    { id: 'library',     label: 'Content Library', icon: Images },
    { id: 'ideas',       label: 'Ideas',           icon: Lightbulb },
    { id: 'leaderboard', label: 'Leaderboard',     icon: Trophy },
    ...(isOwnerOrManager ? [
      { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
      { id: 'review',    label: 'Review',    icon: Flag },
      { id: 'manage',    label: 'Tasks',     icon: Settings },
    ] : []),
  ]
  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-3">
        <Megaphone size={18} className="text-[#E8611A]" />
        <h2 className="text-base font-bold text-gray-900">Content</h2>
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
      {sub === 'ideas' && <IdeaBoard />}
      {sub === 'leaderboard' && <Leaderboard />}
      {sub === 'dashboard' && isOwnerOrManager && <Dashboard />}
      {sub === 'review' && isOwnerOrManager && <ReviewQueue />}
      {sub === 'manage' && isOwnerOrManager && <TaskManager />}
    </div>
  )
}
