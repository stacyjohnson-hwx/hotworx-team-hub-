import { useState, useEffect, useMemo } from 'react'
import { apiGet, apiPost, apiDelete } from '@/hooks/useApi'
import { useStudio } from '@/contexts/StudioContext'
import { useRole } from '@/hooks/useRole'
import {
  Plus, X, Trash2, Truck, CheckCircle, Package, DollarSign, Search,
} from 'lucide-react'

const money = (n) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '')
const moLabel = (ym) => {
  const [y, m] = ym.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

export function PurchaseOrdersTab({ skus = [], vendors = [] }) {
  const { currentStudio } = useStudio()
  const { isOwnerOrManager } = useRole()
  const [orders, setOrders] = useState([])
  const [spend, setSpend] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const load = async () => {
    if (!currentStudio?.id) return
    setLoading(true)
    try {
      const [po, sp] = await Promise.all([
        apiGet('/api/retail/purchase-orders', currentStudio.id),
        apiGet('/api/retail/purchase-orders/spend/summary?months=12', currentStudio.id),
      ])
      setOrders(po || [])
      setSpend(sp || null)
    } catch (err) {
      console.error('Failed to load purchase orders:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [currentStudio?.id])

  const receive = async (po) => {
    if (!window.confirm(`Mark this ${po.vendor_name} order received? This adds the items to your inventory.`)) return
    setBusyId(po.id)
    try {
      await apiPost(`/api/retail/purchase-orders/${po.id}/receive`, {}, currentStudio.id)
      await load()
    } catch (err) {
      alert('Failed to receive order: ' + err.message)
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (po) => {
    if (!window.confirm(`Delete this ${po.vendor_name} order? This also cancels it on the Orders board.`)) return
    setBusyId(po.id)
    try {
      await apiDelete(`/api/retail/purchase-orders/${po.id}`, null, currentStudio.id)
      await load()
    } catch (err) {
      alert('Failed to delete order: ' + err.message)
    } finally {
      setBusyId(null)
    }
  }

  const topVendors = (spend?.by_vendor || []).slice(0, 5)
  const maxMonth = Math.max(1, ...(spend?.by_month || []).map(m => m.spend))

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Truck size={20} className="text-red-600" /> Purchasing
          </h2>
          <p className="text-sm text-gray-500">Restock orders — records vendor spend and updates inventory when received.</p>
        </div>
        {isOwnerOrManager && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700"
          >
            <Plus size={16} /> New Order
          </button>
        )}
      </div>

      {/* Spend summary */}
      {spend && (spend.by_month.length > 0 || spend.by_vendor.length > 0) && (
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                <DollarSign size={15} className="text-gray-400" /> Retail spend by month
              </h3>
              <span className="text-xs text-gray-500">12 mo · {money(spend.total)}</span>
            </div>
            <div className="space-y-1.5">
              {spend.by_month.map(m => (
                <div key={m.month} className="flex items-center gap-2">
                  <span className="w-12 text-xs text-gray-500">{moLabel(m.month)}</span>
                  <div className="flex-1 bg-gray-100 rounded h-4 overflow-hidden">
                    <div className="h-4 bg-indigo-500 rounded" style={{ width: `${(m.spend / maxMonth) * 100}%` }} />
                  </div>
                  <span className="w-16 text-right text-xs font-medium text-gray-700">{money(m.spend)}</span>
                </div>
              ))}
              {spend.by_month.length === 0 && <p className="text-xs text-gray-400">No orders logged yet.</p>}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
              <Package size={15} className="text-gray-400" /> Top vendors (12 mo)
            </h3>
            <div className="space-y-2">
              {topVendors.map(v => (
                <div key={v.vendor} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 truncate pr-2">{v.vendor}</span>
                  <span className="font-medium text-gray-900">{money(v.spend)}</span>
                </div>
              ))}
              {topVendors.length === 0 && <p className="text-xs text-gray-400">No vendor spend yet.</p>}
            </div>
            <p className="text-[11px] text-gray-400 mt-3 leading-snug">
              Cross-check against QuickBooks COGS by vendor — this reflects only orders logged here.
            </p>
          </div>
        </div>
      )}

      {/* Orders list */}
      {loading ? (
        <p className="text-sm text-gray-500 py-8 text-center">Loading…</p>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-lg border border-dashed border-gray-300 p-10 text-center">
          <Truck size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">No purchase orders yet.</p>
          {isOwnerOrManager && <p className="text-xs text-gray-400 mt-1">Click “New Order” to log a restock.</p>}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Date</th>
                <th className="text-left px-4 py-2.5 font-medium">Vendor</th>
                <th className="text-right px-4 py-2.5 font-medium">Items</th>
                <th className="text-right px-4 py-2.5 font-medium">Total</th>
                <th className="text-center px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map(po => {
                const units = (po.items || []).reduce((s, it) => s + (it.quantity || 0), 0)
                return (
                  <tr key={po.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(po.ordered_at)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{po.vendor_name}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{units}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{money(po.total)}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={po.status} />
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {isOwnerOrManager && po.status === 'ordered' && (
                        <button
                          onClick={() => receive(po)}
                          disabled={busyId === po.id}
                          className="inline-flex items-center gap-1 text-xs bg-green-600 text-white px-2.5 py-1.5 rounded hover:bg-green-700 disabled:opacity-50 mr-2"
                        >
                          <CheckCircle size={13} /> Receive
                        </button>
                      )}
                      {isOwnerOrManager && (
                        <button
                          onClick={() => remove(po)}
                          disabled={busyId === po.id}
                          className="inline-flex items-center text-gray-400 hover:text-red-600 disabled:opacity-50"
                          title="Delete order"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <NewOrderModal
          skus={skus}
          vendors={vendors}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
        />
      )}
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    ordered: 'bg-amber-100 text-amber-700',
    received: 'bg-green-100 text-green-700',
    cancelled: 'bg-gray-100 text-gray-500',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

// ─── New order modal ─────────────────────────────────────────────────────────
function NewOrderModal({ skus, vendors, onClose, onSaved }) {
  const { currentStudio } = useStudio()
  const [vendorId, setVendorId] = useState('')
  const [lines, setLines] = useState([])       // { key, sku, sizeQ:{}, qty, unit_cost }
  const [search, setSearch] = useState('')
  const [tax, setTax] = useState('')
  const [shipping, setShipping] = useState('')
  const [totalOverride, setTotalOverride] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const vendorName = useMemo(
    () => vendors.find(v => v.id === vendorId)?.name || '',
    [vendorId, vendors]
  )

  const results = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return skus
      .filter(s => (s.product_name || '').toLowerCase().includes(q) || (s.sku_code || '').toLowerCase().includes(q))
      .slice(0, 8)
  }, [search, skus])

  const sizesOf = (sku) =>
    sku?.has_sizes && Array.isArray(sku.available_sizes) && sku.available_sizes.length
      ? sku.available_sizes
      : null

  const addSku = (sku) => {
    if (lines.some(l => l.sku.id === sku.id)) { setSearch(''); return }
    setLines(ls => [...ls, {
      key: sku.id,
      sku,
      sizeQ: {},
      qty: sizesOf(sku) ? 0 : 1,
      unit_cost: sku.wholesale_cost != null ? String(sku.wholesale_cost) : '',
    }])
    setSearch('')
  }

  const removeLine = (key) => setLines(ls => ls.filter(l => l.key !== key))
  const setLine = (key, patch) => setLines(ls => ls.map(l => l.key === key ? { ...l, ...patch } : l))
  const setSize = (key, size, val) => setLines(ls => ls.map(l => {
    if (l.key !== key) return l
    const sizeQ = { ...l.sizeQ, [size]: val }
    const qty = Object.values(sizeQ).reduce((s, v) => s + (Number(v) || 0), 0)
    return { ...l, sizeQ, qty }
  }))

  const lineQty = (l) => sizesOf(l.sku)
    ? Object.values(l.sizeQ).reduce((s, v) => s + (Number(v) || 0), 0)
    : (Number(l.qty) || 0)
  const lineTotal = (l) => lineQty(l) * (Number(l.unit_cost) || 0)

  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0)
  const computedTotal = subtotal + (Number(tax) || 0) + (Number(shipping) || 0)
  const total = totalOverride !== '' ? (Number(totalOverride) || 0) : computedTotal

  const save = async () => {
    setErr('')
    if (!vendorId) return setErr('Choose a vendor.')
    const items = lines
      .map(l => {
        const sizes = sizesOf(l.sku)
        const size_quantities = sizes
          ? Object.fromEntries(Object.entries(l.sizeQ).map(([s, v]) => [s, Number(v) || 0]).filter(([, v]) => v > 0))
          : null
        return {
          sku_id: l.sku.id,
          product_name: l.sku.product_name,
          quantity: lineQty(l),
          size_quantities,
          unit_cost: Number(l.unit_cost) || 0,
        }
      })
      .filter(it => it.quantity > 0)
    if (items.length === 0) return setErr('Add at least one product with a quantity.')

    setSaving(true)
    try {
      await apiPost('/api/retail/purchase-orders', {
        vendor_id: vendorId,
        vendor_name: vendorName,
        items,
        tax: Number(tax) || 0,
        shipping: Number(shipping) || 0,
        total,
        notes: notes.trim() || null,
      }, currentStudio.id)
      onSaved()
    } catch (e) {
      setErr(e.message || 'Failed to save order')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900">New Retail Order</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Vendor */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Vendor</label>
            <select
              value={vendorId}
              onChange={e => setVendorId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/30"
            >
              <option value="">Select a vendor…</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>

          {/* Add products */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Add products</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search catalog by name or SKU…"
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-600/30"
              />
              {results.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {results.map(s => (
                    <button
                      key={s.id}
                      onClick={() => addSku(s)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex justify-between gap-2"
                    >
                      <span className="truncate">{s.product_name}</span>
                      <span className="text-xs text-gray-400 whitespace-nowrap">{money(s.wholesale_cost || 0)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Line items */}
          {lines.length > 0 && (
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
              {lines.map(l => {
                const sizes = sizesOf(l.sku)
                return (
                  <div key={l.key} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{l.sku.product_name}</p>
                        <p className="text-[11px] text-gray-400">{l.sku.sku_code}</p>
                      </div>
                      <button onClick={() => removeLine(l.key)} className="text-gray-300 hover:text-red-600 mt-0.5">
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-end gap-3 mt-2">
                      {sizes ? (
                        <div className="flex flex-wrap gap-2">
                          {sizes.map(sz => (
                            <div key={sz} className="w-14">
                              <label className="block text-[10px] text-gray-400 text-center">{sz}</label>
                              <input
                                type="number" min="0"
                                value={l.sizeQ[sz] ?? ''}
                                onChange={e => setSize(l.key, sz, e.target.value)}
                                className="w-full border border-gray-300 rounded px-1.5 py-1 text-sm text-center"
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="w-20">
                          <label className="block text-[10px] text-gray-400">Qty</label>
                          <input
                            type="number" min="0"
                            value={l.qty}
                            onChange={e => setLine(l.key, { qty: e.target.value })}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                          />
                        </div>
                      )}
                      <div className="w-28">
                        <label className="block text-[10px] text-gray-400">Price paid / item</label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                          <input
                            type="number" min="0" step="0.01"
                            value={l.unit_cost}
                            onChange={e => setLine(l.key, { unit_cost: e.target.value })}
                            className="w-full border border-gray-300 rounded pl-5 pr-2 py-1 text-sm"
                          />
                        </div>
                      </div>
                      <div className="ml-auto text-right">
                        <label className="block text-[10px] text-gray-400">Line total</label>
                        <span className="text-sm font-medium text-gray-900">{money(lineTotal(l))}</span>
                        <span className="text-[11px] text-gray-400 ml-1">({lineQty(l)})</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Totals */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex justify-between text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span className="font-medium">{money(subtotal)}</span>
            </div>
            <div>
              <label className="block text-[10px] text-gray-400">Tax</label>
              <input type="number" min="0" step="0.01" value={tax} onChange={e => setTax(e.target.value)}
                placeholder="0.00" className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
            </div>
            <div>
              <label className="block text-[10px] text-gray-400">Shipping</label>
              <input type="number" min="0" step="0.01" value={shipping} onChange={e => setShipping(e.target.value)}
                placeholder="0.00" className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] text-gray-400">Order total {totalOverride === '' && <span className="text-gray-300">(auto: {money(computedTotal)})</span>}</label>
              <input type="number" min="0" step="0.01" value={totalOverride}
                onChange={e => setTotalOverride(e.target.value)}
                placeholder={computedTotal.toFixed(2)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-medium" />
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-gray-400 mb-1">Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>

          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200">
          <span className="text-sm text-gray-500">Total <span className="font-semibold text-gray-900">{money(total)}</span></span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
            <button onClick={save} disabled={saving}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Create Order'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
