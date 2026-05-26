import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { useMonth } from '@/contexts/MonthContext'
import { formatMonthYear } from '@/lib/utils'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import { Plus, Pencil, Trash2, ExternalLink, Lock, X, Link as LinkIcon, Loader2 } from 'lucide-react'

// ─── Extract domain for favicon fallback ──────────────────────────────────────
function getDomain(url) {
  try { return new URL(url.startsWith('http') ? url : 'https://' + url).hostname } catch { return '' }
}

// ─── Link Edit Modal ─────────────────────────────────────────────────────────
function LinkModal({ link, onSave, onClose }) {
  const isNew = !link
  const [form, setForm] = useState({
    title:        link?.title        ?? '',
    url:          link?.url          ?? '',
    description:  link?.description  ?? '',
    image_url:    link?.image_url    ?? '',
    manager_only: link?.manager_only ?? false,
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function handleSave() {
    if (!form.title.trim() || !form.url.trim()) return
    const url = form.url.startsWith('http') ? form.url : 'https://' + form.url
    onSave({ ...form, url })
  }

  const canSave = form.title.trim() && form.url.trim()

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-[#1A1A1A] px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-[#E8611A] text-xs font-bold uppercase tracking-wider mb-0.5">
              Important Links
            </p>
            <p className="text-white font-bold text-base">{isNew ? 'Add Link' : 'Edit Link'}</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/70">
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <div className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Link title <span className="text-red-400">*</span>
            </label>
            <input
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. iHOTWORX Dashboard"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]"
            />
          </div>

          {/* URL */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              URL <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <LinkIcon size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={form.url}
                onChange={e => set('url', e.target.value)}
                placeholder="https://example.com"
                className="w-full pl-8 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Description <span className="text-gray-400 font-normal">(why use this?)</span>
            </label>
            <textarea
              rows={2}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="e.g. Check membership counts, club activity, and member check-ins"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]"
            />
          </div>

          {/* Logo URL */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Logo / image URL <span className="text-gray-400 font-normal">(optional — auto-fetches favicon if blank)</span>
            </label>
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <Image size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={form.image_url}
                  onChange={e => set('image_url', e.target.value)}
                  placeholder="https://example.com/logo.png"
                  className="w-full pl-8 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]"
                />
              </div>
              {/* Preview */}
              {(form.image_url || form.url) && (
                <div className="w-10 h-10 rounded-lg border border-gray-100 flex-shrink-0 overflow-hidden bg-gray-50 flex items-center justify-center">
                  <img
                    src={form.image_url || `https://www.google.com/s2/favicons?domain=${getDomain(form.url)}&sz=64`}
                    alt=""
                    className="w-8 h-8 object-contain"
                    onError={e => { e.target.style.display = 'none' }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Manager/Owner only toggle */}
          <label className="flex items-start gap-3 cursor-pointer select-none p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
            <div className="relative mt-0.5">
              <input
                type="checkbox"
                checked={form.manager_only}
                onChange={e => set('manager_only', e.target.checked)}
                className="sr-only"
              />
              <div className={`w-9 h-5 rounded-full transition-colors ${form.manager_only ? 'bg-[#E8611A]' : 'bg-gray-200'}`} />
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.manager_only ? 'translate-x-4' : ''}`} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                <Lock size={12} className="text-gray-500" />
                Manager &amp; Owner only
              </p>
              <p className="text-xs text-gray-500 mt-0.5">TSAs will not see this link on their dashboard</p>
            </div>
          </label>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex-1 py-2.5 rounded-xl bg-[#E8611A] text-white text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-orange-600">
            {isNew ? 'Add Link' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Single link card ─────────────────────────────────────────────────────────
function LinkCard({ link, canEdit, onEdit, onDelete }) {
  const domain   = getDomain(link.url)
  const imgSrc   = link.image_url || (domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : null)
  const [imgErr, setImgErr] = useState(false)

  return (
    <div className="group flex items-start gap-3 p-4 bg-white rounded-xl border border-gray-100 hover:border-orange-200 hover:shadow-sm transition-all">
      {/* Logo */}
      <div className="w-11 h-11 rounded-lg border border-gray-100 bg-gray-50 flex-shrink-0 flex items-center justify-center overflow-hidden">
        {imgSrc && !imgErr
          ? <img src={imgSrc} alt="" className="w-9 h-9 object-contain" onError={() => setImgErr(true)} />
          : <LinkIcon size={18} className="text-gray-300" />
        }
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-bold text-gray-900 leading-tight">{link.title}</p>
          {link.manager_only && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-50 text-amber-600 border border-amber-200 rounded-full px-2 py-0.5">
              <Lock size={9} /> Manager+
            </span>
          )}
        </div>
        {link.description && (
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{link.description}</p>
        )}
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-[#E8611A] hover:text-orange-700 transition-colors"
        >
          Open <ExternalLink size={11} />
        </a>
      </div>

      {/* Edit/delete — only visible on hover for managers */}
      {canEdit && (
        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={() => onEdit(link)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title="Edit">
            <Pencil size={13} />
          </button>
          <button
            onClick={() => onDelete(link.id)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Delete">
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Important Links section ──────────────────────────────────────────────────
function ImportantLinks({ role }) {
  const [links,   setLinks]   = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | 'new' | link object

  const canEdit = role === 'owner' || role === 'manager'

  // Fetch from API — backend already filters manager_only links for TSAs
  useEffect(() => {
    apiGet('/api/dashboard-links')
      .then(data => setLinks(Array.isArray(data) ? data : []))
      .catch(() => setLinks([]))
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(data) {
    try {
      if (editing === 'new') {
        const saved = await apiPost('/api/dashboard-links', data)
        setLinks(prev => [...prev, saved])
      } else {
        const saved = await apiPut(`/api/dashboard-links/${editing.id}`, data)
        setLinks(prev => prev.map(l => l.id === editing.id ? saved : l))
      }
    } catch (err) { alert('Save failed: ' + err.message) }
    setEditing(null)
  }

  async function handleDelete(id) {
    if (!window.confirm('Remove this link?')) return
    try {
      await apiDelete(`/api/dashboard-links/${id}`)
      setLinks(prev => prev.filter(l => l.id !== id))
    } catch (err) { alert('Delete failed: ' + err.message) }
  }

  if (loading) return (
    <div className="mt-8 flex items-center gap-2 text-gray-400">
      <Loader2 size={14} className="animate-spin" />
      <span className="text-sm">Loading links…</span>
    </div>
  )

  // Hide section from TSAs only when there are genuinely no links for them
  if (!canEdit && links.length === 0) return null

  return (
    <div className="mt-8">
      {editing && (
        <LinkModal
          link={editing === 'new' ? null : editing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-gray-900">Important Links</h2>
        {canEdit && (
          <button
            onClick={() => setEditing('new')}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#E8611A] text-white hover:bg-orange-600 transition-colors">
            <Plus size={12} /> Add Link
          </button>
        )}
      </div>

      {links.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center">
          <LinkIcon size={22} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-400 font-medium">No links yet</p>
          <p className="text-xs text-gray-400 mt-0.5">Add links your team uses every day — portals, tools, reports</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {links.map(link => (
            <LinkCard
              key={link.id}
              link={link}
              canEdit={canEdit}
              onEdit={setEditing}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth()
  const { role, isOwnerOrManager } = useRole()
  const { selectedMonth, isCurrentMonth } = useMonth()

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'there'
  const roleLabel   = role === 'owner' ? 'Owner' : role === 'manager' ? 'Manager' : 'TSA'

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {displayName} 👋
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {roleLabel} · {formatMonthYear(selectedMonth.month, selectedMonth.year)}
          {!isCurrentMonth && ' · Read-only view'}
        </p>
      </div>

      {/* Quick-access cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <QuickCard
          title="Tasks"
          description="View today's cleaning and operations tasks"
          href="/cleaning"
          color="bg-blue-50 border-blue-200"
          iconColor="text-blue-600"
        />
        <QuickCard
          title="EOD Checkout"
          description="Submit your end-of-shift report"
          href="/eod"
          color="bg-green-50 border-green-200"
          iconColor="text-green-600"
        />
        <QuickCard
          title="Goals"
          description="Check studio & personal goals"
          href="/goals"
          color="bg-red-50 border-red-200"
          iconColor="text-red-600"
        />
        <QuickCard
          title="Schedule"
          description="View the weekly shift schedule"
          href="/schedule"
          color="bg-purple-50 border-purple-200"
          iconColor="text-purple-600"
        />
        <QuickCard
          title="Lead Generation"
          description="Log daily lead activity"
          href="/leads"
          color="bg-orange-50 border-orange-200"
          iconColor="text-orange-600"
        />
        <QuickCard
          title="SOPs"
          description="Reference studio procedures"
          href="/sops"
          color="bg-gray-50 border-gray-200"
          iconColor="text-gray-600"
        />
        <QuickCard
          title="Training"
          description="Browse training resources"
          href="/training"
          color="bg-indigo-50 border-indigo-200"
          iconColor="text-indigo-600"
        />
        {isOwnerOrManager && (
          <QuickCard
            title="To-Do List"
            description="Your private task list"
            href="/todo"
            color="bg-yellow-50 border-yellow-200"
            iconColor="text-yellow-600"
          />
        )}
        {isOwnerOrManager && (
          <QuickCard
            title="Coaching"
            description="Session notes & action items"
            href="/coaching"
            color="bg-teal-50 border-teal-200"
            iconColor="text-teal-600"
          />
        )}
      </div>

      {/* Important Links */}
      <ImportantLinks role={role} />
    </div>
  )
}

function QuickCard({ title, description, href, color, iconColor }) {
  return (
    <a
      href={href}
      className={`block p-4 rounded-xl border ${color} hover:shadow-sm transition-shadow`}
    >
      <p className={`text-sm font-semibold ${iconColor}`}>{title}</p>
      <p className="text-xs text-gray-500 mt-0.5">{description}</p>
    </a>
  )
}
