import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useRole } from '@/hooks/useRole'
import { useStudio } from '@/contexts/StudioContext'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import { AnalyticsTab } from './AnalyticsTab'
import { InventoryImportModal } from './InventoryImportModal'
import * as XLSX from 'xlsx'
import {
  Package, Plus, Search, Filter, Edit2, Trash2, DollarSign,
  AlertCircle, BarChart3, ShoppingCart, CheckCircle, X, ClipboardList,
  Calendar, PlayCircle, Upload, Grid3x3, List, Download, Eye,
} from 'lucide-react'

// Clothing size grouping (mirrors the count page) so single-size SKUs
// ("Product / COLOR - SIZE") can be managed together by garment.
const SIZE_RUN = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
const SIZE_RANK = { '2XS': -2, 'XXS': -2, 'XS': 0, 'S': 1, 'M': 2, 'L': 3, 'XL': 4, 'XXL': 5, '2XL': 5, 'XXXL': 6, '3XL': 6, 'OS': 98, 'ONE SIZE': 99 }
const SIZE_SET = new Set(Object.keys(SIZE_RANK))
const sizeRank = (s) => (s in SIZE_RANK ? SIZE_RANK[s] : 50)
function parseSize(name) {
  const m = (name || '').match(/^(.*?)\s*-\s*([A-Za-z][A-Za-z0-9 ]{0,8})$/)
  if (!m) return { base: name || '', size: null }
  const size = m[2].trim().toUpperCase()
  return SIZE_SET.has(size) ? { base: m[1].trim(), size } : { base: name || '', size: null }
}

