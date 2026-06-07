import { useState } from 'react'
import { useStudio } from '@/contexts/StudioContext'
import { apiPost } from '@/hooks/useApi'
import { Upload, X, FileSpreadsheet, CheckCircle, AlertCircle, Loader } from 'lucide-react'
import * as XLSX from 'xlsx'

export function InventoryImportModal({ onClose, onSuccess }) {
  const { currentStudio } = useStudio()
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)

  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        let items = []

        if (selectedFile.name.endsWith('.csv')) {
          // Parse CSV
          const text = event.target.result
          const rows = text.split('\n')
          const headers = rows[0].split(',')

          items = rows.slice(1)
            .filter(row => row.trim())
            .map(row => {
              const values = row.split(',')
              const obj = {}
              headers.forEach((header, idx) => {
                obj[header.trim()] = values[idx]?.trim()
              })
              return obj
            })
            .filter(item => item.SKU || item.sku_code)
        } else {
          // Parse Excel
          const data = new Uint8Array(event.target.result)
          const workbook = XLSX.read(data, { type: 'array' })
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
          const jsonData = XLSX.utils.sheet_to_json(firstSheet)

          // Map Excel inventory export format
          items = jsonData.slice(1).map(row => ({
            product_name: row['Unnamed: 2'],
            sku_code: row['Unnamed: 3'],
            wholesale_rate: row['Unnamed: 4'],
            retail_rate: row['Unnamed: 5'],
            quantity: row['Unnamed: 6'],
          })).filter(item => item.sku_code)
        }

        // Get preview
        const previewData = await apiPost(
          '/api/retail/import/preview',
          { items },
          currentStudio.id
        )
        setPreview(previewData)
      } catch (err) {
        alert('Failed to parse file: ' + err.message)
      }
    }

    if (selectedFile.name.endsWith('.csv')) {
      reader.readAsText(selectedFile)
    } else {
      reader.readAsArrayBuffer(selectedFile)
    }
  }

  const handleImport = async () => {
    if (!file || !preview) return

    setImporting(true)
    try {
      let items = []

      if (file.name.endsWith('.csv')) {
        // Parse CSV
        const text = await file.text()
        const rows = text.split('\n')
        const headers = rows[0].split(',')

        items = rows.slice(1)
          .filter(row => row.trim())
          .map(row => {
            const values = row.split(',')
            const obj = {}
            headers.forEach((header, idx) => {
              obj[header.trim()] = values[idx]?.trim()
            })
            return obj
          })
          .filter(item => item.SKU || item.sku_code)
      } else {
        // Parse Excel
        const data = await file.arrayBuffer()
        const workbook = XLSX.read(data, { type: 'array' })
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
        const jsonData = XLSX.utils.sheet_to_json(firstSheet)

        items = jsonData.slice(1).map(row => ({
          product_name: row['Unnamed: 2'],
          sku_code: row['Unnamed: 3'],
          wholesale_rate: row['Unnamed: 4'],
          retail_rate: row['Unnamed: 5'],
          quantity: row['Unnamed: 6'],
        })).filter(item => item.sku_code)
      }

      const importResult = await apiPost(
        '/api/retail/import/inventory',
        { items, count_date: new Date().toISOString().split('T')[0] },
        currentStudio.id
      )

      setResult(importResult)

      if (importResult.errors === 0) {
        setTimeout(() => {
          onSuccess?.()
          onClose()
        }, 2000)
      }
    } catch (err) {
      alert('Import failed: ' + err.message)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Import Inventory</h2>
            <p className="text-sm text-gray-500 mt-1">Upload your existing inventory export</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Upload */}
          {!preview && !result && (
            <div>
              <label className="block">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-red-600 transition-colors cursor-pointer">
                  <FileSpreadsheet size={48} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-700 font-medium mb-2">
                    Click to upload Excel file
                  </p>
                  <p className="text-sm text-gray-500 mb-4">
                    Excel (.xlsx) or CSV (.csv) format
                  </p>
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg">
                    <Upload size={18} />
                    Choose File
                  </div>
                </div>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>

              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="font-semibold text-blue-900 mb-2">Supported Formats:</h3>
                <div className="text-sm text-blue-800 space-y-2">
                  <div>
                    <p className="font-medium">Excel Inventory Export:</p>
                    <ul className="ml-4 space-y-1">
                      <li>• Column C: Product Name</li>
                      <li>• Column D: SKU Code</li>
                      <li>• Column E: Wholesale Rate</li>
                      <li>• Column F: Retail Rate</li>
                      <li>• Column G: Quantity</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium">CSV Catalog:</p>
                    <ul className="ml-4 space-y-1">
                      <li>• Headers: Name, SKU, Price, Image URL (auto-detected)</li>
                      <li>• Duplicates automatically removed</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Preview */}
          {preview && !result && (
            <div>
              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{preview.total}</p>
                    <p className="text-xs text-gray-500">Total Items</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">{preview.new_skus}</p>
                    <p className="text-xs text-gray-500">New SKUs</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-blue-600">{preview.existing_skus}</p>
                    <p className="text-xs text-gray-500">Updates</p>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <h3 className="font-semibold text-gray-900 mb-3">Preview (first 20 items)</h3>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">SKU</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Product</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">Qty</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {preview.preview.map((item, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-2 text-gray-900 font-mono text-xs">{item.sku_code}</td>
                            <td className="px-3 py-2 text-gray-900">{item.product_name}</td>
                            <td className="px-3 py-2 text-center font-semibold">{item.quantity}</td>
                            <td className="px-3 py-2 text-center">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                                item.status === 'new'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-blue-100 text-blue-700'
                              }`}>
                                {item.status === 'new' ? 'New' : 'Update'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setFile(null); setPreview(null) }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {importing ? (
                    <>
                      <Loader size={18} className="animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload size={18} />
                      Import {preview.total} Items
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div>
              <div className={`p-6 rounded-lg text-center ${
                result.errors === 0 ? 'bg-green-50' : 'bg-amber-50'
              }`}>
                {result.errors === 0 ? (
                  <>
                    <CheckCircle size={48} className="mx-auto text-green-600 mb-3" />
                    <h3 className="text-xl font-bold text-green-900 mb-2">Import Successful!</h3>
                  </>
                ) : (
                  <>
                    <AlertCircle size={48} className="mx-auto text-amber-600 mb-3" />
                    <h3 className="text-xl font-bold text-amber-900 mb-2">Import Completed with Errors</h3>
                  </>
                )}

                <div className="grid grid-cols-4 gap-4 mt-4">
                  <div>
                    <p className="text-2xl font-bold text-green-600">{result.created}</p>
                    <p className="text-xs text-gray-600">Created</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-blue-600">{result.updated}</p>
                    <p className="text-xs text-gray-600">Updated</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-600">{result.skipped || 0}</p>
                    <p className="text-xs text-gray-600">Skipped</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-600">{result.errors}</p>
                    <p className="text-xs text-gray-600">Errors</p>
                  </div>
                </div>

                {result.error_details?.length > 0 && (
                  <div className="mt-4 text-left">
                    <p className="font-semibold text-sm text-gray-700 mb-2">Error Details:</p>
                    <div className="bg-white rounded border border-gray-200 p-3 text-xs space-y-1 max-h-32 overflow-y-auto">
                      {result.error_details.map((err, idx) => (
                        <div key={idx} className="text-red-600">
                          {err.item?.sku_code || 'Unknown'}: {err.error}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={onClose}
                  className="mt-6 px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
