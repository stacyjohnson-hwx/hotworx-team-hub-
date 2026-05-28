import { useState, useEffect } from 'react'
import { useRole } from '@/hooks/useRole'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import {
  ShieldAlert, Plus, X, CheckCircle2, Clock, AlertTriangle,
  ChevronDown, ChevronUp, Trash2, Edit2, Loader2, User, ListTodo,
} from 'lucide-react'

const TYPES = [
  { value: 'member_complaint', label: 'Member Complaint', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { value: 'safety_incident',  label: 'Safety Incident',  color: 'bg-red-100 text-red-800 border-red-300'          },
  { value: 'staff_issue',      label: 'Staff Issue',       color: 'bg-purple-100 text-purple-800 border-purple-300' },
  { value: 'operational',      label: 'Operational',       color: 'bg-blue-100 text-blue-800 border-blue-300'       },
]

const PRIORITIES = [
  { value: 'low',    label: 'Low',    bg: 'bg-gray-100',   text: 'text-gray-600',  border: 'border-gray-300'   },
  { value: 'medium', label: 'Medium', bg: 'bg-blue-100',   text: 'text-blue-700',  border: 'border-blue-300'   },
  { value: 'high',   label: 'High',   bg: 'bg-orange-100', text: 'text-orange-700',border: 'border-orange-300' },
  { value: 'urgent', label: 'Urgent', bg: 'bg-red-100',    text: 'text-red-700',   border: 'border-red-300'    },
]

const STATUSES = [
  { value: 'open',        label: 'Open',       icon: AlertTriangle, color: 'text-red-600'    },
  { value: 'in_progress', label: 'In Progress', icon: Clock,        color: 'text-orange-600' },
  { value: 'resolved',    label: 'Resolved',   icon: CheckCircle2,  color: 'text-green-600'  },
]

function typeMeta(v)     { return TYPES.find(t => t.value === v) || TYPES[3] }
function priorityMeta(v) { return PRIORITIES.find(p => p.value === v) || PRIORITIES[1] }
function statusMeta(v)   { return STATUSES.find(s => s.value === v) || STATUSES[0] }

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const inputCls = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500'
const labelCls = 'block text-xs font-semibold text-gray-700 mb-1'

const blank = { type: 'operational', title: '', description: '', member_name: '', priority: 'medium' }

function LogModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || blank)
  const [saving, setSaving] = useState(false)
  const [err, setErr]   = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim())       { setErr('Title is required'); return }
    if (!form.description.trim()) { setErr('Description is required'); return }
    setSaving(true)
    try {
      await onSave(form)
      // parent closes modal via setModal(null) in same batch as setEntries — no onClose() here
    } catch (e) {
      setErr(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="text-base font-semibold text-gray-900">{initial ? 'Edit Escalation' : 'Log Escalation'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {err && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{err}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Type</label>
              <select className={inputCls} value={form.type} onChange={e => set('type', e.target.value)}>
                {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
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
            <label className={labelCls}>Title / Brief Summary *</label>
            <input className={inputCls} placeholder="e.g. Member upset about billing charge" value={form.title}
              onChange={e => set('title', e.target.value)} />
          </div>

          {(form.type === 'member_complaint' || form.type === 'safety_incident') && (
            <div>
              <label className={labelCls}>Member Name <span className="font-normal text-gray-400">(if applicable)</span></label>
              <input className={inputCls} placeholder="First and last name" value={form.member_name}
                onChange={e => set('member_name', e.target.value)} />
            </div>
          )}

          <div>
            <label className={labelCls}>Description *</label>
            <textarea className={inputCls} rows={4} placeholder="Describe what happened in detail…"
              value={form.description} onChange={e => set('description', e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60 flex items-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />}
              {initial ? 'Save Changes' : 'Log Escalation'}
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
    try { await onSave({ ...entry, ...form }) }
    catch { setSaving(false) }
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
              placeholder="How was this handled? What was the outcome?"
              value={form.resolution_notes}
              onChange={e => setForm(f => ({ ...f, resolution_notes: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-60 flex items-center gap-2">
              {saving && <Loader2 size={14} className="animate-spin" />}Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function SendToTodo({ entry }) {
  const [state, setState] = useState('idle') // idle | picking | saving | done | error

  const send = async (listTarget) => {
    setState('saving')
    try {
      await apiPost('/api/todo', {
        title: `[Escalation] ${entry.title}`,
        notes: entry.description || null,
        priority: entry.priority || 'medium',
        source: 'manual',
        list_target: listTarget,
      })
      setState('done')
      setTimeout(() => setState('idle'), 2000)
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 2500)
    }
  }

  if (state === 'done') return (
    <span className="text-xs text-green-600 font-semibold flex items-center gap-1 px-1">
      <CheckCircle2 size={12} /> Added
    </span>
  )
  if (state === 'error') return <span className="text-xs text-red-500 px-1">Failed</span>
  if (state === 'saving') return <span className="p-1.5"><Loader2 size={14} className="animate-spin text-gray-400" /></span>
  if (state === 'picking') return (
    <div className="flex items-center gap-1">
      <button onClick={() => send('manager')}
        className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 border border-blue-200 rounded-full font-semibold hover:bg-blue-200 transition-colors">
        Manager
      </button>
      <button onClick={() => send('owner')}
        className="text-xs px-2 py-0.5 bg-red-100 text-red-700 border border-red-200 rounded-full font-semibold hover:bg-red-200 transition-colors">
        Owner
      </button>
      <button onClick={() => setState('idle')} className="text-gray-400 hover:text-gray-600 ml-0.5">
        <X size={12} />
      </button>
    </div>
  )
  return (
    <button onClick={() => setState('picking')} title="Add to Manager/Owner To-Do"
      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
      <ListTodo size={15} />
    </button>
  )
}

function EntryCard({ entry, isOwnerOrManager, onEdit, onUpdateStatus, onDelete }) {
  const [expanded, setExpanded]       = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const tm = typeMeta(entry.type)
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
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${tm.color}`}>
                {tm.label}
              </span>
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${pm.bg} ${pm.text} ${pm.border}`}>
                {pm.label}
              </span>
            </div>
            <p className="mt-1.5 text-sm font-semibold text-gray-900">{entry.title}</p>
            {entry.member_name && (
              <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                <User size={11} />{entry.member_name}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-0.5">
              Logged by {entry.reported_by_name} · {fmtDate(entry.created_at)}
              {entry.status === 'resolved' && entry.resolved_by_name && ` · Resolved by ${entry.resolved_by_name}`}
            </p>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {isOwnerOrManager && (
              <>
                <SendToTodo entry={entry} />
                <button onClick={() => onUpdateStatus(entry)} title="Update status"
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
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
            <p className="text-sm text-gray-700">{entry.description}</p>
            {entry.resolution_notes && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <p className="text-xs font-semibold text-green-700 mb-0.5">Resolution / Notes</p>
                <p className="text-sm text-green-800">{entry.resolution_notes}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function EscalationsPage() {
  const { isOwnerOrManager } = useRole()
  const [entries, setEntries]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [filter, setFilter]             = useState('open')
  const [modal, setModal]               = useState(null)   // null=closed, false=new, object=edit
  const [resolveEntry, setResolveEntry] = useState(null)

  const load = async () => {
    try {
      const data = await apiGet('/api/escalations')
      setEntries(data)
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (form) => {
    const created = await apiPost('/api/escalations', form)
    setEntries(prev => [created, ...prev])
    setModal(null)           // same function, same tick as setEntries → one render
  }

  const handleEdit = async (form) => {
    const updated = await apiPut(`/api/escalations/${modal.id}`, { ...modal, ...form })
    setEntries(prev => prev.map(e => e.id === updated.id ? { ...e, ...updated } : e))
    setModal(null)
  }

  const handleUpdateStatus = async (form) => {
    const updated = await apiPut(`/api/escalations/${resolveEntry.id}`, form)
    setEntries(prev => prev.map(e => e.id === updated.id ? { ...e, ...updated } : e))
    setResolveEntry(null)
  }

  const handleDelete = async (id) => {
    await apiDelete(`/api/escalations/${id}`)
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  const filtered = filter === 'all' ? entries : entries.filter(e => e.status === filter)

  const counts = {
    open:        entries.filter(e => e.status === 'open').length,
    in_progress: entries.filter(e => e.status === 'in_progress').length,
    resolved:    entries.filter(e => e.status === 'resolved').length,
  }

  const tabs = [
    { key: 'open',        label: 'Open',        count: counts.open        },
    { key: 'in_progress', label: 'In Progress',  count: counts.in_progress },
    { key: 'resolved',    label: 'Resolved',    count: counts.resolved    },
    { key: 'all',         label: 'All',          count: entries.length     },
  ]

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center">
            <ShieldAlert size={18} className="text-red-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Escalation Log</h1>
            <p className="text-xs text-gray-500">Track complaints, incidents, and issues</p>
          </div>
        </div>
        <button onClick={() => setModal(false)}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors">
          <Plus size={16} />
          Log Escalation
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
                filter === t.key ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-600'
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
          <ShieldAlert size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">{filter === 'all' ? 'No escalations logged yet.' : `No ${filter.replace('_', ' ')} escalations.`}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(entry => (
            <EntryCard
              key={entry.id}
              entry={entry}
              isOwnerOrManager={isOwnerOrManager()}
              onEdit={e => setModal(e)}
              onUpdateStatus={e => setResolveEntry(e)}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {modal !== null && (
        <LogModal
          initial={modal || null}
          onSave={modal ? handleEdit : handleCreate}
          onClose={() => setModal(null)}
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
