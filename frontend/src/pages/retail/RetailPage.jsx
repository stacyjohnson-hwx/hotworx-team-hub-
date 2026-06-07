import { useState, useEffect } from 'react'
import { useRole } from '@/hooks/useRole'
import { useStudio } from '@/contexts/StudioContext'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import {
  Package, Plus, Search, Filter, Edit2, Trash2, DollarSign,
  AlertCircle, BarChart3, ShoppingCart, CheckCircle, X,
} from 'lucide-react'

export default function RetailPage() {
  const { currentStudio } = useStudio()
  const { isOwnerOrManager } = useRole()
  const [tab, setTab] = useState('catalog')
  const [loading, setLoading] = useState(true)
  const [skus, setSkus] = useState([])
  const [categories, setCategories] = useState([])
  const [vendors, setVendors] = useState([])
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingSku, setEditingSku] = useState(null)

  useEffect(() => {
    if (currentStudio?.id) {
      loadData()
    }
  }, [currentStudio?.id])

  const loadData = async () => {
    setLoading(true)
    try {
      const [skuData, catData, vendorData] = await Promise.all([
        apiGet('/api/retail/skus', currentStudio.id),
        apiGet('/api/retail/categories', currentStudio.id),
        apiGet('/api/retail/vendors', currentStudio.id),
      ])
      setSkus(skuData)
      setCategories(catData)
      setVendors(vendorData)
    } catch (err) {
      console.error('Failed to load retail data:', err)
    } finally {
      setLoading(false)
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
    return matchesSearch && matchesCategory
  })

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
        <TabButton active={tab === 'catalog'} onClick={() => setTab('catalog')}>
          <Package size={16} /> Catalog
        </TabButton>
        <TabButton active={tab === 'inventory'} onClick={() => setTab('inventory')}>
          <BarChart3 size={16} /> Inventory
        </TabButton>
        <TabButton active={tab === 'analytics'} onClick={() => setTab('analytics')}>
          <ShoppingCart size={16} /> Analytics
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

              {/* Add Button */}
              {isOwnerOrManager && (
                <button
                  onClick={() => { setEditingSku(null); setShowModal(true) }}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 whitespace-nowrap"
                >
                  <Plus size={18} /> Add Product
                </button>
              )}
            </div>
          </div>

          {/* Product Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSkus.map(sku => (
              <ProductCard
                key={sku.id}
                sku={sku}
                onEdit={() => { setEditingSku(sku); setShowModal(true) }}
                onDelete={() => handleDelete(sku.id)}
                isOwnerOrManager={isOwnerOrManager}
              />
            ))}
          </div>

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
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <BarChart3 size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">Inventory count interface coming in Phase 2</p>
          <p className="text-sm text-gray-400 mt-2">iPad-optimized count cards with size grids</p>
        </div>
      )}

      {/* Analytics Tab */}
      {tab === 'analytics' && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <ShoppingCart size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">Sales analytics coming in Phase 3-5</p>
          <p className="text-sm text-gray-400 mt-2">Velocity, shrinkage, dead stock detection</p>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <ProductModal
          sku={editingSku}
          categories={categories}
          vendors={vendors}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditingSku(null) }}
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

            <div className="md:col-span-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.has_sizes}
                  onChange={e => set('has_sizes', e.target.checked)}
                  className="w-4 h-4 accent-red-600"
                />
                <span className="text-sm font-medium text-gray-700">Has multiple sizes (apparel)</span>
              </label>
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
