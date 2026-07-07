import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useStudio } from '@/contexts/StudioContext'
import { supabase } from '@/lib/supabase'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import {
  Megaphone, ImagePlus, X, Loader2, Bold, Italic, Underline, List,
  ChevronLeft, ChevronRight, Pin, MoreHorizontal, Pencil, Trash2, Send,
} from 'lucide-react'

const REACTION_EMOJI = ['❤️', '🔥', '👏', '💪', '🎉', '😂']
const QUICK_EMOJI    = ['🔥', '🎉', '💪', '👏', '❤️', '😂', '🧡', '⭐', '🏆', '📣']

function timeAgo(dateStr) {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (secs < 60) return 'Just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ─── Instagram-style avatar with gradient story ring ─────────────────────────
function Avatar({ name, url, size = 38 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div
      className="rounded-full p-[2px] bg-gradient-to-tr from-yellow-400 via-[#E8611A] to-pink-600 flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <div className="w-full h-full rounded-full bg-white p-[2px]">
        {url ? (
          <img src={url} alt="" className="w-full h-full rounded-full object-cover" />
        ) : (
          <div className="w-full h-full rounded-full bg-gradient-to-br from-[#1A1A1A] to-gray-700 flex items-center justify-center">
            <span className="text-white font-bold" style={{ fontSize: size * 0.32 }}>{initials}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Composer: rich text + photos ─────────────────────────────────────────────
function Composer({ post, onPosted, onCancel }) {
  const { user } = useAuth()
  const { currentStudio } = useStudio()
  const isEdit = !!post
  const [images, setImages]       = useState(post?.images || [])
  const [uploading, setUploading] = useState(false)
  const [posting, setPosting]     = useState(false)
  const [hasText, setHasText]     = useState(!!post?.content_html)
  const editorRef = useRef(null)
  const fileRef   = useRef(null)

  useEffect(() => {
    if (editorRef.current && post?.content_html) editorRef.current.innerHTML = post.content_html
    editorRef.current?.focus()
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const exec = (cmd) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, null)
  }

  const insertEmoji = (emoji) => {
    editorRef.current?.focus()
    document.execCommand('insertText', false, emoji)
    setHasText(true)
  }

  // Paste as plain text so pasted content doesn't drag in outside styling
  const onPaste = (e) => {
    e.preventDefault()
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
  }

  const onPickFiles = async (e) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image'))
    if (fileRef.current) fileRef.current.value = ''
    if (!files.length || !currentStudio?.id) return
    setUploading(true)
    try {
      const uploaded = []
      for (const file of files) {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${currentStudio.id}/announcements/${Date.now()}-${safe}`
        const { error } = await supabase.storage.from('marketing-content').upload(path, file, { upsert: false, contentType: file.type })
        if (error) throw error
        const { data: { publicUrl } } = supabase.storage.from('marketing-content').getPublicUrl(path)
        uploaded.push({ url: publicUrl, path })
      }
      setImages(prev => [...prev, ...uploaded])
    } catch (err) { alert('Photo upload failed: ' + (err?.message || 'error')) }
    finally { setUploading(false) }
  }

  const submit = async () => {
    const html = editorRef.current?.innerHTML || ''
    const plain = html.replace(/<[^>]*>/g, '').trim()
    if (!plain && !images.length) return
    setPosting(true)
    try {
      const body = { content_html: html, images }
      const saved = isEdit
        ? await apiPut(`/api/announcements/${post.id}`, body)
        : await apiPost('/api/announcements', body)
      onPosted(saved)
    } catch (err) { alert('Post failed: ' + err.message); setPosting(false) }
  }

  const authorName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'You'

  return (
    <div className="bg-white rounded-2xl border-2 border-orange-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 pt-3.5">
        <Avatar name={authorName} size={34} />
        <div className="flex-1">
          <p className="text-sm font-bold text-gray-900 leading-tight">{authorName}</p>
          <p className="text-[11px] text-gray-400">{isEdit ? 'Editing update' : 'Posting to the team feed'}</p>
        </div>
        <button onClick={onCancel} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
          <X size={16} />
        </button>
      </div>

      {/* Editor */}
      <div className="px-4 pt-3">
        <div
          ref={editorRef}
          contentEditable
          onPaste={onPaste}
          onInput={e => setHasText(!!e.currentTarget.textContent.trim())}
          data-placeholder="What's happening at the studio? 📣"
          className="announcement-editor min-h-[80px] max-h-64 overflow-y-auto text-sm text-gray-800 leading-relaxed focus:outline-none"
        />
      </div>

      {/* Image previews */}
      {images.length > 0 && (
        <div className="px-4 pt-3 flex gap-2 flex-wrap">
          {images.map((img, i) => (
            <div key={img.path || i} className="relative group">
              <img src={img.url} alt="" className="w-20 h-20 rounded-xl object-cover border border-gray-200" />
              <button
                onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                className="absolute -top-1.5 -right-1.5 bg-gray-900 text-white rounded-full p-0.5 shadow opacity-0 group-hover:opacity-100 transition-opacity">
                <X size={12} />
              </button>
            </div>
          ))}
          {uploading && (
            <div className="w-20 h-20 rounded-xl border border-dashed border-gray-300 flex items-center justify-center">
              <Loader2 size={18} className="animate-spin text-gray-400" />
            </div>
          )}
        </div>
      )}

      {/* Emoji quick row */}
      <div className="px-4 pt-3 flex gap-1 flex-wrap">
        {QUICK_EMOJI.map(e => (
          <button key={e} onMouseDown={ev => ev.preventDefault()} onClick={() => insertEmoji(e)}
            className="w-8 h-8 rounded-lg text-lg hover:bg-orange-50 hover:scale-125 transition-transform">
            {e}
          </button>
        ))}
      </div>

      {/* Toolbar + actions */}
      <div className="mt-3 px-3 py-2.5 border-t border-gray-100 flex items-center gap-1">
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPickFiles} className="hidden" />
        {[
          { icon: Bold,      cmd: 'bold',                 label: 'Bold' },
          { icon: Italic,    cmd: 'italic',               label: 'Italic' },
          { icon: Underline, cmd: 'underline',            label: 'Underline' },
          { icon: List,      cmd: 'insertUnorderedList',  label: 'Bullet list' },
        ].map(({ icon: Icon, cmd, label }) => (
          <button key={cmd} title={label}
            onMouseDown={e => e.preventDefault()}
            onClick={() => exec(cmd)}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors">
            <Icon size={15} />
          </button>
        ))}
        <button
          title="Add photos"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="p-2 rounded-lg text-[#E8611A] hover:bg-orange-50 transition-colors disabled:opacity-50">
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
        </button>
        <div className="flex-1" />
        <button
          onClick={submit}
          disabled={posting || uploading || (!hasText && !images.length)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#E8611A] to-pink-600 text-white text-sm font-bold shadow-sm hover:shadow-md hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
          {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          {isEdit ? 'Save' : 'Post'}
        </button>
      </div>
    </div>
  )
}

// ─── Image carousel with double-tap-to-heart ──────────────────────────────────
function ImageCarousel({ images, onDoubleTapHeart }) {
  const [index, setIndex]     = useState(0)
  const [heartPop, setHeartPop] = useState(false)

  const heart = () => {
    setHeartPop(true)
    setTimeout(() => setHeartPop(false), 900)
    onDoubleTapHeart()
  }

  return (
    <div className="relative bg-black/5 select-none">
      <div className="overflow-hidden">
        <div className="flex transition-transform duration-300 ease-out" style={{ transform: `translateX(-${index * 100}%)` }}>
          {images.map((img, i) => (
            <img key={img.path || i} src={img.url} alt="" draggable={false}
              onDoubleClick={heart}
              className="w-full flex-shrink-0 object-cover max-h-[440px] cursor-pointer" />
          ))}
        </div>
      </div>

      {/* Double-tap heart burst */}
      {heartPop && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="announcement-heart-pop text-7xl drop-shadow-lg">❤️</span>
        </div>
      )}

      {images.length > 1 && (
        <>
          {index > 0 && (
            <button onClick={() => setIndex(i => i - 1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/85 rounded-full p-1.5 shadow hover:bg-white">
              <ChevronLeft size={16} />
            </button>
          )}
          {index < images.length - 1 && (
            <button onClick={() => setIndex(i => i + 1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/85 rounded-full p-1.5 shadow hover:bg-white">
              <ChevronRight size={16} />
            </button>
          )}
          <div className="absolute top-3 right-3 bg-black/60 text-white text-[11px] font-semibold rounded-full px-2 py-0.5">
            {index + 1}/{images.length}
          </div>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {images.map((_, i) => (
              <button key={i} onClick={() => setIndex(i)}
                className={`w-1.5 h-1.5 rounded-full transition-all ${i === index ? 'bg-white w-4' : 'bg-white/50'}`} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Single post card ─────────────────────────────────────────────────────────
function PostCard({ post, isManager, isAuthor, onReact, onPin, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const totalReactions = (post.reactions || []).reduce((s, r) => s + r.count, 0)
  const canModify = isManager || isAuthor  // author edits/deletes own; managers moderate all

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3">
        <Avatar name={post.author_name} url={post.author_avatar} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-900 leading-tight truncate">{post.author_name}</p>
          <p className="text-[11px] text-gray-400">
            {timeAgo(post.created_at)}
            {post.updated_at && post.created_at && new Date(post.updated_at) - new Date(post.created_at) > 60000 && ' · edited'}
          </p>
        </div>
        {post.pinned && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-orange-50 text-[#E8611A] border border-orange-200 rounded-full px-2 py-0.5">
            <Pin size={9} /> Pinned
          </span>
        )}
        {canModify && (
          <div className="relative">
            <button onClick={() => setMenuOpen(o => !o)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-8 z-20 bg-white rounded-xl border border-gray-100 shadow-lg py-1 w-36">
                  {isManager && (
                    <button onClick={() => { setMenuOpen(false); onPin(post) }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">
                      <Pin size={12} /> {post.pinned ? 'Unpin' : 'Pin to top'}
                    </button>
                  )}
                  <button onClick={() => { setMenuOpen(false); onEdit(post) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50">
                    <Pencil size={12} /> Edit
                  </button>
                  <button onClick={() => { setMenuOpen(false); onDelete(post) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50">
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Images */}
      {post.images?.length > 0 && (
        <ImageCarousel images={post.images} onDoubleTapHeart={() => onReact(post, '❤️', true)} />
      )}

      {/* Rich text content */}
      {post.content_html && post.content_html.replace(/<[^>]*>/g, '').trim() && (
        <div
          className="announcement-content px-4 pt-3 text-sm text-gray-800 leading-relaxed break-words"
          dangerouslySetInnerHTML={{ __html: post.content_html }}
        />
      )}

      {/* Reaction bar */}
      <div className="px-4 py-3 flex items-center gap-1.5 flex-wrap">
        {REACTION_EMOJI.map(emoji => {
          const r = (post.reactions || []).find(x => x.emoji === emoji)
          const count = r?.count || 0
          const mine  = r?.mine
          return (
            <button
              key={emoji}
              onClick={() => onReact(post, emoji)}
              title={r?.names?.join(', ') || `React with ${emoji}`}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-sm transition-all hover:scale-110 active:scale-95 ${
                mine
                  ? 'bg-orange-50 border-orange-300 shadow-sm'
                  : count > 0
                    ? 'bg-gray-50 border-gray-200'
                    : 'bg-white border-transparent opacity-45 hover:opacity-100 hover:border-gray-200'
              }`}
            >
              <span>{emoji}</span>
              {count > 0 && <span className={`text-[11px] font-bold ${mine ? 'text-[#E8611A]' : 'text-gray-500'}`}>{count}</span>}
            </button>
          )
        })}
        {totalReactions > 0 && (
          <span className="ml-auto text-[11px] text-gray-400 font-medium">
            {totalReactions} reaction{totalReactions > 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Announcements feed section ───────────────────────────────────────────────
export default function Announcements({ role }) {
  const { user } = useAuth()
  const { currentStudio } = useStudio()
  const [posts, setPosts]       = useState(null)
  const [composing, setComposing] = useState(false)  // false | true (new) | post object (edit)
  const [showAll, setShowAll]   = useState(false)
  const canPost   = true  // any team member can post to the feed
  const isManager = role === 'owner' || role === 'manager'

  useEffect(() => {
    setPosts(null)
    apiGet('/api/announcements').then(setPosts).catch(() => setPosts([]))
  }, [currentStudio?.id])

  const refresh = () => apiGet('/api/announcements').then(setPosts).catch(() => {})

  const handlePosted = () => { setComposing(false); refresh() }

  // Optimistic emoji toggle; skipIfMine covers double-tap so it never un-hearts
  const handleReact = async (post, emoji, skipIfMine = false) => {
    const existing = (post.reactions || []).find(r => r.emoji === emoji)
    if (skipIfMine && existing?.mine) return
    setPosts(prev => prev.map(p => {
      if (p.id !== post.id) return p
      const reactions = [...(p.reactions || [])]
      const idx = reactions.findIndex(r => r.emoji === emoji)
      if (idx >= 0) {
        const r = reactions[idx]
        const next = { ...r, mine: !r.mine, count: r.count + (r.mine ? -1 : 1) }
        if (next.count <= 0) reactions.splice(idx, 1)
        else reactions[idx] = next
      } else {
        reactions.push({ emoji, count: 1, mine: true, names: [] })
      }
      return { ...p, reactions }
    }))
    try { await apiPost(`/api/announcements/${post.id}/react`, { emoji }) }
    catch { refresh() }
  }

  const handlePin = async (post) => {
    try { await apiPost(`/api/announcements/${post.id}/pin`, {}); refresh() }
    catch (err) { alert('Pin failed: ' + err.message) }
  }

  const handleDelete = async (post) => {
    if (!window.confirm('Delete this announcement?')) return
    try {
      await apiDelete(`/api/announcements/${post.id}`)
      setPosts(prev => prev.filter(p => p.id !== post.id))
    } catch (err) { alert('Delete failed: ' + err.message) }
  }

  const visible = showAll ? posts : posts?.slice(0, 4)

  return (
    <div className="w-full">
      {/* Editor + heart animation styles */}
      <style>{`
        .announcement-editor:empty:before { content: attr(data-placeholder); color: #9ca3af; pointer-events: none; }
        .announcement-editor ul, .announcement-content ul { list-style: disc; padding-left: 1.25rem; }
        .announcement-content a { color: #E8611A; text-decoration: underline; }
        @keyframes announcement-heart {
          0%   { transform: scale(0);   opacity: 0; }
          25%  { transform: scale(1.3); opacity: 1; }
          45%  { transform: scale(1);   opacity: 1; }
          80%  { transform: scale(1);   opacity: 1; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        .announcement-heart-pop { animation: announcement-heart 0.9s ease-in-out forwards; }
      `}</style>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-gradient-to-tr from-yellow-400 via-[#E8611A] to-pink-600 flex items-center justify-center">
            <Megaphone size={13} className="text-white" />
          </span>
          Team Feed
        </h2>
      </div>

      <div className="space-y-4">
        {/* Composer trigger / composer */}
        {canPost && (
          composing ? (
            <Composer
              post={composing === true ? null : composing}
              onPosted={handlePosted}
              onCancel={() => setComposing(false)}
            />
          ) : (
            <button
              onClick={() => setComposing(true)}
              className="w-full flex items-center gap-3 bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 text-left hover:border-orange-200 hover:shadow transition-all group">
              <span className="w-9 h-9 rounded-full bg-gradient-to-tr from-yellow-400 via-[#E8611A] to-pink-600 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                <ImagePlus size={15} className="text-white" />
              </span>
              <span className="text-sm text-gray-400 group-hover:text-gray-500">Share an update with the team… ✨</span>
            </button>
          )
        )}

        {/* Feed */}
        {posts === null ? (
          <div className="flex items-center gap-2 text-gray-400 py-4">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-sm">Loading the feed…</span>
          </div>
        ) : posts.length === 0 ? (
          canPost && (
            <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center">
              <p className="text-3xl mb-2">📣</p>
              <p className="text-sm text-gray-500 font-semibold">No announcements yet</p>
              <p className="text-xs text-gray-400 mt-1">Share wins, shout-outs, promos, and studio news — the team sees it right here</p>
            </div>
          )
        ) : (
          <>
            {visible.map(post => (
              <PostCard
                key={post.id}
                post={post}
                isManager={isManager}
                isAuthor={post.author_id === user?.id}
                onReact={handleReact}
                onPin={handlePin}
                onEdit={p => setComposing(p)}
                onDelete={handleDelete}
              />
            ))}
            {!showAll && posts.length > 4 && (
              <button
                onClick={() => setShowAll(true)}
                className="w-full py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-500 hover:bg-gray-50 transition-colors">
                View {posts.length - 4} older update{posts.length - 4 > 1 ? 's' : ''}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
