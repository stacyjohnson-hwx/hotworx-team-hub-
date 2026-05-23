import { useState, useEffect, useCallback } from 'react'
import { useRole } from '@/hooks/useRole'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import {
  GraduationCap, Plus, X, Edit2, Trash2, Check, ExternalLink,
  Play, Link, FileText, Video, BookOpen, Users, AlertCircle,
  LayoutList, ChevronDown, ChevronUp, Calendar,
} from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { value: 'sales',             label: 'Sales Training' },
  { value: 'marketing',         label: 'Marketing' },
  { value: 'member-experience', label: 'Member Experience' },
  { value: 'operations',        label: 'Operations' },
  { value: 'equipment',         label: 'Equipment' },
  { value: 'hotworx-corporate', label: 'HOTWORX Corporate' },
  { value: 'general',           label: 'General' },
]

const RESOURCE_TYPES = [
  { value: 'video',    label: 'Video',    icon: Video },
  { value: 'youtube',  label: 'YouTube',  icon: Play },
  { value: 'link',     label: 'Link',     icon: Link },
  { value: 'document', label: 'Document', icon: FileText },
  { value: 'pdf',      label: 'PDF',      icon: FileText },
]

function catLabel(val) {
  return CATEGORIES.find(c => c.value === val)?.label || val
}

function typeIcon(val) {
  const t = RESOURCE_TYPES.find(r => r.value === val)
  return t ? t.icon : Link
}

