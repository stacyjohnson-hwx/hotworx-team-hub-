import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useRole } from '@/hooks/useRole'
import { useStudio } from '@/contexts/StudioContext'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import { AnalyticsTab } from './AnalyticsTab'
import { InventoryImportModal } from './InventoryImportModal'
import {
  Package, Plus, Search, Filter, Edit2, Trash2, DollarSign,
  AlertCircle, BarChart3, ShoppingCart, CheckCircle, X, ClipboardList,
  Calendar, PlayCircle, Upload, Grid3x3, List,
} from 'lucide-react'

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

  const handleSave = async (skuData) => {
    try {
      if (editingSku?.id) {
        const updated = await apiPut(`/api/retail/skus/${editingSku.id}`, skuData, currentStudio.id)
        setSkus(prev => prev.map(s => s.id === updated.id ? updated : s))
      } else {
        const created = await apiPost('/api/retail/skus', skuData, currentStudio.id)
        setSkus(prev => [...prev, created])
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
            <div className="flex flex-col md:flex-row gap-3">
              {/* Search */}
              <div className="flex-1 relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search SKU or product name..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-600/30"
                />
              </div>

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

          {/* Product Grid View */}
          {viewMode === 'grid' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedSkus.map(sku => (
                <ProductCard
                  key={sku.id}
                  sku={sku}
                  onEdit={() => { setEditingSku(sku); setShowModal(true) }}
                  onDelete={() => handleDelete(sku.id)}
                  isOwnerOrManager={isOwnerOrManager}
                />
              ))}
            </div>
          )}

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
  const [form, setForm] = useState(sku || {
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
  })

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.sku_code || !form.product_name) {
      alert('SKU code and product name are required')
      return
    }
    onSave(form)
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

function CountSessionCard({ session, onResume, onDelete }) {
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
      {!isSubmitted && (
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
