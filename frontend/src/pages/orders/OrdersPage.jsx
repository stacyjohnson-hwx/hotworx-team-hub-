import { useState, useEffect, useCallback } from 'react'
import { useRole } from '@/hooks/useRole'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import {
  ShoppingCart, Plus, X, ChevronDown, ChevronUp, Trash2, Check,
  Package, Clock, CheckCircle2, XCircle, Truck,
  DollarSign, Edit2, Filter,
} from 'lucide-react'

// ─── Constants ───────────────────────────────────────────────────────────────
const STATUSES = [
  { value: 'pending',   label: 'Pending',   icon: Clock,        color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { value: 'approved',  label: 'Approved',  icon: CheckCircle2, color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'ordered',   label: 'Ordered',   icon: Truck,        color: 'bg-purple-100 text-purple-800 border-purple-300' },
  { value: 'received',  label: 'Received',  icon: Package,      color: 'bg-green-100 text-green-800 border-green-300' },
  { value: 'cancelled', label: 'Cancelled', icon: XCircle,      color: 'bg-gray-100 text-gray-500 border-gray-300' },
]

const CATEGORIES = [
  { value: 'supplies',  label: 'Supplies' },
  { value: 'retail',    label: 'Retail' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'other',     label: 'Other' },
]

const STATUS_TRANSITIONS = {
  pending:   ['approved', 'cancelled'],
  approved:  ['ordered', 'cancelled'],
  ordered:   ['received', 'cancelled'],
  received:  [],
  cancelled: [],
}

const NEXT_STATUS_LABELS = {
  approved: 'Mark Approved',
  ordered:  'Mark Ordered',
  received: 'Mark Received',
  cancelled: 'Cancel Request',
}

function statusMeta(val) {
  return STATUSES.find(s => s.value === val) || STATUSES[0]
}

function StatusBadge({ status }) {
  const meta = statusMeta(status)
  const Icon = meta.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${meta.color}`}>
      <Icon size={11} /> {meta.label}
    </span>
  )
}

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtCurrency(val) {
  if (!val && val !== 0) return '—'
  return `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ─── Add/Edit Modal ───────────────────────────────────────────────────────────
const blankForm = {
  item_name: '', quantity: '1', category: 'supplies', notes: '', vendor: '', est_cost: '',
}

function OrderModal({ order, onSave, onClose, isOwnerOrManager }) {
  const [form, setForm] = useState(order ? {
    item_name: order.item_name || '',
    quantity: String(order.quantity || 1),
    category: order.category || 'supplies',
    notes: order.notes || '',
    vendor: order.vendor || '',
    est_cost: order.est_cost !== null && order.est_cost !== undefined ? String(order.est_cost) : '',
  } : { ...blankForm })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.item_name.trim()) { setError('Item name is required'); return }
    setSaving(true)
    setError('')
    try {
      const payload = {
        item_name: form.item_name.trim(),
        quantity: parseInt(form.quantity, 10) || 1,
        category: form.category,
        notes: form.notes || null,
        vendor: form.vendor || null,
        est_cost: form.est_cost ? parseFloat(form.est_cost) : null,
      }
      const saved = order?.id
        ? await apiPut(`/api/orders/${order.id}`, payload)
        : await apiPost('/api/orders', payload)
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
          <h2 className="text-gray-900 font-semibold text-base">
            {order ? 'Edit Order Request' : 'Request Item'}
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Item Name *</label>
            <input
              className={inputCls}
              value={form.item_name}
              onChange={e => set('item_name', e.target.value)}
              placeholder="e.g. Paper towels, Retail display stand"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
              <input
                type="number" min="1"
                className={inputCls}
                value={form.quantity}
                onChange={e => set('quantity', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <select className={inputCls} value={form.category} onChange={e => set('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>

          {isOwnerOrManager && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Vendor / Source</label>
                <input
                  className={inputCls}
                  value={form.vendor}
                  onChange={e => set('vendor', e.target.value)}
                  placeholder="Amazon, Costco…"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Est. Cost</label>
                <div className="relative">
                  <DollarSign size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="number" min="0" step="0.01"
                    className={`${inputCls} pl-7`}
                    value={form.est_cost}
                    onChange={e => set('est_cost', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea
              rows={2}
              className={`${inputCls} resize-none`}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Brand preference, urgency, link…"
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
            {saving ? 'Saving…' : order ? 'Save Changes' : 'Submit Request'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Order Row ────────────────────────────────────────────────────────────────
function OrderRow({ order, isOwnerOrManager, showSensitive, onStatusChange, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState('')

  const transitions = STATUS_TRANSITIONS[order.status] || []
  const catMeta = CATEGORIES.find(c => c.value === order.category)

  const handleStatus = async (newStatus) => {
    setUpdatingStatus(newStatus)
    try { await onStatusChange(order.id, newStatus) }
    finally { setUpdatingStatus('') }
  }

  // Left border color by status
  const borderAccent = {
    pending:   'border-l-yellow-400',
    approved:  'border-l-blue-400',
    ordered:   'border-l-purple-400',
    received:  'border-l-green-400',
    cancelled: 'border-l-gray-300',
  }[order.status] || 'border-l-gray-300'

  return (
    <div className={`bg-white border border-gray-200 border-l-4 ${borderAccent} rounded-xl shadow-sm overflow-hidden`}>
      {/* Summary row — always visible */}
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="text-gray-400 flex-shrink-0">
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-gray-900 text-sm font-semibold">{order.item_name}</span>
            <span className="text-gray-400 text-xs">×{order.quantity}</span>
            {catMeta && (
              <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-md border border-gray-200">
                {catMeta.label}
              </span>
            )}
          </div>
          <p className="text-gray-500 text-xs mt-0.5">
            Requested by <span className="text-gray-700 font-medium">{order.requested_by_name}</span>
            {' · '}{fmtDate(order.created_at)}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {showSensitive && order.est_cost && (
            <span className="text-gray-700 text-sm font-medium">{fmtCurrency(order.est_cost)}</span>
          )}
          <StatusBadge status={order.status} />
        </div>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50">
          <div className="pt-3 space-y-3">

            {/* Detail grid */}
            {(showSensitive && (order.vendor || order.est_cost) || order.approved_by_name || order.ordered_at || order.received_at) && (
              <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
                {showSensitive && order.vendor && (
                  <>
                    <span className="text-gray-500 text-xs">Vendor</span>
                    <span className="text-gray-800 text-xs font-medium">{order.vendor}</span>
                  </>
                )}
                {showSensitive && order.est_cost && (
                  <>
                    <span className="text-gray-500 text-xs">Est. Cost</span>
                    <span className="text-gray-800 text-xs font-medium">{fmtCurrency(order.est_cost)}</span>
                  </>
                )}
                {order.approved_by_name && (
                  <>
                    <span className="text-gray-500 text-xs">Approved by</span>
                    <span className="text-gray-800 text-xs font-medium">{order.approved_by_name}</span>
                  </>
                )}
                {order.ordered_at && (
                  <>
                    <span className="text-gray-500 text-xs">Ordered on</span>
                    <span className="text-gray-800 text-xs font-medium">{fmtDate(order.ordered_at)}</span>
                  </>
                )}
                {order.received_at && (
                  <>
                    <span className="text-gray-500 text-xs">Received on</span>
                    <span className="text-gray-800 text-xs font-medium">{fmtDate(order.received_at)}</span>
                  </>
                )}
              </div>
            )}

            {order.notes && (
              <p className="text-gray-700 text-xs bg-white border border-gray-200 rounded-lg px-3 py-2 leading-relaxed">
                {order.notes}
              </p>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-wrap pt-0.5">
              {isOwnerOrManager && transitions.map(next => (
                <button
                  key={next}
                  onClick={() => handleStatus(next)}
                  disabled={!!updatingStatus}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 ${
                    next === 'cancelled'
                      ? 'bg-white border-gray-300 text-gray-600 hover:bg-gray-100 hover:border-gray-400'
                      : 'bg-red-600 border-red-600 text-white hover:bg-red-700'
                  }`}
                >
                  {updatingStatus === next ? (
                    <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Check size={11} />
                  )}
                  {NEXT_STATUS_LABELS[next]}
                </button>
              ))}

              {isOwnerOrManager && (
                <button
                  onClick={() => onEdit(order)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <Edit2 size={11} /> Edit
                </button>
              )}

              {isOwnerOrManager && (
                confirmDelete ? (
                  <div className="flex items-center gap-1 ml-auto">
                    <span className="text-xs text-gray-500 mr-1">Delete this order?</span>
                    <button
                      onClick={() => onDelete(order.id)}
                      className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg"
                    >
                      Yes, delete
                    </button>
                    <button onClick={() => setConfirmDelete(false)}
                      className="px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-800">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={11} /> Delete
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const now = new Date()
const CURRENT_YEAR  = now.getFullYear()
const CURRENT_MONTH = now.getMonth() + 1  // 1-indexed

const MONTH_NAMES = [
  { value: '1',  label: 'January' },  { value: '2',  label: 'February' },
  { value: '3',  label: 'March' },    { value: '4',  label: 'April' },
  { value: '5',  label: 'May' },      { value: '6',  label: 'June' },
  { value: '7',  label: 'July' },     { value: '8',  label: 'August' },
  { value: '9',  label: 'September' },{ value: '10', label: 'October' },
  { value: '11', label: 'November' }, { value: '12', label: 'December' },
]

function buildYearOptions() {
  const years = []
  for (let y = CURRENT_YEAR; y >= CURRENT_YEAR - 3; y--) years.push(y)
  return years
}
const YEAR_OPTIONS = buildYearOptions()

// Sort orders: pending first, then by ordered_at desc (if status=ordered), then created_at desc
function sortOrders(list) {
  return [...list].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1
    if (b.status === 'pending' && a.status !== 'pending') return 1
    // Both pending or both non-pending: sort by ordered_at if available, else created_at
    const aDate = a.ordered_at || a.created_at
    const bDate = b.ordered_at || b.created_at
    return new Date(bDate) - new Date(aDate)
  })
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function OrdersPage() {
  const { role } = useRole()
  const isOwnerOrManager = role === 'owner' || role === 'manager'

  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null)   // null=closed, false=new, object=edit
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [monthFilter, setMonthFilter] = useState(String(CURRENT_MONTH))
  const [yearFilter, setYearFilter] = useState(String(CURRENT_YEAR))

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (categoryFilter) params.set('category', categoryFilter)
      const qs = params.toString()
      const data = await apiGet(`/api/orders${qs ? '?' + qs : ''}`)
      setOrders(sortOrders(data))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, categoryFilter])

  useEffect(() => { load() }, [load])

  const handleSave = (saved) => {
    setOrders(prev => {
      const idx = prev.findIndex(o => o.id === saved.id)
      const next = idx >= 0 ? prev.map((o, i) => i === idx ? saved : o) : [saved, ...prev]
      return sortOrders(next)
    })
    setModal(null)
  }

  const handleStatusChange = async (id, newStatus) => {
    const updated = await apiPut(`/api/orders/${id}`, { status: newStatus })
    setOrders(prev => prev.map(o => o.id === id ? { ...o, ...updated } : o))
  }

  const handleDelete = async (id) => {
    await apiDelete(`/api/orders/${id}`)
    setOrders(prev => prev.filter(o => o.id !== id))
  }

  const visibleOrders = orders.filter(o => {
    if (!statusFilter && o.status === 'received') return false
    // Month/year filter applied to created_at
    if (monthFilter || yearFilter) {
      const d = new Date(o.created_at || o.updated_at)
      if (yearFilter && String(d.getFullYear()) !== yearFilter) return false
      if (monthFilter && String(d.getMonth() + 1) !== monthFilter) return false
    }
    return true
  })

  const pendingCount  = visibleOrders.filter(o => o.status === 'pending').length
  const approvedCount = visibleOrders.filter(o => o.status === 'approved').length

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
            <ShoppingCart size={22} className="text-red-600" /> Orders
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {pendingCount > 0 && (
              <span className="text-yellow-700 font-medium">{pendingCount} pending</span>
            )}
            {pendingCount > 0 && approvedCount > 0 && <span className="text-gray-400"> · </span>}
            {approvedCount > 0 && (
              <span className="text-blue-700 font-medium">{approvedCount} approved</span>
            )}
            {pendingCount === 0 && approvedCount === 0 && 'Track supply and retail requests'}
          </p>
        </div>
        <button
          onClick={() => setModal(false)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
        >
          <Plus size={16} /> Request Item
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <Filter size={14} className="text-gray-400 flex-shrink-0" />
        {/* Month */}
        <select
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:border-red-500"
          value={monthFilter}
          onChange={e => setMonthFilter(e.target.value)}
        >
          <option value="">All months</option>
          {MONTH_NAMES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        {/* Year */}
        <select
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:border-red-500"
          value={yearFilter}
          onChange={e => setYearFilter(e.target.value)}
        >
          <option value="">All years</option>
          {YEAR_OPTIONS.map(y => <option key={y} value={String(y)}>{y}</option>)}
        </select>
        {/* Status */}
        <select
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:border-red-500"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {/* Category */}
        <select
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:border-red-500"
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
        >
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        {(monthFilter !== String(CURRENT_MONTH) || yearFilter !== String(CURRENT_YEAR) || statusFilter || categoryFilter) && (
          <button
            onClick={() => { setMonthFilter(String(CURRENT_MONTH)); setYearFilter(String(CURRENT_YEAR)); setStatusFilter(''); setCategoryFilter('') }}
            className="text-xs text-red-600 hover:text-red-700 font-medium px-2 py-1.5 rounded hover:bg-red-50 transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      {/* Orders list */}
      {visibleOrders.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Package size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium text-gray-500">No orders found</p>
          <p className="text-xs mt-1 text-gray-400">
            {monthFilter ? 'No orders for this month. Try "All months" to see everything.' : 'Click "Request Item" to submit a new request.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleOrders.map(order => (
            <OrderRow
              key={order.id}
              order={order}
              isOwnerOrManager={isOwnerOrManager}
              showSensitive={isOwnerOrManager}
              onStatusChange={handleStatusChange}
              onEdit={setModal}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modal !== null && (
        <OrderModal
          order={modal || null}
          isOwnerOrManager={isOwnerOrManager}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
