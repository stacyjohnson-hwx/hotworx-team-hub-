import { useState, useMemo, useRef } from 'react'
import { apiPost, apiPut } from '@/hooks/useApi'
import { supabase } from '@/lib/supabase'
import MemberTagPicker from '@/components/MemberTagPicker'
import {
  Check, Plus, X, Trash2, Loader2, UploadCloud, Megaphone, Image as ImageIcon,
} from 'lucide-react'

// Shared social-post calendar. Used by the Monthly Planner and the Social
// Analytics "Calendar" tab so both render exactly the same thing from the same
// data (monthly_plans.content.social_posts).
//
// Props: posts, onChange(nextPosts), year, month, studioId, suggestions[], readOnly

const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const pad = n => String(n).padStart(2, '0')
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`
const daysInMonth = (y, m) => new Date(y, m, 0).getDate()
const monthStartDate = (y, m) => ymd(y, m, 1)
const monthEndDate = (y, m) => ymd(y, m, daysInMonth(y, m))
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

function PostChip({ p, onToggle, onRemove, onDragStart, onOpen, compact, readOnly }) {
  const media = (p.assets || []).length
  return (
    <div draggable={!readOnly} onDragStart={e => !readOnly && onDragStart(e, p.id)}
      title={p.text}
      className={`group flex items-center gap-1 rounded border px-1.5 py-0.5 ${readOnly ? '' : 'cursor-grab active:cursor-grabbing'} ${
        p.checked ? 'bg-gray-100 border-gray-200' : 'bg-sky-50 border-sky-200'}`}>
      <button onClick={() => onToggle(p.id)}
        className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 ${p.checked ? 'bg-green-500 border-green-500' : 'border-sky-400 bg-white'}`}>
        {p.checked && <Check size={9} className="text-white" />}
      </button>
      <button onClick={() => onOpen(p.id)}
        className={`text-[11px] leading-tight truncate text-left ${compact ? 'max-w-[86px]' : 'max-w-[210px]'} ${p.checked ? 'text-gray-400 line-through' : 'text-sky-900 hover:underline'}`}>
        {p.text}
      </button>
      {media > 0 && <ImageIcon size={9} className="text-sky-500 flex-shrink-0" />}
      {!readOnly && (
        <button onClick={() => onRemove(p.id)} className="text-gray-300 hover:text-red-500 text-[10px] opacity-0 group-hover:opacity-100 flex-shrink-0">✕</button>
      )}
    </div>
  )
}