function typeBadge(val) {
  const colors = {
    video:    'bg-red-100 text-red-700',
    youtube:  'bg-red-100 text-red-700',
    link:     'bg-blue-100 text-blue-700',
    document: 'bg-purple-100 text-purple-700',
    pdf:      'bg-orange-100 text-orange-700',
  }
  const label = RESOURCE_TYPES.find(r => r.value === val)?.label || 'Link'
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${colors[val] || 'bg-gray-100 text-gray-600'}`}>
      {label}
    </span>
  )
}

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────
function ResourceModal({ resource, onSave, onClose }) {
  const [form, setForm] = useState({
    title:         resource?.title || '',
    category:      resource?.category || 'general',
    description:   resource?.description || '',
    resource_type: resource?.resource_type || 'link',
    url:           resource?.url || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required'); return }
    setSaving(true); setError('')
    try {
      const saved = resource?.id
        ? await apiPut(`/api/training/${resource.id}`, form)
        : await apiPost('/api/training', form)
      onSave(saved)
    } catch (err) {
      setError(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        className="bg-white rounded-xl shadow-xl w-full max-w-lg"
        onClick={e => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-gray-900 font-semibold">
            {resource ? 'Edit Resource' : 'Add Training Resource'}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
            <input
              className={inputCls} value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. HOTWORX Sales Mastery Module 1"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <select className={inputCls} value={form.category} onChange={e => set('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select className={inputCls} value={form.resource_type} onChange={e => set('resource_type', e.target.value)}>
                {RESOURCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">URL / Link</label>
            <input
              className={inputCls} value={form.url}
              onChange={e => set('url', e.target.value)}
              placeholder="https://…"
              type="url"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description <span className="text-gray-400 font-normal">(optional)</span></label>
            <textarea
              rows={2}
              className={`${inputCls} resize-none`}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="What will staff learn from this resource?"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : resource ? 'Save Changes' : 'Add Resource'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Resource Card ────────────────────────────────────────────────────────────
function ResourceCard({ resource, currentUserId, isOwnerOrManager, onEdit, onDelete, onToggleComplete }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [toggling, setToggling] = useState(false)

  const myCompletion = resource.completions?.find(c => c.user_id === currentUserId)
  const completedByMe = !!myCompletion
  const TypeIcon = typeIcon(resource.resource_type)

  const handleToggle = async () => {
    setToggling(true)
    try { await onToggleComplete(resource.id, completedByMe) }
    finally { setToggling(false) }
  }

  return (
    <div className={`bg-white border rounded-xl shadow-sm overflow-hidden transition-all ${
      completedByMe ? 'border-green-200 border-l-4 border-l-green-400' : 'border-gray-200'
    }`}>
      <div className="p-4">
        {/* Top row */}
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 p-2 rounded-lg flex-shrink-0 ${
            completedByMe ? 'bg-green-50' : 'bg-gray-100'
          }`}>
            <TypeIcon size={16} className={completedByMe ? 'text-green-600' : 'text-gray-500'} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 flex-wrap">
              <p className="text-gray-900 text-sm font-semibold leading-snug">{resource.title}</p>
              {typeBadge(resource.resource_type)}
              {completedByMe && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                  <Check size={10} /> Completed
                </span>
              )}
            </div>
            {resource.description && (
              <p className="text-gray-500 text-xs mt-1 leading-relaxed">{resource.description}</p>
            )}
          </div>
        </div>

        {/* Who has completed — owner/manager view */}
        {isOwnerOrManager && resource.completions?.length > 0 && (
          <div className="mt-3 flex items-center gap-1.5 flex-wrap">
            <Users size={12} className="text-gray-400" />
            {resource.completions.map(c => (
              <span key={c.user_id} className="text-xs text-gray-600 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full">
                {c.user_name}
              </span>
            ))}
          </div>
        )}

        {/* Action row */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
          {resource.url && (
            <a
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <ExternalLink size={12} /> Open Resource
            </a>
          )}

          <button
            onClick={handleToggle}
            disabled={toggling}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 ${
              completedByMe
                ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
                : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {toggling ? (
              <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Check size={12} />
            )}
            {completedByMe ? 'Mark Incomplete' : 'Mark Complete'}
          </button>

          {isOwnerOrManager && (
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => onEdit(resource)}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="Edit"
              >
                <Edit2 size={13} />
              </button>
              {confirmDelete ? (
                <div className="flex items-center gap-1">
                  <button onClick={() => onDelete(resource.id)}
                    className="px-2 py-1 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700">Delete</button>
                  <button onClick={() => setConfirmDelete(false)}
                    className="px-2 py-1 text-xs text-gray-500 hover:text-gray-800">Cancel</button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Staff Progress View ──────────────────────────────────────────────────────
function StaffProgressView({ resources }) {
  const [expanded, setExpanded] = useState({})
  const total = resources.length

  // Build a map of userId → { name, completions: [{resourceId, title, category, completed_at}] }
  const staffMap = {}
  resources.forEach(r => {
    (r.completions || []).forEach(c => {
      if (!staffMap[c.user_id]) staffMap[c.user_id] = { name: c.user_name, completions: [] }
      staffMap[c.user_id].completions.push({
        resourceId: r.id,
        title: r.title,
        category: r.category,
        completed_at: c.completed_at,
      })
    })
  })

  const staff = Object.entries(staffMap).map(([id, data]) => ({
    id,
    name: data.name,
    completions: data.completions.sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at)),
  })).sort((a, b) => b.completions.length - a.completions.length)

  const toggle = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }))

  function fmtDate(str) {
    if (!str) return ''
    return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function initials(name) {
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  }

  if (staff.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <Users size={40} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium text-gray-500">No completions recorded yet</p>
        <p className="text-xs mt-1">Staff completions will appear here once they mark resources complete.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {staff.map(member => {
        const pct = total > 0 ? Math.round((member.completions.length / total) * 100) : 0
        const isOpen = expanded[member.id]
        return (
          <div key={member.id} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            {/* Header row */}
            <button
              className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
              onClick={() => toggle(member.id)}
            >
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                {initials(member.name)}
              </div>

              {/* Name + bar */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold text-gray-900">{member.name}</p>
                  <p className="text-xs text-gray-500 ml-3 flex-shrink-0">
                    <span className="font-semibold text-gray-800">{member.completions.length}</span>
                    <span className="text-gray-400"> / {total}</span>
                    <span className="ml-1.5 text-gray-400">({pct}%)</span>
                  </p>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${pct === 100 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              <div className="text-gray-400 flex-shrink-0">
                {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </button>

            {/* Expanded completions list */}
            {isOpen && (
              <div className="border-t border-gray-100">
                {member.completions.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-gray-400 italic">No completions yet.</p>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {member.completions.map(c => (
                      <div key={c.resourceId} className="flex items-center gap-3 px-5 py-2.5">
                        <Check size={13} className="text-green-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 truncate">{c.title}</p>
                          <p className="text-xs text-gray-400">{catLabel(c.category)}</p>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-400 flex-shrink-0">
                          <Calendar size={11} />
                          {fmtDate(c.completed_at)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TrainingPage() {
  const { role, userId } = useRole()
  const isOwnerOrManager = role === 'owner' || role === 'manager'

  const [resources, setResources] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [completionFilter, setCompletionFilter] = useState('all')  // 'all' | 'completed' | 'incomplete'
  const [view, setView]           = useState('library')             // 'library' | 'staff'
  const [modal, setModal]         = useState(null)  // null=closed, false=new, obj=edit

  const load = useCallback(async () => {
    try {
      const data = await apiGet('/api/training')
      setResources(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const visible = resources.filter(r => {
    const catMatch = catFilter === 'all' || r.category === catFilter
    const completedByMe = r.completions?.some(c => c.user_id === userId)
    const completionMatch =
      completionFilter === 'all' ||
      (completionFilter === 'completed' && completedByMe) ||
      (completionFilter === 'incomplete' && !completedByMe)
    return catMatch && completionMatch
  })

  // Group by category
  const grouped = CATEGORIES.reduce((acc, cat) => {
    const items = visible.filter(r => r.category === cat.value)
    if (items.length) acc.push({ cat, items })
    return acc
  }, [])

  const handleSave = (saved) => {
    setResources(prev => {
      const idx = prev.findIndex(r => r.id === saved.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...prev[idx], ...saved }
        return next
      }
      return [...prev, { ...saved, completions: [] }]
    })
    setModal(null)
  }

  const handleDelete = async (id) => {
    await apiDelete(`/api/training/${id}`)
    setResources(prev => prev.filter(r => r.id !== id))
  }

  const handleToggleComplete = async (id, isComplete) => {
    if (isComplete) {
      await apiDelete(`/api/training/${id}/complete`)
      setResources(prev => prev.map(r =>
        r.id === id
          ? { ...r, completions: r.completions.filter(c => c.user_id !== userId) }
          : r
      ))
    } else {
      await apiPost(`/api/training/${id}/complete`, {})
      setResources(prev => prev.map(r =>
        r.id === id
          ? { ...r, completions: [...(r.completions || []), { user_id: userId, user_name: 'You', completed_at: new Date().toISOString() }] }
          : r
      ))
    }
  }

  // My completion stats
  const myCompletedCount = resources.filter(r =>
    r.completions?.some(c => c.user_id === userId)
  ).length

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
            <GraduationCap size={24} className="text-red-600" /> Training Library
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {resources.length} resource{resources.length !== 1 ? 's' : ''}
            {resources.length > 0 && (
              <> · <span className="text-green-600 font-medium">{myCompletedCount} completed</span> by you</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isOwnerOrManager && (
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
              <button
                onClick={() => setView('library')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                  view === 'library' ? 'bg-red-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <LayoutList size={13} /> Library
              </button>
              <button
                onClick={() => setView('staff')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-l border-gray-200 transition-colors ${
                  view === 'staff' ? 'bg-red-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Users size={13} /> Staff Progress
              </button>
            </div>
          )}
          {isOwnerOrManager && (
            <button
              onClick={() => setModal(false)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
            >
              <Plus size={16} /> Add Resource
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* ── Staff Progress View ── */}
      {isOwnerOrManager && view === 'staff' && (
        <StaffProgressView resources={resources} />
      )}

      {/* ── Library View ── */}
      {view === 'library' && <>

      {/* Category filter tabs */}
      <div className="flex gap-2 flex-wrap mb-6">
        <button
          onClick={() => setCatFilter('all')}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
            catFilter === 'all'
              ? 'bg-red-600 text-white border-red-600'
              : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
          }`}
        >
          All
        </button>
        {CATEGORIES.map(cat => {
          const count = resources.filter(r => r.category === cat.value).length
          if (!isOwnerOrManager && count === 0) return null
          return (
            <button
              key={cat.value}
              onClick={() => setCatFilter(cat.value)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                catFilter === cat.value
                  ? 'bg-red-600 text-white border-red-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
              }`}
            >
              {cat.label}
              {count > 0 && (
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                  catFilter === cat.value ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Completion filter */}
      <div className="flex items-center gap-2 mb-5">
        <span className="text-xs text-gray-500 font-medium mr-1">Show:</span>
        {[
          { value: 'all',        label: 'All' },
          { value: 'incomplete', label: 'Not Completed' },
          { value: 'completed',  label: 'Completed' },
        ].map(opt => (
          <button
            key={opt.value}
            onClick={() => setCompletionFilter(opt.value)}
            className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
              completionFilter === opt.value
                ? opt.value === 'completed'
                  ? 'bg-green-600 text-white border-green-600'
                  : opt.value === 'incomplete'
                  ? 'bg-gray-700 text-white border-gray-700'
                  : 'bg-red-600 text-white border-red-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
            }`}
          >
            {opt.label}
            {opt.value === 'completed' && (
              <span className={`ml-1 ${completionFilter === 'completed' ? 'text-green-200' : 'text-gray-400'}`}>
                ({myCompletedCount})
              </span>
            )}
            {opt.value === 'incomplete' && (
              <span className={`ml-1 ${completionFilter === 'incomplete' ? 'text-gray-300' : 'text-gray-400'}`}>
                ({resources.filter(r => !r.completions?.some(c => c.user_id === userId)).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Resources */}
      {visible.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <GraduationCap size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium text-gray-500">
            {completionFilter === 'completed' ? 'No completed resources yet' :
             completionFilter === 'incomplete' ? 'Everything in this category is completed!' :
             'No training resources yet'}
          </p>
          {isOwnerOrManager && completionFilter === 'all' && (
            <p className="text-xs mt-1">Click "Add Resource" to add videos, links, and documents.</p>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ cat, items }) => (
            <div key={cat.value}>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                {cat.label}
              </h2>
              <div className="space-y-3">
                {items.map(resource => (
                  <ResourceCard
                    key={resource.id}
                    resource={resource}
                    currentUserId={userId}
                    isOwnerOrManager={isOwnerOrManager}
                    onEdit={setModal}
                    onDelete={handleDelete}
                    onToggleComplete={handleToggleComplete}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      </> /* end Library view */}

      {/* Modal */}
      {modal !== null && (
        <ResourceModal
          resource={modal || null}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
