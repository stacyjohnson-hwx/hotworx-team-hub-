import { Building2, Check, ChevronDown } from 'lucide-react'
import { useStudio } from '@/contexts/StudioContext'
import { useState, useRef, useEffect } from 'react'

export function StudioSwitcher() {
  const { studios, currentStudio, switchStudio, loading } = useStudio()
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (loading || !currentStudio) return null
  if (studios.length <= 1) return null // Only show if multiple studios

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900 hover:bg-gray-800 transition-colors border border-gray-800 text-left"
      >
        <Building2 size={16} className="text-red-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white truncate">{currentStudio.name}</p>
          <p className="text-[10px] text-gray-500">{currentStudio.code}</p>
        </div>
        <ChevronDown size={14} className={`text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-gray-900 border border-gray-800 rounded-lg shadow-xl z-50 overflow-hidden">
          {studios.map(studio => (
            <button
              key={studio.id}
              onClick={() => {
                switchStudio(studio.id)
                setOpen(false)
              }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-800 transition-colors text-left"
            >
              <Building2 size={14} className={studio.id === currentStudio.id ? 'text-red-600' : 'text-gray-600'} />
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold truncate ${studio.id === currentStudio.id ? 'text-white' : 'text-gray-300'}`}>
                  {studio.name}
                </p>
                <p className="text-[10px] text-gray-500">{studio.code}</p>
              </div>
              {studio.id === currentStudio.id && (
                <Check size={14} className="text-red-600 flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
