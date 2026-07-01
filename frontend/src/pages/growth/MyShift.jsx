import { useState, useEffect, useCallback, useRef } from 'react'
import { apiGet, apiPost, apiPut } from '@/hooks/useApi'
import { supabase } from '@/lib/supabase'
import { useStudio } from '@/contexts/StudioContext'
import { useRole } from '@/hooks/useRole'
import MemberTagPicker from '@/components/MemberTagPicker'
import {
  CheckCircle2, Circle, Loader2, Camera, ChevronDown, ChevronUp, X, Play,
  Trophy, Flame, Gift, Lightbulb, Image as ImageIcon, Sprout, Plus, Phone, MessageSquare,
  BookOpen, MapPin, Pencil,
} from 'lucide-react'

// Each task is tagged by which engine it came from.
const KIND = {
  content:   { label: 'Content',   cls: 'bg-purple-100 text-purple-700', Icon: ImageIcon },
  marketing: { label: 'Marketing', cls: 'bg-green-100 text-green-700',   Icon: Sprout },
}

// ─── One shift task (handles both content tasks and marketing plays) ──────────
function ShiftCard({ task, studioId, onCompleted }) {
  const [open, setOpen]   = useState(false)
  const [vals, setVals]   = useState({})
  const [notes, setNotes] = useState('')
  const [uploads, setUploads] = useState([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)
  const done = task.completed
  const km = KIND[task.kind] || KIND.content
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
        const { error: upErr } = await supabase.storage.from('marketing-content').upload(path, file, { upsert: false, contentType: file.type })
        if (upErr) throw upErr
        const { data: { publicUrl } } = supabase.storage.from('marketing-content').getPublicUrl(path)
        setUploads(prev => [...prev, { file_url: publicUrl, file_path: path, file_type: isVideo ? 'video' : 'photo' }])
      }
    } catch (err) { setError('Upload failed: ' + (err.message || 'try a smaller file')) }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const complete = async () => {
    if (task.kind === 'content') {
      for (const f of fields) if (f.required && !(vals[f.key] || '').trim()) { setError(`Please fill in “${f.label}”`); return }
      if (task.required_uploads > 0 && uploads.length === 0) { setError('Please add at least one photo or video.'); return }
    }
    setSaving(true); setError('')
    try {
      if (task.kind === 'content') {
        const completion = await apiPost(`/api/marketing/tasks/${task.id}/complete`, { field_values: vals })
        const member = vals.member_name || null
        for (const u of uploads) {
          await apiPost('/api/marketing/content', {
            file_url: u.file_url, file_path: u.file_path, file_type: u.file_type,
            category: u.file_type === 'video' ? 'member_videos' : 'member_photos',
            member_name: member, task_id: task.id, completion_id: completion.id,
          })
        }
        if (vals.quote) await apiPost('/api/marketing/content', { file_type: 'testimonial', category: 'testimonials', caption: vals.quote, member_name: member, task_id: task.id, completion_id: completion.id })
      } else {
        await apiPost(`/api/leadgen/plays/${task.id}/complete`, { notes })
      }
      onCompleted(task.id)
    } catch (e) { setError(e.message); setSaving(false) }
  }

  return (
    <div className={`bg-white border rounded-xl overflow-hidden ${done ? 'border-green-200 opacity-75' : 'border-gray-200'}`}>
      <button onClick={() => !done && setOpen(o => !o)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        {done ? <CheckCircle2 size={20} className="text-green-500 flex-shrink-0" /> : <Circle size={20} className="text-gray-300 flex-shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${done ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${km.cls}`}>{km.label}</span>
            {task.required_uploads > 0 && <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><Camera size={10} /> {task.required_uploads}</span>}
          </div>
        </div>
        <span className="text-xs font-bold text-[#E8611A] flex-shrink-0">+{task.point_value} pts</span>
        {!done && (open ? <ChevronUp size={15} className="text-gray-300" /> : <ChevronDown size={15} className="text-gray-300" />)}
      </button>

      {open && !done && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-gray-100">
          {task.description && <p className="text-xs text-gray-500 leading-relaxed">{task.description}</p>}
          {task.steps && <div className="bg-gray-50 rounded-lg p-3"><p className="text-[11px] text-gray-600 whitespace-pre-line leading-relaxed">{task.steps}</p></div>}

          {task.kind === 'content' && fields.map(f => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}{f.required && <span className="text-red-500"> *</span>}</label>
              {(f.key === 'quote' || f.key === 'idea' || f.key === 'caption')
                ? <textarea rows={2} value={vals[f.key] || ''} onChange={e => setV(f.key, e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#E8611A]/30 focus:border-[#E8611A]" />
                : <input value={vals[f.key] || ''} onChange={e => setV(f.key, e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8611A]/30 focus:border-[#E8611A]" />}
            </div>
          ))}

          {task.kind === 'content' && task.required_uploads > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Photos / Videos</label>
              <div className="flex gap-2 flex-wrap">
                {uploads.map((u, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
                    {u.file_type === 'video' ? <div className="w-full h-full flex items-center justify-center"><Play size={18} className="text-gray-400" /></div> : <img src={u.file_url} alt="" className="w-full h-full object-cover" />}
                    <button onClick={() => setUploads(prev => prev.filter((_, idx) => idx !== i))} className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5"><X size={10} className="text-white" /></button>
                  </div>
                ))}
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-[#E8611A] hover:text-[#E8611A] disabled:opacity-50">
                  {uploading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
                </button>
                <input ref={fileRef} type="file" accept="image/*,video/*" capture="environment" multiple onChange={pickFiles} className="hidden" />
              </div>
            </div>
          )}

          {task.kind === 'marketing' && (
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional) — who, where, result…" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#E8611A]/30 focus:border-[#E8611A]" />
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
          <button onClick={complete} disabled={saving || uploading} className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#E8611A] hover:bg-orange-600 text-white text-sm font-bold rounded-lg disabled:opacity-50">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Mark Complete
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Submit-idea modal ────────────────────────────────────────────────────────
function IdeaModal({ onClose, onSaved }) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async () => {
    if (!text.trim()) return
    setSaving(true)
    try { await apiPost('/api/marketing/ideas', { text, category: 'other' }); onSaved() }
    catch { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-3"><Lightbulb size={18} className="text-[#E8611A]" /><h2 className="font-semibold text-gray-900">Submit an idea</h2></div>
        <textarea rows={4} value={text} onChange={e => setText(e.target.value)} autoFocus placeholder="A content idea, caption, promo, or anything that could help us grow…" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#E8611A]/30 focus:border-[#E8611A]" />
        <div className="flex justify-end gap-2 mt-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 font-medium">Cancel</button>
          <button onClick={submit} disabled={saving || !text.trim()} className="px-5 py-2 bg-[#E8611A] hover:bg-orange-600 text-white text-sm font-bold rounded-lg disabled:opacity-50 flex items-center gap-2">{saving && <Loader2 size={14} className="animate-spin" />} Submit</button>
        </div>
      </div>
    </div>
  )
}

// ─── Upload-content modal (free-form, not tied to a task) ─────────────────────
function UploadContentModal({ studioId, onClose, onSaved }) {
  const [files, setFiles] = useState([])      // local File objects (uploaded on confirm)
  const [memberName, setMemberName] = useState('')
  const [tags, setTags] = useState([])        // tagged members {id, full_name}
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  const addFiles = (e) => { setFiles(prev => [...prev, ...Array.from(e.target.files || [])]); if (fileRef.current) fileRef.current.value = '' }
  const removeFile = (i) => setFiles(prev => prev.filter((_, idx) => idx !== i))

  const upload = async () => {
    if (!files.length) return
    setSaving(true); setError('')
    try {
      for (const file of files) {
        const isVideo = file.type.startsWith('video')
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${studioId}/library/${Date.now()}-${safe}`
        const { error: upErr } = await supabase.storage.from('marketing-content').upload(path, file, { upsert: false, contentType: file.type })
        if (upErr) throw upErr
        const { data: { publicUrl } } = supabase.storage.from('marketing-content').getPublicUrl(path)
        await apiPost('/api/marketing/content', {
          file_url: publicUrl, file_path: path, file_type: isVideo ? 'video' : 'photo',
          category: isVideo ? 'member_videos' : 'member_photos', member_name: memberName || null,
          member_ids: tags.map(t => t.id),
        })
      }
      onSaved()
    } catch (e) { setError('Upload failed: ' + (e.message || 'try a smaller file')); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-3"><ImageIcon size={18} className="text-[#E8611A]" /><h2 className="font-semibold text-gray-900">Upload content</h2></div>
        <p className="text-xs text-gray-500 mb-3">Add member photos, videos, or moments to the content library — anytime, no task needed.</p>
        <div className="flex gap-2 flex-wrap mb-3">
          {files.map((f, i) => (
            <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
              {f.type.startsWith('video') ? <div className="w-full h-full flex items-center justify-center"><Play size={18} className="text-gray-400" /></div> : <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />}
              <button onClick={() => removeFile(i)} className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5"><X size={10} className="text-white" /></button>
            </div>
          ))}
          <button type="button" onClick={() => fileRef.current?.click()} className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-[#E8611A] hover:text-[#E8611A]"><Camera size={18} /></button>
          <input ref={fileRef} type="file" accept="image/*,video/*" capture="environment" multiple onChange={addFiles} className="hidden" />
        </div>
        <input value={memberName} onChange={e => setMemberName(e.target.value)} placeholder="Note / caption (optional)" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-[#E8611A]/30 focus:border-[#E8611A]" />
        <div className="mb-3">
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Tag members in this photo</label>
          <MemberTagPicker value={tags} onChange={setTags} placeholder="Search members…" />
        </div>
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 font-medium">Cancel</button>
          <button onClick={upload} disabled={saving || !files.length} className="px-5 py-2 bg-[#E8611A] hover:bg-orange-600 text-white text-sm font-bold rounded-lg disabled:opacity-50 flex items-center gap-2">{saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Upload {files.length || ''}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Outreach tile editor (manager/owner) ────────────────────────────────────
function OutreachTileModal({ tile, onClose, onSaved }) {
  const isNew = !tile?.id
  const [f, setF] = useState({ title: tile?.title || '', description: tile?.description || '', script: tile?.script || '', crm_instructions: tile?.crm_instructions || '' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8611A]/30 focus:border-[#E8611A]'
  const save = async () => {
    if (!f.title.trim()) return
    setSaving(true)
    try { isNew ? await apiPost('/api/outreach/tiles', f) : await apiPut(`/api/outreach/tiles/${tile.id}`, f); onSaved() }
    catch { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3"><h2 className="font-semibold text-gray-900">{isNew ? 'New outreach' : 'Edit outreach'}</h2><button onClick={onClose}><X size={18} className="text-gray-400" /></button></div>
        <div className="space-y-3">
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Title *</label><input className={inp} value={f.title} onChange={e => set('title', e.target.value)} autoFocus placeholder="e.g. New Member Outreach" /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Description</label><textarea rows={2} className={`${inp} resize-none`} value={f.description} onChange={e => set('description', e.target.value)} placeholder="Who this is and the goal of the call/text" /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Call Script</label><textarea rows={4} className={`${inp} resize-none`} value={f.script} onChange={e => set('script', e.target.value)} placeholder="The script TSAs should follow…" /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">How to Find in SAIL</label><textarea rows={3} className={`${inp} resize-none`} value={f.crm_instructions} onChange={e => set('crm_instructions', e.target.value)} placeholder="Step-by-step: In SAIL → go to… → filter by…" /></div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 font-medium">Cancel</button>
          <button onClick={save} disabled={saving || !f.title.trim()} className="px-5 py-2 bg-[#E8611A] hover:bg-orange-600 text-white text-sm font-bold rounded-lg disabled:opacity-50 flex items-center gap-2">{saving && <Loader2 size={14} className="animate-spin" />} {isNew ? 'Add' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Interactive Outreach widget — info + log calls/texts on the dashboard ────
function OutreachWidget() {
  const { isOwnerOrManager } = useRole()
  const [tiles, setTiles] = useState([])
  const [logs, setLogs]   = useState({}) // tile_id -> { calls, texts }
  const [loading, setLoading] = useState(true)
  const [open, setOpen]   = useState({}) // tileId -> 'script' | 'sail' | null
  const [editTile, setEditTile] = useState(null) // null | false(new) | tile

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [t, l] = await Promise.all([
        apiGet('/api/outreach/tiles').catch(() => []),
        apiGet('/api/outreach/logs').catch(() => []),
      ])
      setTiles(t || [])
      const map = {}
      ;(l || []).forEach(r => { map[r.tile_id] = { calls: r.calls_made || 0, texts: r.texts_made || 0 } })
      setLogs(map)
    } catch {} finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const bump = async (tileId, field) => {
    const cur = logs[tileId] || { calls: 0, texts: 0 }
    const next = { ...cur, [field]: (cur[field] || 0) + 1 }
    setLogs(prev => ({ ...prev, [tileId]: next }))
    try { await apiPost('/api/outreach/logs/upsert', { tile_id: tileId, calls_made: next.calls, texts_made: next.texts }) }
    catch { setLogs(prev => ({ ...prev, [tileId]: cur })) }
  }
  const toggle = (id, panel) => setOpen(o => ({ ...o, [id]: o[id] === panel ? null : panel }))

  if (loading) return null
  const totalCalls = Object.values(logs).reduce((s, v) => s + (v.calls || 0), 0)
  const totalTexts = Object.values(logs).reduce((s, v) => s + (v.texts || 0), 0)

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
        <Phone size={15} className="text-[#E8611A]" /><p className="text-sm font-bold text-gray-900">Outreach</p>
        <span className="ml-auto text-[11px] text-gray-500">{totalCalls} calls · {totalTexts} texts today</span>
      </div>
      <div className="divide-y divide-gray-100">
        {tiles.map(t => {
          const v = logs[t.id] || { calls: 0, texts: 0 }
          return (
            <div key={t.id} className="px-4 py-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-gray-900">{t.title}</p>
                    {isOwnerOrManager && <button onClick={() => setEditTile(t)} className="text-gray-300 hover:text-gray-600"><Pencil size={12} /></button>}
                  </div>
                  {t.description && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{t.description}</p>}
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <button onClick={() => bump(t.id, 'calls')} className="flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1 hover:bg-blue-100"><Phone size={10} /> {v.calls} <Plus size={9} /></button>
                  <button onClick={() => bump(t.id, 'texts')} className="flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg px-2 py-1 hover:bg-green-100"><MessageSquare size={10} /> {v.texts} <Plus size={9} /></button>
                </div>
              </div>
              {(t.script || t.crm_instructions) && (
                <div className="flex items-center gap-3 mt-2">
                  {t.script && <button onClick={() => toggle(t.id, 'script')} className="flex items-center gap-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-2 py-1 hover:bg-gray-50"><BookOpen size={12} /> Call Script {open[t.id] === 'script' ? <ChevronUp size={11} /> : <ChevronDown size={11} />}</button>}
                  {t.crm_instructions && <button onClick={() => toggle(t.id, 'sail')} className="flex items-center gap-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-2 py-1 hover:bg-gray-50"><MapPin size={12} /> How to Find in SAIL {open[t.id] === 'sail' ? <ChevronUp size={11} /> : <ChevronDown size={11} />}</button>}
                </div>
              )}
              {open[t.id] === 'script' && t.script && <div className="mt-2 bg-gray-50 rounded-lg p-3 text-[11px] text-gray-700 whitespace-pre-line leading-relaxed">{t.script}</div>}
              {open[t.id] === 'sail' && t.crm_instructions && <div className="mt-2 bg-gray-50 rounded-lg p-3 text-[11px] text-gray-700 whitespace-pre-line leading-relaxed">{t.crm_instructions}</div>}
            </div>
          )
        })}
        {tiles.length === 0 && <p className="px-4 py-6 text-sm text-gray-400 text-center">No outreach set up yet.</p>}
      </div>
      {isOwnerOrManager && (
        <button onClick={() => setEditTile(false)} className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-[#E8611A] border-t border-gray-100 hover:bg-orange-50">
          <Plus size={13} /> Add outreach
        </button>
      )}
      {editTile !== null && <OutreachTileModal tile={editTile || null} onClose={() => setEditTile(null)} onSaved={() => { setEditTile(null); load() }} />}
    </div>
  )
}

// ─── My Shift (TSA unified view) ──────────────────────────────────────────────
export default function MyShift() {
  const { currentStudio } = useStudio()
  const [tasks, setTasks] = useState([])
  const [board, setBoard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [ideaOpen, setIdeaOpen] = useState(false)
  const [ideaThanks, setIdeaThanks] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadThanks, setUploadThanks] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [content, marketing, lb] = await Promise.all([
        apiGet('/api/marketing/tasks').catch(() => []),
        apiGet('/api/leadgen/tasks').catch(() => []),
        apiGet('/api/marketing/leaderboard').catch(() => null),
      ])
      const merged = [
        ...(content || []).map(t => ({ ...t, kind: 'content' })),
        ...(marketing || []).map(t => ({ ...t, kind: 'marketing' })),
      ]
      setTasks(merged); setBoard(lb)
    } catch {} finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const onCompleted = (id) => {
    const t = tasks.find(x => x.id === id)
    setTasks(prev => prev.map(x => x.id === id ? { ...x, completed: true } : x))
    if (t) { setToast(`Nice! +${t.point_value} pts`); setTimeout(() => setToast(null), 2200) }
    apiGet('/api/marketing/leaderboard').then(setBoard).catch(() => {})
  }

  const todo = tasks.filter(t => !t.completed)
  const done = tasks.filter(t => t.completed)
  const me = board?.me
  const top = (board?.rows || []).slice(0, 5)

  return (
    <div className="p-4 max-w-5xl mx-auto">
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1A1A1A] text-white text-sm font-semibold px-5 py-2.5 rounded-full shadow-lg flex items-center gap-2"><CheckCircle2 size={16} className="text-green-400" /> {toast}</div>}

      {/* Header (full width) */}
      <div className="bg-[#1A1A1A] rounded-xl p-4 text-white mb-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#E8611A]">My Shift</p>
            <p className="text-sm text-white/70 mt-0.5">{todo.length} task{todo.length !== 1 ? 's' : ''} to do{done.length > 0 ? ` · ${done.length} done` : ''}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-[#E8611A]">{me?.weekly_points || 0}</p>
            <p className="text-[10px] text-white/50">your points this week</p>
          </div>
        </div>
        {board?.reward_label && (
          <div className="mt-3 flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2">
            <Gift size={14} className="text-[#E8611A]" /><span className="text-xs text-white/90"><strong>This week's prize:</strong> {board.reward_label}</span>
          </div>
        )}
      </div>

      {/* Dashboard grid */}
      <div className="grid lg:grid-cols-2 gap-3 items-start">

        {/* Tasks widget */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
            <CheckCircle2 size={15} className="text-[#E8611A]" /><p className="text-sm font-bold text-gray-900">Today's Tasks</p>
            <span className="ml-auto text-[10px] text-gray-400">{todo.length} to do</span>
          </div>
          <div className="p-3">
            {loading ? <div className="flex items-center justify-center py-10"><Loader2 size={22} className="animate-spin text-gray-300" /></div>
              : tasks.length === 0 ? <div className="text-center py-8 text-gray-400"><CheckCircle2 size={24} className="mx-auto mb-2 opacity-30" /><p className="text-sm">No tasks assigned yet — your manager will set some up.</p></div>
              : (
                <div className="space-y-2">
                  {todo.map(t => <ShiftCard key={`${t.kind}-${t.id}`} task={t} studioId={currentStudio?.id} onCompleted={onCompleted} />)}
                  {done.length > 0 && <>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider pt-2">Done today</p>
                    {done.map(t => <ShiftCard key={`${t.kind}-${t.id}`} task={t} studioId={currentStudio?.id} onCompleted={onCompleted} />)}
                  </>}
                </div>
              )}
          </div>
        </div>

        {/* Right column: actions + outreach + leaderboard */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setUploadOpen(true)} className="flex items-center justify-center gap-2 py-2.5 bg-white border border-gray-300 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50">
              <ImageIcon size={15} className="text-[#E8611A]" /> Upload content
            </button>
            <button onClick={() => setIdeaOpen(true)} className="flex items-center justify-center gap-2 py-2.5 bg-white border border-gray-300 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50">
              <Lightbulb size={15} className="text-[#E8611A]" /> Submit an idea
            </button>
          </div>
          {uploadThanks && <p className="text-xs text-green-600 text-center">✓ Content uploaded — thanks! It's in the library for the managers.</p>}
          {ideaThanks && <p className="text-xs text-green-600 text-center">✓ Thanks! Your idea was sent to the managers.</p>}

          {top.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2"><Trophy size={15} className="text-[#E8611A]" /><p className="text-sm font-bold text-gray-900">Leaderboard</p><span className="ml-auto text-[10px] text-gray-400">this week</span></div>
              <div className="divide-y divide-gray-50">
                {top.map((r, i) => {
                  const isMe = me && r.staff_id === me.staff_id
                  const medal = ['🥇', '🥈', '🥉'][i]
                  return (
                    <div key={r.staff_id} className={`flex items-center gap-3 px-4 py-2.5 ${isMe ? 'bg-orange-50' : ''}`}>
                      <span className="w-6 text-center text-sm font-bold text-gray-400">{medal || `#${i + 1}`}</span>
                      {r.avatar_url ? <img src={r.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" /> : <div className="w-7 h-7 rounded-full bg-[#E8611A] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{r.name[0]}</div>}
                      <p className="text-sm font-semibold text-gray-900 truncate flex-1">{r.name}{isMe && <span className="text-[10px] text-orange-500 ml-1">(you)</span>}{r.streak > 0 && <span className="text-[10px] text-gray-400 ml-1">🔥{r.streak}</span>}</p>
                      <span className="text-base font-black text-[#E8611A]">{r.weekly_points}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <OutreachWidget />
        </div>
      </div>

      {ideaOpen && <IdeaModal onClose={() => setIdeaOpen(false)} onSaved={() => { setIdeaOpen(false); setIdeaThanks(true); setTimeout(() => setIdeaThanks(false), 3000) }} />}
      {uploadOpen && <UploadContentModal studioId={currentStudio?.id} onClose={() => setUploadOpen(false)} onSaved={() => { setUploadOpen(false); setUploadThanks(true); setTimeout(() => setUploadThanks(false), 3500) }} />}
    </div>
  )
}