// Post detail — description, link, caption, media + member tags.
function PostModal({ post, onClose, onChange, onRemove, studioId }) {
  const [f, setF] = useState({
    text: post.text || '', description: post.description || '', link: post.link || '',
    caption: post.caption || '', date: post.date || '',
  })
  const [tags, setTags] = useState(post.member_tags || [])
  const [assets, setAssets] = useState(post.assets || [])
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef(null)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500'

  // Upload straight into the shared content library so it lands in Marketing
  // content and on the tagged members' pages.
  const upload = async (e) => {
    const files = Array.from(e.target.files || [])
    if (fileRef.current) fileRef.current.value = ''
    if (!files.length) return
    setUploading(true); setErr('')
    try {
      const added = []
      for (const file of files) {
        const isVideo = file.type.startsWith('video')
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${studioId || 'studio'}/planner/${Date.now()}-${safe}`
        const { error } = await supabase.storage.from('marketing-content').upload(path, file, { upsert: false, contentType: file.type })
        if (error) throw error
        const { data: { publicUrl } } = supabase.storage.from('marketing-content').getPublicUrl(path)
        const asset = await apiPost('/api/marketing/content', {
          file_url: publicUrl, file_path: path,
          file_type: isVideo ? 'video' : 'photo',
          category: isVideo ? 'member_videos' : 'member_photos',
          caption: f.caption || f.text || null,
          member_ids: tags.map(t => t.id),
        })
        added.push({ url: publicUrl, path, type: isVideo ? 'video' : 'photo', content_id: asset?.id || null })
      }
      setAssets(a => [...a, ...added])
    } catch (e2) { setErr(e2?.message || 'Upload failed — try a smaller file.') }
    finally { setUploading(false) }
  }

  const save = async () => {
    await Promise.all(assets.filter(a => a.content_id).map(a =>
      apiPut(`/api/marketing/content/${a.content_id}/tags`, { member_ids: tags.map(t => t.id) }).catch(() => {})
    ))
    onChange(post.id, { ...f, date: f.date || null, member_tags: tags, assets })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="font-bold text-gray-900 flex items-center gap-2"><Megaphone size={17} className="text-sky-600" /> Social post</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{err}</div>}

          <div><span className="text-[11px] font-semibold text-gray-500 uppercase">Post</span>
            <input className={inp} value={f.text} onChange={e => set('text', e.target.value)} placeholder="What are we posting?" /></div>

          <div><span className="text-[11px] font-semibold text-gray-500 uppercase">Date</span>
            <input type="date" className={inp} value={f.date || ''} onChange={e => set('date', e.target.value)} /></div>

          <div><span className="text-[11px] font-semibold text-gray-500 uppercase">Description</span>
            <textarea rows={2} className={inp} value={f.description} onChange={e => set('description', e.target.value)} placeholder="What's the idea / angle?" /></div>

          <div><span className="text-[11px] font-semibold text-gray-500 uppercase">Caption</span>
            <textarea rows={3} className={inp} value={f.caption} onChange={e => set('caption', e.target.value)} placeholder="The caption to post…" /></div>

          <div><span className="text-[11px] font-semibold text-gray-500 uppercase">Link</span>
            <input className={inp} value={f.link} onChange={e => set('link', e.target.value)} placeholder="https://…" /></div>

          <div>
            <span className="text-[11px] font-semibold text-gray-500 uppercase">Tag members</span>
            <MemberTagPicker value={tags} onChange={setTags} placeholder="Search members…" />
            <p className="text-[11px] text-gray-400 mt-1">Tagged members get this photo/video on their member page.</p>
          </div>

          <div>
            <span className="text-[11px] font-semibold text-gray-500 uppercase">Photos / videos</span>
            {assets.length > 0 && (
              <div className="flex flex-wrap gap-2 my-2">
                {assets.map((a, i) => (
                  <div key={i} className="relative group">
                    {a.type === 'video'
                      ? <video src={a.url} className="w-20 h-20 object-cover rounded-lg border border-gray-200" />
                      : <img src={a.url} alt="" className="w-20 h-20 object-cover rounded-lg border border-gray-200" />}
                    <button onClick={() => setAssets(list => list.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 bg-white border border-gray-300 rounded-full w-5 h-5 text-xs text-gray-500 hover:text-red-600 opacity-0 group-hover:opacity-100">✕</button>
                  </div>
                ))}
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*,video/*" multiple capture="environment" onChange={upload} className="hidden" />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="mt-1 w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 hover:border-sky-400 rounded-lg py-3 text-sm text-gray-500 disabled:opacity-50">
              {uploading ? <><Loader2 size={15} className="animate-spin" /> Uploading…</> : <><UploadCloud size={15} /> Add photo or video</>}
            </button>
            <p className="text-[11px] text-gray-400 mt-1">Uploads go straight into the Marketing content library.</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl sticky bottom-0">
          <button onClick={() => { onRemove(post.id); onClose() }} className="text-sm text-gray-400 hover:text-red-600 font-medium flex items-center gap-1">
            <Trash2 size={14} /> Delete
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 font-medium">Cancel</button>
            <button onClick={save} disabled={uploading} className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50">Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SocialPostCalendar({ posts = [], onChange, year, month, studioId, suggestions = [] }) {
  const [text, setText] = useState('')
  const [dragOver, setDragOver] = useState(null)   // 'backlog' | 'YYYY-MM-DD'
  const [openId, setOpenId] = useState(null)

  const save = (next) => onChange(next)
  const add = (t) => { if (!t.trim()) return; save([...posts, { id: uid(), text: t.trim(), checked: false, date: null }]); setText('') }
  const toggle = (id) => save(posts.map(p => p.id === id ? { ...p, checked: !p.checked } : p))
  const remove = (id) => save(posts.filter(p => p.id !== id))
  const setDate = (id, date) => save(posts.map(p => p.id === id ? { ...p, date } : p))
  const updatePost = (id, patch) => save(posts.map(p => p.id === id ? { ...p, ...patch } : p))
  const openPost = posts.find(p => p.id === openId) || null

  const onDragStart = (e, id) => { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move' }
  const onDrop = (e, date) => {
    e.preventDefault(); setDragOver(null)
    const id = e.dataTransfer.getData('text/plain')
    if (id) setDate(id, date)
  }
  const allowDrop = (e, key) => { e.preventDefault(); setDragOver(key) }

  const fresh = suggestions.filter(s => !posts.some(p => p.text === s)).slice(0, 5)
  const backlog = posts.filter(p => !p.date)
  const byDate = useMemo(() => {
    const m = {}
    for (const p of posts) if (p.date) (m[p.date] = m[p.date] || []).push(p)
    return m
  }, [posts])

  const dim = daysInMonth(year, month)
  const lead = new Date(year, month - 1, 1).getDay()
  const cells = [...Array(lead).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <>
      {openPost && (
        <PostModal post={openPost} studioId={studioId} onClose={() => setOpenId(null)}
          onChange={updatePost} onRemove={remove} />
      )}

      {/* add + suggestions */}
      <div className="flex gap-2 mb-2">
        <input className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-red-500"
          placeholder="Add a post to make…" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(text) }} />
        <button onClick={() => add(text)} className="px-3 py-1.5 bg-gray-800 hover:bg-black text-white text-sm font-semibold rounded-lg flex items-center gap-1"><Plus size={14} /> Add</button>
      </div>
      {fresh.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {fresh.map(s => <button key={s} onClick={() => add(s)} className="text-xs px-2.5 py-1 bg-sky-50 text-sky-700 border border-sky-200 rounded-full hover:bg-sky-100">+ {s}</button>)}
        </div>
      )}

      {/* unscheduled backlog — drop here to unschedule */}
      <div onDragOver={e => allowDrop(e, 'backlog')} onDragLeave={() => setDragOver(null)} onDrop={e => onDrop(e, null)}
        className={`rounded-lg border-2 border-dashed p-2 mb-3 transition-colors ${dragOver === 'backlog' ? 'border-sky-400 bg-sky-50' : 'border-gray-200'}`}>
        <p className="text-[11px] font-semibold text-gray-500 uppercase mb-1.5">Unscheduled — drag onto a day</p>
        {backlog.length === 0 ? <p className="text-xs text-gray-400">All posts are scheduled.</p> : (
          <div className="flex flex-wrap gap-1.5">
            {backlog.map(p => (
              <div key={p.id} className="flex items-center gap-1">
                <PostChip p={p} onToggle={toggle} onRemove={remove} onDragStart={onDragStart} onOpen={setOpenId} />
                {/* touch-friendly fallback */}
                <input type="date" value="" onChange={e => e.target.value && setDate(p.id, e.target.value)}
                  min={monthStartDate(year, month)} max={monthEndDate(year, month)}
                  title="Pick a day" className="w-[26px] text-[10px] text-transparent bg-transparent border border-gray-200 rounded cursor-pointer" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* month calendar */}
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map(d => <div key={d} className="text-[10px] font-bold text-gray-400 uppercase text-center pb-1">{d}</div>)}
        {cells.map((day, i) => {
          if (!day) return <div key={`b${i}`} className="min-h-[64px] rounded-lg bg-gray-50/50" />
          const date = ymd(year, month, day)
          const dayPosts = byDate[date] || []
          const on = dragOver === date
          return (
            <div key={date} onDragOver={e => allowDrop(e, date)} onDragLeave={() => setDragOver(null)} onDrop={e => onDrop(e, date)}
              className={`min-h-[64px] rounded-lg border p-1 transition-colors ${on ? 'border-sky-400 bg-sky-50' : 'border-gray-200 bg-white'}`}>
              <div className="text-[10px] font-bold text-gray-400 mb-0.5 px-0.5">{day}</div>
              <div className="space-y-0.5">
                {dayPosts.map(p => <PostChip key={p.id} p={p} onToggle={toggle} onRemove={remove} onDragStart={onDragStart} onOpen={setOpenId} compact />)}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
