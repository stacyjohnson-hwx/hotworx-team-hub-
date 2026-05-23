import { useState, useEffect, useCallback } from 'react'
import { useRole } from '@/hooks/useRole'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import { supabase } from '@/lib/supabase'
import {
  BookOpen, Plus, X, Search, ChevronDown, ChevronUp, Edit2, Trash2,
  History, FileText, Upload, ExternalLink, Clock, Check, AlertCircle, Video,
} from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { value: 'opening-closing', label: 'Opening & Closing' },
  { value: 'cleaning',        label: 'Cleaning' },
  { value: 'member-experience', label: 'Member Experience' },
  { value: 'sales',           label: 'Sales' },
  { value: 'equipment',       label: 'Equipment' },
  { value: 'emergency',       label: 'Emergency' },
  { value: 'general',         label: 'General' },
]

function catLabel(val) {
  return CATEGORIES.find(c => c.value === val)?.label || val
}

function fmtDate(str) {
  if (!str) return ''
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── SOP Edit / Create Modal ──────────────────────────────────────────────────
function SopModal({ sop, onSave, onClose }) {
  const [form, setForm] = useState({
    title: sop?.title || '',
    category: sop?.category || 'general',
    content: sop?.content || '',
    video_url: sop?.video_url || '',
  })
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const ACCEPTED_TYPES = '.pdf,.png,.jpg,.jpeg'
  const ACCEPTED_MIME = ['application/pdf', 'image/png', 'image/jpeg']

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required'); return }
    setSaving(true)
    setError('')
    try {
      let pdfPath = sop?.pdf_path || null

      // Upload file if a new one was selected
      if (file) {
        if (!ACCEPTED_MIME.includes(file.type)) {
          setError('Only PDF, PNG, and JPEG files are supported.')
          setSaving(false)
          return
        }
        setUploading(true)
        const ext = file.name.split('.').pop().toLowerCase()
        const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('sop-documents')
          .upload(path, file, { contentType: file.type })
        setUploading(false)
        if (upErr) throw new Error('File upload failed: ' + upErr.message)
        pdfPath = path
      }

      const payload = {
        ...form,
        video_url: form.video_url.trim() || null,
        pdf_path: pdfPath,
      }
      const saved = sop?.id
        ? await apiPut(`/api/sops/${sop.id}`, payload)
        : await apiPost('/api/sops', payload)
      onSave(saved)
    } catch (err) {
      setError(err.message || 'Save failed')
    } finally {
      setSaving(false)
      setUploading(false)
    }
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-gray-900 font-semibold">{sop ? 'Edit SOP' : 'New SOP'}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
              <input
                className={inputCls}
                value={form.title}
                onChange={e => set('title', e.target.value)}
                placeholder="e.g. Opening Checklist Procedure"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <select className={inputCls} value={form.category} onChange={e => set('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Attachment <span className="text-gray-400 font-normal">(PDF, PNG, or JPEG — optional)</span>
              </label>
              <label className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 text-sm text-gray-600">
                <Upload size={14} className="text-gray-400" />
                {file ? file.name : sop?.pdf_path ? 'Replace file…' : 'Upload file…'}
                <input
                  type="file" accept={ACCEPTED_TYPES} className="hidden"
                  onChange={e => setFile(e.target.files[0] || null)}
                />
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Video Link <span className="text-gray-400 font-normal">(YouTube, Loom, etc. — optional)</span>
            </label>
            <input
              className={inputCls}
              type="url"
              value={form.video_url}
              onChange={e => set('video_url', e.target.value)}
              placeholder="https://youtube.com/watch?v=…"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Procedure Content
            </label>
            <textarea
              rows={14}
              className={`${inputCls} resize-y font-mono text-xs leading-relaxed`}
              value={form.content}
              onChange={e => set('content', e.target.value)}
              placeholder={`Write the step-by-step procedure here.\n\nTip: Use blank lines between steps for readability.\n\n1. First step\n2. Second step\n   - Sub-step detail\n3. Third step`}
            />
            <p className="text-xs text-gray-400 mt-1">Plain text with line breaks. Use numbered steps for procedures.</p>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex-shrink-0">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium">
            Cancel
          </button>
          <button type="submit" disabled={saving || uploading}
            className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
            {uploading ? 'Uploading…' : saving ? 'Saving…' : sop ? 'Save Changes' : 'Create SOP'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Version History Drawer ───────────────────────────────────────────────────
function VersionHistory({ sopId, currentVersion, onClose, onRestoreVersion }) {
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    apiGet(`/api/sops/${sopId}/versions`)
      .then(setVersions)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [sopId])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[70vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-gray-900 font-semibold flex items-center gap-2">
            <History size={16} className="text-gray-400" /> Version History
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {loading && <p className="text-sm text-gray-500 text-center py-8">Loading…</p>}
          {!loading && versions.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-8">No previous versions saved yet.</p>
          )}
          {versions.map(v => (
            <div key={v.id} className="border border-gray-200 rounded-lg overflow-hidden">
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpanded(expanded === v.id ? null : v.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                    v{v.version}
                  </span>
                  <span className="text-sm text-gray-700">{fmtDate(v.updated_at)}</span>
                  <span className="text-xs text-gray-400">by {v.updated_by_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={e => { e.stopPropagation(); onRestoreVersion(v.content); onClose() }}
                    className="text-xs text-red-600 hover:text-red-700 font-medium"
                  >
                    Restore
                  </button>
                  {expanded === v.id ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                </div>
              </div>
              {expanded === v.id && (
                <div className="px-4 pb-3 bg-gray-50 border-t border-gray-100">
                  <pre className="text-xs text-gray-600 font-mono leading-relaxed whitespace-pre-wrap mt-2">
                    {v.content || '(empty)'}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── SOP Card ─────────────────────────────────────────────────────────────────
function SopCard({ sop, isOwnerOrManager, onEdit, onDelete, onViewHistory }) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pdfUrl, setPdfUrl] = useState(null)

  // Get signed URL for PDF if attached
  useEffect(() => {
    if (sop.pdf_path && expanded) {
      supabase.storage
        .from('sop-documents')
        .createSignedUrl(sop.pdf_path, 3600)
        .then(({ data }) => { if (data?.signedUrl) setPdfUrl(data.signedUrl) })
    }
  }, [sop.pdf_path, expanded])

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <FileText size={16} className="text-red-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-gray-900 text-sm font-semibold truncate">{sop.title}</p>
          <p className="text-gray-500 text-xs mt-0.5">
            {catLabel(sop.category)}
            {' · '}v{sop.version}
            {sop.updated_at && <> · Updated {fmtDate(sop.updated_at)}</>}
            {sop.updated_by_name && <> by {sop.updated_by_name}</>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {sop.video_url && (
            <span className="text-xs text-red-500 bg-red-50 px-1.5 py-0.5 rounded border border-red-200 flex items-center gap-1">
              <Video size={10} /> Video
            </span>
          )}
          {sop.pdf_path && (
            <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
              {/\.(png|jpe?g)$/i.test(sop.pdf_path) ? 'Image' : 'PDF'}
            </span>
          )}
          {expanded ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100">
          {/* Content */}
          {sop.content ? (
            <div className="px-5 py-4 bg-gray-50">
              <pre className="text-sm text-gray-700 font-sans leading-relaxed whitespace-pre-wrap">
                {sop.content}
              </pre>
            </div>
          ) : (
            <div className="px-5 py-4 bg-gray-50 text-sm text-gray-400 italic">
              No written content yet.
            </div>
          )}

          {/* Attachment link (PDF / image) */}
          {sop.pdf_path && (
            <div className="px-5 py-3 border-t border-gray-100 bg-white">
              {pdfUrl ? (
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 font-medium"
                >
                  <ExternalLink size={14} />
                  {/\.(png|jpe?g)$/i.test(sop.pdf_path) ? 'View Image' : 'Open PDF Document'}
                </a>
              ) : (
                <span className="text-sm text-gray-400">Loading file link…</span>
              )}
            </div>
          )}

          {/* Video link */}
          {sop.video_url && (
            <div className="px-5 py-3 border-t border-gray-100 bg-white">
              <a
                href={sop.video_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 font-medium"
              >
                <Video size={14} /> Watch Video
              </a>
            </div>
          )}

          {/* Actions */}
          {isOwnerOrManager && (
            <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 bg-white">
              <button
                onClick={() => onEdit(sop)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Edit2 size={12} /> Edit
              </button>
              <button
                onClick={() => onViewHistory(sop)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <History size={12} /> Version History
              </button>
              <div className="ml-auto">
                {confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Delete this SOP?</span>
                    <button onClick={() => onDelete(sop.id)}
                      className="px-2.5 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700">
                      Yes, delete
                    </button>
                    <button onClick={() => setConfirmDelete(false)}
                      className="text-xs text-gray-500 hover:text-gray-800 px-2">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={12} /> Delete
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SopsPage() {
  const { role } = useRole()
  const isOwnerOrManager = role === 'owner' || role === 'manager'

  const [sops, setSops] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [modal, setModal] = useState(null)       // null=closed, false=new, sop=edit
  const [historyFor, setHistoryFor] = useState(null)
  const [restoreTarget, setRestoreTarget] = useState(null)

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (catFilter) params.set('category', catFilter)
      const qs = params.toString()
      const data = await apiGet(`/api/sops${qs ? '?' + qs : ''}`)
      setSops(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [catFilter])

  useEffect(() => { load() }, [load])

  // Client-side search filter
  const visible = sops.filter(s =>
    !search || s.title.toLowerCase().includes(search.toLowerCase())
  )

  // Group by category
  const grouped = CATEGORIES.reduce((acc, cat) => {
    const items = visible.filter(s => s.category === cat.value)
    if (items.length) acc.push({ cat, items })
    return acc
  }, [])

  const handleSave = (saved) => {
    setSops(prev => {
      const idx = prev.findIndex(s => s.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]; next[idx] = { ...prev[idx], ...saved }; return next
      }
      return [...prev, saved]
    })
    setModal(null)
  }

  const handleDelete = async (id) => {
    await apiDelete(`/api/sops/${id}`)
    setSops(prev => prev.filter(s => s.id !== id))
  }

  const handleRestoreVersion = (content) => {
    if (historyFor) {
      setRestoreTarget({ sop: historyFor, content })
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="p-6 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BookOpen size={22} className="text-red-600" /> SOPs
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {sops.length} procedure{sops.length !== 1 ? 's' : ''} · Standard operating procedures
          </p>
        </div>
        {isOwnerOrManager && (
          <button
            onClick={() => setModal(false)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
          >
            <Plus size={16} /> New SOP
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* Search + Filter bar */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:border-red-500"
            placeholder="Search SOPs…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:border-red-500"
          value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
        >
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {/* SOPs grouped by category */}
      {visible.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <BookOpen size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium text-gray-500">
            {search ? 'No SOPs match your search' : 'No SOPs yet'}
          </p>
          {isOwnerOrManager && !search && (
            <p className="text-xs mt-1">Click "New SOP" to create your first procedure.</p>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ cat, items }) => (
            <div key={cat.value}>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {cat.label}
              </h2>
              <div className="space-y-2">
                {items.map(sop => (
                  <SopCard
                    key={sop.id}
                    sop={sop}
                    isOwnerOrManager={isOwnerOrManager}
                    onEdit={setModal}
                    onDelete={handleDelete}
                    onViewHistory={setHistoryFor}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {modal !== null && (
        <SopModal
          sop={modal || null}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {/* Restore from version — opens editor pre-filled */}
      {restoreTarget && (
        <SopModal
          sop={{ ...restoreTarget.sop, content: restoreTarget.content }}
          onSave={(saved) => { handleSave(saved); setRestoreTarget(null) }}
          onClose={() => setRestoreTarget(null)}
        />
      )}

      {/* Version History Drawer */}
      {historyFor && (
        <VersionHistory
          sopId={historyFor.id}
          currentVersion={historyFor.version}
          onClose={() => setHistoryFor(null)}
          onRestoreVersion={handleRestoreVersion}
        />
      )}
    </div>
  )
}