export default function RetailPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { currentStudio } = useStudio()
  const { isOwnerOrManager } = useRole()
  const [tab, setTab] = useState(searchParams.get('tab') || 'catalog')
  const [loading, setLoading] = useState(true)
  const [skus, setSkus] = useState([])
  const [categories, setCategories] = useState([])
  const [vendors, setVendors] = useState([])
  const [countSessions, setCountSessions] = useState([])
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterTopSellers, setFilterTopSellers] = useState(false)
  const [hideZeroInventory, setHideZeroInventory] = useState(false)
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const [showModal, setShowModal] = useState(false)
  const [editingSku, setEditingSku] = useState(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showSizeManager, setShowSizeManager] = useState(false)
  const [sizeManagerFocus, setSizeManagerFocus] = useState('')
  const [viewMode, setViewMode] = useState('grid') // 'grid' or 'table'

  const handleTabChange = (newTab) => {
    setTab(newTab)
    setSearchParams({ tab: newTab })
  }

  useEffect(() => {
    if (currentStudio?.id) {
      loadData()
    }
  }, [currentStudio?.id, tab])

  const loadData = async () => {
    setLoading(true)
    try {
      const promises = [
        apiGet('/api/retail/skus?active=true', currentStudio.id),
        apiGet('/api/retail/categories', currentStudio.id),
        apiGet('/api/retail/vendors', currentStudio.id),
      ]

      if (tab === 'inventory') {
        promises.push(apiGet('/api/retail/counts', currentStudio.id))
      }

      const results = await Promise.all(promises)
      setSkus(results[0])
      setCategories(results[1])
      setVendors(results[2])
      if (results[3]) setCountSessions(results[3])
    } catch (err) {
      console.error('Failed to load retail data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleStartCount = async () => {
    try {
      const session = await apiPost('/api/retail/counts', {
        count_date: new Date().toISOString().split('T')[0]
      }, currentStudio.id)
      navigate(`/retail/count/${session.id}`)
    } catch (err) {
      alert('Failed to start count: ' + err.message)
    }
  }

  const handleDeleteCount = async (id) => {
    try {
      await apiDelete(`/api/retail/counts/${id}`, null, currentStudio.id)
      loadData() // Reload to refresh the list
    } catch (err) {
      alert('Failed to delete count: ' + err.message)
    }
  }

  // Download a submitted count as .xlsx for entering into SAIL.
  const handleExportCount = async (session) => {
    try {
      const full = await apiGet(`/api/retail/counts/${session.id}`, currentStudio.id)
      const rows = (full.entries || []).map(e => ({
        'Product Name': e.sku?.product_name || '',
        'SKU Code': e.sku?.sku_code || '',
        'Expected': e.expected_quantity ?? '',
        'Counted': e.actual_quantity ?? '',
        'Variance': e.variance ?? (e.actual_quantity != null ? e.actual_quantity - (e.expected_quantity || 0) : ''),
      })).sort((a, b) => a['Product Name'].localeCompare(b['Product Name']))
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Inventory Count')
      XLSX.writeFile(wb, `inventory-count-${session.count_date}.xlsx`)
    } catch (err) {
      alert('Failed to export count: ' + err.message)
    }
  }

  const handleSave = async (skuData) => {
    try {
      const saved = editingSku?.id
        ? await apiPut(`/api/retail/skus/${editingSku.id}`, skuData, currentStudio.id)
        : await apiPost('/api/retail/skus', skuData, currentStudio.id)
      setSkus(prev => editingSku?.id ? prev.map(s => s.id === saved.id ? saved : s) : [...prev, saved])
      // Persist the manual inventory count (upsert on sku_id+studio).
      if (saved?.id && skuData.quantity_on_hand !== undefined) {
        await apiPut(`/api/retail/inventory/${saved.id}`, {
          quantity_on_hand: skuData.quantity_on_hand,
          size_quantities: skuData.size_quantities || null,
        }, currentStudio.id)
      }
      setShowModal(false)
      setEditingSku(null)
      loadData()
    } catch (err) {
      alert('Failed to save SKU: ' + err.message)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Deactivate this product?')) return
    try {
      await apiDelete(`/api/retail/skus/${id}`, null, currentStudio.id)
      setSkus(prev => prev.filter(s => s.id !== id))
    } catch (err) {
      alert('Failed to delete: ' + err.message)
    }
  }

  const qtyOf = (s) => s?.inventory?.[0]?.quantity_on_hand ?? 0
  // Optimistically update on-hand in local state while typing.
  const setLocalQty = (id, val) => setSkus(prev => prev.map(s =>
    s.id === id ? { ...s, inventory: [{ ...(s.inventory?.[0] || {}), quantity_on_hand: val }] } : s))
  // Persist on blur.
  const saveQty = async (sku, raw) => {
    const qty = raw === '' ? 0 : Number(raw) || 0
    try {
      await apiPut(`/api/retail/inventory/${sku.id}`, {
        quantity_on_hand: qty,
        size_quantities: sku.inventory?.[0]?.size_quantities || null,
      }, currentStudio.id)
    } catch (err) {
      alert('Failed to save quantity: ' + err.message)
    }
  }

  const filteredSkus = skus.filter(s => {
    const matchesSearch = !search ||
      s.sku_code?.toLowerCase().includes(search.toLowerCase()) ||
      s.product_name?.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = !filterCategory || s.category_id === filterCategory
    const matchesTopSeller = !filterTopSellers || s.top_seller === true
    // inventory is joined as an array (inventory_levels); read the first row.
    const matchesInventory = !hideZeroInventory || (s.inventory?.[0]?.quantity_on_hand || 0) > 0
    return matchesSearch && matchesCategory && matchesTopSeller && matchesInventory
  })

  // ── Column sorting ──────────────────────────────────────────────────────────
  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }
  const catName = (s) => categories.find(c => c.id === s.category_id)?.name || ''
  const SORT_VAL = {
    sku:       s => (s.sku_code || '').toLowerCase(),
    name:      s => (s.product_name || '').toLowerCase(),
    category:  s => catName(s).toLowerCase(),
    retail:    s => parseFloat(s.retail_price) || 0,
    wholesale: s => parseFloat(s.wholesale_cost) || 0,
  }
  const sortedSkus = sortKey
    ? [...filteredSkus].sort((a, b) => {
        const va = SORT_VAL[sortKey](a), vb = SORT_VAL[sortKey](b)
        const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb))
        return sortDir === 'asc' ? cmp : -cmp
      })
    : filteredSkus
  const sortArrow = (key) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '')

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-400">Loading retail inventory...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">
          <Package size={28} className="text-red-600" />
          Retail & Inventory
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {currentStudio?.name} — Product catalog and inventory management
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 overflow-x-auto">
        <TabButton active={tab === 'catalog'} onClick={() => handleTabChange('catalog')}>
          <Package size={16} /> Catalog
        </TabButton>
        <TabButton active={tab === 'inventory'} onClick={() => handleTabChange('inventory')}>
          <ClipboardList size={16} /> Inventory
        </TabButton>
        <TabButton active={tab === 'analytics'} onClick={() => handleTabChange('analytics')}>
          <BarChart3 size={16} /> Analytics
        </TabButton>
      </div>

      {/* Catalog Tab */}
      {tab === 'catalog' && (
        <div>
          {/* Toolbar */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
            <div className="space-y-3">
              {/* Search — own row so the typed query is fully visible */}
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search SKU or product name..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-600/30"
                />
              </div>

              {/* Filters + actions */}
              <div className="flex flex-col md:flex-row md:flex-wrap md:items-center gap-3">
              {/* Category Filter */}
              <select
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-600/30"
              >
                <option value="">All Categories</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              {/* Top Sellers Filter */}
              <label className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={filterTopSellers}
                  onChange={e => setFilterTopSellers(e.target.checked)}
                  className="w-4 h-4 accent-red-600"
                />
                <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Top Sellers Only</span>
              </label>

              {/* Hide Zero Inventory Filter */}
              <label className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={hideZeroInventory}
                  onChange={e => setHideZeroInventory(e.target.checked)}
                  className="w-4 h-4 accent-red-600"
                />
                <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Hide Zero Inventory</span>
              </label>

              {/* View Mode Toggle */}
              <div className="flex border border-gray-300 rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-red-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                  title="Grid View"
                >
                  <Grid3x3 size={18} />
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`px-3 py-2 text-sm font-medium transition-colors border-l border-gray-300 ${
                    viewMode === 'table'
                      ? 'bg-red-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                  title="Table View"
                >
                  <List size={18} />
                </button>
              </div>

              {/* Add & Import Buttons */}
              {isOwnerOrManager && (
                <>
                  <button
                    onClick={() => { setSizeManagerFocus(''); setShowSizeManager(true) }}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 whitespace-nowrap"
                    title="Set the on-hand quantity for each size of each garment"
                  >
                    <Grid3x3 size={18} /> Update Sizes
                  </button>
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 whitespace-nowrap"
                  >
                    <Upload size={18} /> Import Catalog
                  </button>
                  <button
                    onClick={() => { setEditingSku(null); setShowModal(true) }}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 whitespace-nowrap"
                  >
                    <Plus size={18} /> Add Product
                  </button>
                </>
              )}
              </div>
            </div>
          </div>

          {/* Product Grid View */}
          {viewMode === 'grid' && (() => {
            // Group sized apparel (Product … - SIZE) into one card per garment so
            // stock totals across sizes; everything else is its own card.
            const gmap = new Map(); const singles = []
            for (const sku of sortedSkus) {
              const { base, size } = parseSize(sku.product_name)
              if (!size) { singles.push(sku); continue }
              if (!gmap.has(base)) gmap.set(base, { base, sample: sku, bySize: {} })
              gmap.get(base).bySize[size] = sku
            }
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...gmap.values()].map(g => (
                  <GarmentCard key={g.base} group={g} isOwnerOrManager={isOwnerOrManager}
                    onManage={() => { setSizeManagerFocus(g.base); setShowSizeManager(true) }} />
                ))}
                {singles.map(sku => (
                  <ProductCard
                    key={sku.id}
                    sku={sku}
                    onEdit={() => { setEditingSku(sku); setShowModal(true) }}
                    onDelete={() => handleDelete(sku.id)}
                    isOwnerOrManager={isOwnerOrManager}
                  />
                ))}
              </div>
            )
          })()}

          {/* Table View */}
          {viewMode === 'table' && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th onClick={() => toggleSort('sku')} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none hover:text-gray-900">SKU{sortArrow('sku')}</th>
                      <th onClick={() => toggleSort('name')} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none hover:text-gray-900">Product Name{sortArrow('name')}</th>
                      <th onClick={() => toggleSort('category')} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none hover:text-gray-900">Category{sortArrow('category')}</th>
                      <th onClick={() => toggleSort('retail')} className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none hover:text-gray-900">Retail{sortArrow('retail')}</th>
                      <th onClick={() => toggleSort('wholesale')} className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none hover:text-gray-900">Wholesale{sortArrow('wholesale')}</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider w-28">On Hand</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider w-28">Value</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Sizes</th>
                      {isOwnerOrManager && (
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider w-24">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {sortedSkus.map(sku => (
                      <tr key={sku.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-gray-900 font-semibold">{sku.sku_code}</td>
                        <td className="px-4 py-3 text-gray-900">
                          <div className="flex items-center gap-2">
                            {sku.product_name}
                            {sku.top_seller && (
                              <span className="text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-bold">⭐</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {categories.find(c => c.id === sku.category_id)?.name || '-'}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">
                          {sku.retail_price ? `$${parseFloat(sku.retail_price).toFixed(2)}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {sku.wholesale_cost ? `$${parseFloat(sku.wholesale_cost).toFixed(2)}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isOwnerOrManager ? (
                            <input
                              type="number" min="0" onWheel={e => e.currentTarget.blur()}
                              value={qtyOf(sku)}
                              onChange={e => setLocalQty(sku.id, e.target.value)}
                              onBlur={e => saveQty(sku, e.target.value)}
                              className="w-20 px-2 py-1 border border-gray-300 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-red-600/30"
                            />
                          ) : (
                            <span className="font-semibold text-gray-900">{qtyOf(sku)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">
                          ${((Number(qtyOf(sku)) || 0) * (Number(sku.retail_price) || 0)).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {sku.has_sizes ? (
                            <span className="text-xs text-gray-500">
                              {(sku.available_sizes || []).join(', ') || 'Multi-size'}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                        {isOwnerOrManager && (
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => { setEditingSku(sku); setShowModal(true) }}
                                className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="Edit"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button
                                onClick={() => handleDelete(sku.id)}
                                className="p-1.5 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="Delete"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                    <tr>
                      <td className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase" colSpan={5}>
                        Total on hand ({sortedSkus.length} product{sortedSkus.length === 1 ? '' : 's'})
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-gray-900">
                        {sortedSkus.reduce((n, s) => n + (Number(qtyOf(s)) || 0), 0)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">
                        ${sortedSkus.reduce((n, s) => n + (Number(qtyOf(s)) || 0) * (Number(s.retail_price) || 0), 0).toFixed(2)}
                      </td>
                      <td colSpan={isOwnerOrManager ? 2 : 1} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {filteredSkus.length === 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <Package size={48} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">No products found</p>
              {isOwnerOrManager && (
                <button
                  onClick={() => { setEditingSku(null); setShowModal(true) }}
                  className="mt-4 text-red-600 hover:text-red-700 font-medium text-sm"
                >
                  Add your first product
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Inventory Tab */}
      {tab === 'inventory' && (
        <div>
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Inventory Counts</h2>
            {isOwnerOrManager && (
              <button
                onClick={handleStartCount}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                <PlayCircle size={18} /> Start New Count
              </button>
            )}
          </div>

          {/* Count Sessions List */}
          <div className="space-y-3">
            {countSessions.map(session => (
              <CountSessionCard
                key={session.id}
                session={session}
                onResume={() => navigate(`/retail/count/${session.id}`)}
                onExport={() => handleExportCount(session)}
                onDelete={handleDeleteCount}
              />
            ))}

            {countSessions.length === 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
                <ClipboardList size={48} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500 mb-4">No inventory counts yet</p>
                {isOwnerOrManager && (
                  <button
                    onClick={handleStartCount}
                    className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    Start Your First Count
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Analytics Tab */}
      {tab === 'analytics' && <AnalyticsTab />}

      {/* Modals */}
      {showModal && (
        <ProductModal
          sku={editingSku}
          categories={categories}
          vendors={vendors}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditingSku(null) }}
        />
      )}

      {showImportModal && (
        <InventoryImportModal
          onClose={() => setShowImportModal(false)}
          onSuccess={() => { setShowImportModal(false); loadData() }}
        />
      )}

      {showSizeManager && (
        <SizeManagerModal
          skus={skus}
          currentStudio={currentStudio}
          initialSearch={sizeManagerFocus}
          onClose={() => setShowSizeManager(false)}
          onSaved={() => { setShowSizeManager(false); loadData() }}
        />
      )}
    </div>
  )
}

// Manage on-hand quantity per size for garments stored as single-size SKUs
// ("Product / COLOR - SIZE"). Grouped by garment; missing sizes are created on save.
function SizeManagerModal({ skus, currentStudio, initialSearch = '', onClose, onSaved }) {
  const [search, setSearch] = useState(initialSearch)
  const [drafts, setDrafts] = useState({})   // `${base}|${size}` -> string value
  const [saving, setSaving] = useState(false)

  const qtyOf = (s) => s?.inventory?.[0]?.quantity_on_hand ?? 0
  const keyOf = (base, size) => `${base}|${size}`

  const groups = useMemo(() => {
    const map = new Map()
    for (const s of skus || []) {
      const { base, size } = parseSize(s.product_name)
      if (!size) continue
      if (!map.has(base)) map.set(base, { base, bySize: {}, sample: s })
      map.get(base).bySize[size] = s
    }
    return [...map.values()]
      .map(g => {
        const extra = Object.keys(g.bySize).filter(s => !SIZE_RUN.includes(s))
        return { ...g, sizeList: [...SIZE_RUN, ...extra].sort((a, b) => sizeRank(a) - sizeRank(b)) }
      })
      .filter(g => !search || g.base.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.base.localeCompare(b.base))
  }, [skus, search])

  const valFor = (g, size) => {
    const k = keyOf(g.base, size)
    if (k in drafts) return drafts[k]
    const s = g.bySize[size]
    return s ? String(qtyOf(s)) : ''
  }
  const setVal = (base, size, v) => setDrafts(d => ({ ...d, [keyOf(base, size)]: v }))

  const save = async () => {
    setSaving(true)
    try {
      for (const g of groups) {
        for (const size of g.sizeList) {
          const k = keyOf(g.base, size)
          if (!(k in drafts)) continue           // untouched
          const raw = String(drafts[k]).trim()
          if (raw === '') continue                // left blank
          const qty = Number(raw) || 0
          let sku = g.bySize[size]
          if (!sku) {
            // Clone a sibling to materialize the missing size.
            const b = g.sample
            sku = await apiPost('/api/retail/skus', {
              sku_code: `${b.sku_code}-${size}`,
              product_name: `${g.base} - ${size}`,
              category_id: b.category_id, vendor_id: b.vendor_id,
              retail_price: b.retail_price, wholesale_cost: b.wholesale_cost,
              image_url: b.image_url, has_sizes: false, active: true,
            }, currentStudio.id)
          }
          await apiPut(`/api/retail/inventory/${sku.id}`, { quantity_on_hand: qty, size_quantities: null }, currentStudio.id)
        }
      }
      onSaved()
    } catch (err) {
      alert('Save failed: ' + err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Update Sizes</h2>
            <p className="text-xs text-gray-500 mt-0.5">Set the on-hand quantity for each size. Sizes not in the catalog are created when you enter a number.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="px-6 pt-4">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search a garment (e.g. Be You Do You Tank)…"
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-600/30" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {groups.length === 0 ? (
            <p className="text-center text-gray-400 py-12 text-sm">No sized garments found{search ? ' for that search' : ''}.</p>
          ) : groups.map(g => (
            <div key={g.base} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                  {g.sample.image_url ? <img src={g.sample.image_url} alt="" className="w-full h-full object-cover" /> : <Package size={18} className="text-gray-300" />}
                </div>
                <p className="font-semibold text-gray-900 text-sm">{g.base}</p>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {g.sizeList.map(size => {
                  const exists = !!g.bySize[size]
                  return (
                    <div key={size} className="w-16">
                      <label className="block text-[11px] font-medium text-gray-500 mb-0.5 text-center">
                        {size}{!exists && <span className="text-gray-300"> +</span>}
                      </label>
                      <input
                        type="number" min="0" onWheel={e => e.currentTarget.blur()}
                        value={valFor(g, size)} onChange={e => setVal(g.base, size, e.target.value)}
                        placeholder="—"
                        className={`w-full px-2 py-1.5 rounded-lg text-center text-sm focus:outline-none focus:ring-2 focus:ring-red-600/30 border ${exists ? 'border-gray-300' : 'border-dashed border-gray-300 bg-gray-50'}`}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-200 px-6 py-4 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save quantities'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Components ──────────────────────────────────────────────────────────────

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
        active
          ? 'text-red-600 border-b-2 border-red-600'
          : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  )
}

// One card per garment (sized apparel): total stock across sizes + a per-size breakdown.
function GarmentCard({ group, isOwnerOrManager, onManage }) {
  const qtyOf = (s) => s?.inventory?.[0]?.quantity_on_hand || 0
  const sizes = Object.entries(group.bySize).sort((a, b) => sizeRank(a[0]) - sizeRank(b[0]))
  const total = sizes.reduce((n, [, s]) => n + qtyOf(s), 0)
  const sample = group.sample
  const margin = sample.retail_price && sample.wholesale_cost
    ? ((sample.retail_price - sample.wholesale_cost) / sample.retail_price * 100).toFixed(0) : null
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
      <div className="aspect-square bg-gray-100 relative">
        {sample.image_url ? <img src={sample.image_url} alt={group.base} className="w-full h-full object-cover" />
          : <div className="flex items-center justify-center h-full"><Package size={48} className="text-gray-300" /></div>}
        <div className="absolute top-2 left-2 bg-gray-900/70 text-white px-2 py-0.5 rounded-full text-[11px] font-semibold">{sizes.length} size{sizes.length === 1 ? '' : 's'}</div>
        {sample.top_seller && <div className="absolute top-2 right-2 bg-amber-500 text-white px-2 py-1 rounded-full text-xs font-bold shadow-lg">⭐ Top Seller</div>}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 truncate">{group.base}</h3>
            <p className="text-xs text-gray-500">Apparel · {sizes.length} sizes</p>
          </div>
          {isOwnerOrManager && (
            <button onClick={onManage} className="p-1 text-gray-400 hover:text-red-600" title="Update sizes / quantities"><Edit2 size={14} /></button>
          )}
        </div>
        <div className="flex items-center gap-3 mb-3">
          {sample.retail_price && <div className="text-lg font-bold text-gray-900">${sample.retail_price.toFixed(2)}</div>}
          {margin && <div className="text-xs text-green-600 font-semibold">{margin}% margin</div>}
        </div>
        <div className="flex items-center gap-2 mb-2">
          {total > 0 ? <CheckCircle size={16} className="text-green-500" /> : <AlertCircle size={16} className="text-amber-500" />}
          <span className="text-sm font-semibold text-gray-700">{total} in stock</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {sizes.map(([sz, s]) => (
            <span key={sz} className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600"><b>{sz}</b> {qtyOf(s)}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

function ProductCard({ sku, onEdit, onDelete, isOwnerOrManager }) {
  const inventory = sku.inventory?.[0]
  const inStock = inventory?.quantity_on_hand || 0
  const margin = sku.retail_price && sku.wholesale_cost
    ? ((sku.retail_price - sku.wholesale_cost) / sku.retail_price * 100).toFixed(0)
    : null

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
      {/* Image */}
      <div className="aspect-square bg-gray-100 relative">
        {sku.image_url ? (
          <img src={sku.image_url} alt={sku.product_name} className="w-full h-full object-cover" />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Package size={48} className="text-gray-300" />
          </div>
        )}
        {sku.top_seller && (
          <div className="absolute top-2 right-2 bg-amber-500 text-white px-2 py-1 rounded-full text-xs font-bold shadow-lg">
            ⭐ Top Seller
          </div>
        )}
        {!sku.active && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="text-white font-bold">INACTIVE</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 truncate">{sku.product_name}</h3>
            <p className="text-xs text-gray-500">SKU: {sku.sku_code}</p>
          </div>
          {isOwnerOrManager && (
            <div className="flex gap-1">
              <button onClick={onEdit} className="p-1 text-gray-400 hover:text-gray-600">
                <Edit2 size={14} />
              </button>
              <button onClick={onDelete} className="p-1 text-gray-400 hover:text-red-500">
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Pricing */}
        <div className="flex items-center gap-3 mb-3">
          {sku.retail_price && (
            <div className="text-lg font-bold text-gray-900">${sku.retail_price.toFixed(2)}</div>
          )}
          {margin && (
            <div className="text-xs text-green-600 font-semibold">{margin}% margin</div>
          )}
        </div>

        {/* Stock */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {inStock > 0 ? (
              <CheckCircle size={16} className="text-green-500" />
            ) : (
              <AlertCircle size={16} className="text-amber-500" />
            )}
            <span className="text-sm text-gray-600">
              {inStock} in stock
            </span>
          </div>
          {sku.has_sizes && (
            <span className="text-xs text-gray-400">Multi-size</span>
          )}
        </div>
      </div>
    </div>
  )
}

function ProductModal({ sku, categories, vendors, onSave, onClose }) {
  const inv = sku?.inventory?.[0]
  const [form, setForm] = useState(sku ? {
    ...sku,
    quantity_on_hand: inv?.quantity_on_hand ?? 0,
    size_quantities: inv?.size_quantities || {},
  } : {
    sku_code: '',
    product_name: '',
    description: '',
    category_id: '',
    vendor_id: '',
    retail_price: '',
    wholesale_cost: '',
    image_url: '',
    has_sizes: false,
    available_sizes: [],
    par_level: 0,
    reorder_quantity: 0,
    active: true,
    top_seller: false,
    quantity_on_hand: 0,
    size_quantities: {},
  })

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }))
  const setSizeQty = (size, val) => setForm(prev => ({ ...prev, size_quantities: { ...(prev.size_quantities || {}), [size]: val === '' ? '' : Number(val) } }))
  // Apparel total = sum of per-size counts; single items use the plain field.
  const sizeTotal = (form.available_sizes || []).reduce((s, sz) => s + (Number(form.size_quantities?.[sz]) || 0), 0)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.sku_code || !form.product_name) {
      alert('SKU code and product name are required')
      return
    }
    const useSizes = form.has_sizes && (form.available_sizes || []).length > 0
    onSave({
      ...form,
      quantity_on_hand: useSizes ? sizeTotal : (Number(form.quantity_on_hand) || 0),
      size_quantities: useSizes ? form.size_quantities : null,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            {sku ? 'Edit Product' : 'Add Product'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SKU Code *</label>
              <input
                type="text"
                value={form.sku_code}
                onChange={e => set('sku_code', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600/30"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
              <input
                type="text"
                value={form.product_name}
                onChange={e => set('product_name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600/30"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={form.category_id}
                onChange={e => set('category_id', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600/30"
              >
                <option value="">None</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
              <select
                value={form.vendor_id}
                onChange={e => set('vendor_id', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600/30"
              >
                <option value="">None</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Retail Price</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={form.retail_price}
                  onChange={e => set('retail_price', e.target.value)}
                  className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600/30"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Wholesale Cost</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={form.wholesale_cost}
                  onChange={e => set('wholesale_cost', e.target.value)}
                  className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600/30"
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
              <input
                type="url"
                value={form.image_url}
                onChange={e => set('image_url', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600/30"
                placeholder="https://..."
              />
            </div>

            <div className="md:col-span-2 flex gap-6">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.has_sizes}
                  onChange={e => set('has_sizes', e.target.checked)}
                  className="w-4 h-4 accent-red-600"
                />
                <span className="text-sm font-medium text-gray-700">Has multiple sizes (apparel)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.top_seller}
                  onChange={e => set('top_seller', e.target.checked)}
                  className="w-4 h-4 accent-red-600"
                />
                <span className="text-sm font-medium text-gray-700">⭐ Top Seller</span>
              </label>
            </div>

            {form.has_sizes && (
              <div className="md:col-span-2 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-3">Available Sizes</label>
                <div className="flex flex-wrap gap-2">
                  {['XS', 'S', 'M', 'L', 'XL', 'XXL', '2X', '3X', '4X'].map(size => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => {
                        const sizes = form.available_sizes || []
                        if (sizes.includes(size)) {
                          set('available_sizes', sizes.filter(s => s !== size))
                        } else {
                          set('available_sizes', [...sizes, size])
                        }
                      }}
                      className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                        (form.available_sizes || []).includes(size)
                          ? 'bg-red-600 text-white border-red-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-red-600'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Selected: {(form.available_sizes || []).length > 0 ? (form.available_sizes || []).join(', ') : 'None'}
                </p>
              </div>
            )}

            {/* Inventory on hand — manual update */}
            <div className="md:col-span-2 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <label className="block text-sm font-medium text-gray-700 mb-2">Quantity on hand</label>
              {form.has_sizes && (form.available_sizes || []).length > 0 ? (
                <>
                  <div className="flex flex-wrap gap-3">
                    {(form.available_sizes || []).map(size => (
                      <div key={size} className="w-20">
                        <label className="block text-xs font-medium text-gray-500 mb-1 text-center">{size}</label>
                        <input
                          type="number" min="0" onWheel={e => e.currentTarget.blur()}
                          value={form.size_quantities?.[size] ?? ''}
                          onChange={e => setSizeQty(size, e.target.value)}
                          placeholder="0"
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-red-600/30"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Total on hand: <span className="font-semibold text-gray-700">{sizeTotal}</span> (sum of sizes)</p>
                </>
              ) : (
                <input
                  type="number" min="0" onWheel={e => e.currentTarget.blur()}
                  value={form.quantity_on_hand ?? ''}
                  onChange={e => set('quantity_on_hand', e.target.value)}
                  placeholder="0"
                  className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600/30"
                />
              )}
              <p className="text-xs text-gray-400 mt-2">Sets stock directly — use this for quick adjustments outside a full count.</p>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Save Product
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CountSessionCard({ session, onResume, onExport, onDelete }) {
  const isSubmitted = session.status === 'submitted'
  const progress = session.items_counted || 0
  const total = session.total_items || 0
  const progressPct = total > 0 ? Math.round((progress / total) * 100) : 0

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Calendar size={16} className="text-gray-400" />
            <span className="font-semibold text-gray-900">{session.count_date}</span>
          </div>
          <p className="text-xs text-gray-500">
            Counted by {session.counted_by_user?.raw_user_meta_data?.full_name || session.counted_by_user?.email}
          </p>
        </div>
        <div className="text-right">
          {isSubmitted ? (
            <div className="flex items-center gap-1 text-green-600">
              <CheckCircle size={16} />
              <span className="text-sm font-semibold">Submitted</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-amber-600">
              <AlertCircle size={16} />
              <span className="text-sm font-semibold">In Progress</span>
            </div>
          )}
        </div>
      </div>

      {/* Progress */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="text-gray-600">{progress} of {total} items</span>
          <span className="font-semibold text-gray-900">{progressPct}%</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-red-600 transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Stats (if submitted) */}
      {isSubmitted && (
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="p-3 bg-red-50 rounded-lg">
            <p className="text-xs text-gray-600 mb-1">Total Variance</p>
            <p className={`text-lg font-bold ${session.total_variance_value < 0 ? 'text-red-600' : 'text-green-600'}`}>
              {session.total_variance_value < 0 ? '-' : '+'}${Math.abs(session.total_variance_value || 0).toFixed(2)}
            </p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600 mb-1">Shrinkage Rate</p>
            <p className="text-lg font-bold text-gray-900">{(session.shrinkage_rate || 0).toFixed(2)}%</p>
          </div>
        </div>
      )}

      {/* Actions */}
      {isSubmitted ? (
        <div className="flex gap-2">
          <button
            onClick={onExport}
            className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
          >
            <Download size={18} /> Export for SAIL
          </button>
          <button
            onClick={onResume}
            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-1.5"
            title="View this count"
          >
            <Eye size={18} /> View
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={onResume}
            className="flex-1 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
          >
            Resume Count
          </button>
          <button
            onClick={() => {
              if (confirm('Delete this count session? This cannot be undone.')) {
                onDelete(session.id)
              }
            }}
            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <Trash2 size={18} />
          </button>
        </div>
      )}
    </div>
  )
}
