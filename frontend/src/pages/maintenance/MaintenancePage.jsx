import { useState, useEffect } from 'react'
import { useRole } from '@/hooks/useRole'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import {
  Wrench, Plus, X, CheckCircle2, Clock, AlertTriangle,
  ChevronDown, ChevronUp, Trash2, Edit2, Loader2,
} from 'lucide-react'

const PRIORITIES = [
  { value: 'low',    label: 'Low',    bg: 'bg-gray-100',   text: 'text-gray-600',  border: 'border-gray-300'  },
  { value: 'medium', label: 'Medium', bg: 'bg-blue-100',   text: 'text-blue-700',  border: 'border-blue-300'  },
  { value: 'high',   label: 'High',   bg: 'bg-orange-100', text: 'text-orange-700',border: 'border-orange-300'},
  { value: 'urgent', label: 'Urgent', bg: 'bg-red-100',    text: 'text-red-700',   border: 'border-red-300'   },
]

const AREAS = [
  'Pod 1', 'Pod 2', 'Pod 3', 'Pod 4', 'Pod 5', 'Pod 6',
  'Lobby', 'Restrooms', 'Break Room', 'HVAC', 'Plumbing',
  'Electrical', 'Exterior', 'TV / AV', 'Equipment - Other', 'General',
]

const STATUSES = [
  { value: 'open',        label: 'Open',        icon: AlertTriangle, color: 'text-red-600'    },
  { value: 'in_progress', label: 'In Progress',  icon: Clock,         color: 'text-orange-600' },
  { value: 'resolved',    label: 'Resolved',    icon: CheckCircle2,  color: 'text-green-600'  },
]

function priorityMeta(v) { return PRIORITIES.find(p => p.value === v) || PRIORITIES[1] }
function statusMeta(v)   { return STATUSES.find(s => s.value === v) || STATUSES[0] }

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const inputCls  = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500'
const labelCls  = 'block text-xs font-semibold text-gray-700 mb-1'

const blank = { title: '', description: '', area: '', priority: 'medium' }

function LogModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || blank)
  const [saving, setSaving] = useState(false)
  const [err, setErr]   = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { setErr('Title is required'); return }
    setSaving(true)
    try {
      await onSave(form)
      onClose()
    } catch (e) {
      setErr(e.message)
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{initial ? 'Edit Issue' : 'Log Maintenance Issue'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {err && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>}

          <div>
            <label className={labelCls}>Issue Title *</label>
            <input className={inputCls} placeholder="e.g. Pod 3 screen flickering" value={form.title}
              onChange={e => set('title', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Area</label>
              <select className={inputCls} value={form.area} onChange={e => set('area', e.target.value)}>
                <option value="">— Select area —</option>
                {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Priority</label>
              <select className={inputCls} value={form.priority} onChange={e => set('priority', e.target.value)}>
                {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Description / Details</label>
            <textarea className={inputCls} rows={3} placeholder="What's happening? Any additional details…"
              value={form.description} onChange={e => set('description', e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-60 flex items-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {initial ? 'Save Changes' : 'Log Issue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ResolveModal({ entry, onSave, onClose }) {
  const [form, setForm] = useState({
    status: entry.status === 'resolved' ? 'resolved' : 'in_progress',
    resolution_notes: entry.resolution_notes || '',
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave({ ...entry, ...form })
      onClose()
    } catch { /* handled by parent */ } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Update Status</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label className={labelCls}>Status</label>
            <select className={inputCls} value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Resolution Notes</label>
            <textarea className={inputCls} rows={3}
              placeholder="What was done to resolve / update this issue?"
              value={form.resolution_notes}
              onChange={e => setForm(f => ({ ...f, resolution_notes: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-60 flex items-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />}Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EntryCard({ entry, isOwnerOrManager, onEdit, onUpdateStatus, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const pm = priorityMeta(entry.priority)
  const sm = statusMeta(entry.status)
  const StatusIcon = sm.icon

  return (
    <div className={`bg-white border rounded-xl shadow-sm overflow-hidden ${entry.status === 'resolved' ? 'opacity-75' : ''}`}>
      <div className="h-1" style={{ background: entry.priority === 'urgent' ? '#dc2626' : entry.priority === 'high' ? '#ea580c' : entry.priority === 'medium' ? '#2563eb' : '#9ca3af' }} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1 text-xs font-medium ${sm.color}`}>
                <StatusIcon size={12} />
                {sm.label}
              </span>
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${pm.bg} ${pm.text} ${pm.border}`}>
                {pm.label}
              </span>
              {entry.area && (
                <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">{entry.area}</span>
              )}
            </div>
            <p className="mt-1.5 text-sm font-semibold text-gray-900">{entry.title}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Logged by {entry.reported_by_name} · {fmtDate(entry.created_at)}
              {entry.status === 'resolved' && entry.resolved_by_name && ` · Resolved by ${entry.resolved_by_name}`}
            </p>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {isOwnerOrManager && (
              <>
                <button onClick={() => onUpdateStatus(entry)} title="Update status"
                  className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors">
                  <CheckCircle2 size={16} />
                </button>
                <button onClick={() => onEdit(entry)} title="Edit"
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                  <Edit2 size={15} />
                </button>
                <button onClick={() => setConfirmDelete(true)} title="Delete"
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 size={15} />
                </button>
              </>
            )}
            <button onClick={() => setExpanded(x => !x)}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
              {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
          </div>
        </div>

        {confirmDelete && (
          <div className="mt-3 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <p className="text-xs text-red-700 flex-1">Delete this entry?</p>
            <button onClick={() => { onDelete(entry.id); setConfirmDelete(false) }}
              className="text-xs font-semibold text-red-700 hover:text-red-900">Yes, delete</button>
            <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        )}

        {expanded && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
            {entry.description && <p className="text-sm text-gray-700">{entry.description}</p>}
            {entry.resolution_notes && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <p className="text-xs font-semibold text-green-700 mb-0.5">Resolution Notes</p>
                <p className="text-sm text-green-800">{entry.resolution_notes}</p>
              </div>
            )}
            {!entry.description && !entry.resolution_notes && (
              <p className="text-xs text-gray-400 italic">No additional details.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function MaintenancePage() {
  const { isOwnerOrManager } = useRole()
  const [entries, setEntries]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState('open') // 'open' | 'in_progress' | 'resolved' | 'all'
  const [showModal, setShowModal] = useState(false)
  const [editEntry, setEditEntry] = useState(null)
  const [resolveEntry, setResolveEntry] = useState(null)

  const load = async () => {
    try {
      const data = await apiGet('/api/maintenance')
      setEntries(data)
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (form) => {
    const created = await apiPost('/api/maintenance', form)
    setEntries(prev => [created, ...prev])
  }

  const handleEdit = async (form) => {
    const updated = await apiPut(`/api/maintenance/${editEntry.id}`, { ...editEntry, ...form })
    setEntries(prev => prev.map(e => e.id === updated.id ? { ...e, ...updated } : e))
  }

  const handleUpdateStatus = async (form) => {
    const updated = await apiPut(`/api/maintenance/${resolveEntry.id}`, form)
    setEntries(prev => prev.map(e => e.id === updated.id ? { ...e, ...updated } : e))
  }

  const handleDelete = async (id) => {
    await apiDelete(`/api/maintenance/${id}`)
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  const filtered = filter === 'all' ? entries : entries.filter(e => e.status === filter)

  const counts = {
    open:        entries.filter(e => e.status === 'open').length,
    in_progress: entries.filter(e => e.status === 'in_progress').length,
    resolved:    entries.filter(e => e.status === 'resolved').length,
  }

  const tabs = [
    { key: 'open',        label: 'Open',        count: counts.open },
    { key: 'in_progress', label: 'In Progress',  count: counts.in_progress },
    { key: 'resolved',    label: 'Resolved',    count: counts.resolved },
    { key: 'all',         label: 'All',          count: entries.length },
  ]

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center">
            <Wrench size={18} className="text-orange-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Maintenance Log</h1>
            <p className="text-xs text-gray-500">Track equipment and facility issues</p>
          </div>
        </div>
        <button onClick={() => { setEditEntry(null); setShowModal(true) }}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-orange-600 text-white text-sm font-semibold rounded-lg hover:bg-orange-700 transition-colors">
          <Plus size={16} />
          Log Issue
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter === t.key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
            {t.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                filter === t.key ? 'bg-orange-100 text-orange-700' : 'bg-gray-200 text-gray-600'
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Wrench size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">{filter === 'all' ? 'No issues logged yet.' : `No ${filter.replace('_', ' ')} issues.`}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(entry => (
            <EntryCard
              key={entry.id}
              entry={entry}
              isOwnerOrManager={isOwnerOrManager()}
              onEdit={e => setEditEntry(e)}
              onUpdateStatus={e => setResolveEntry(e)}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {(showModal || editEntry) && (
        <LogModal
          initial={editEntry}
          onSave={editEntry ? handleEdit : handleCreate}
          onClose={() => { setShowModal(false); setEditEntry(null) }}
        />
      )}
      {resolveEntry && (
        <ResolveModal
          entry={resolveEntry}
          onSave={handleUpdateStatus}
          onClose={() => setResolveEntry(null)}
        />
      )}
    </div>
  )
}
