import { useState, useEffect, useRef } from 'react'
import { X, Search } from 'lucide-react'
import { apiGet } from '@/hooks/useApi'

// Autocomplete over the member roster. Multi-select by default (chips); pass
// single to use it as a one-member filter. value/onChange are arrays of {id, full_name}.
export default function MemberTagPicker({ value = [], onChange, single = false, placeholder = 'Search members…' }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    if (!q.trim()) { setResults([]); return }
    const t = setTimeout(async () => {
      try { setResults(await apiGet(`/api/member-activation/members/lookup?q=${encodeURIComponent(q)}`)) }
      catch { setResults([]) }
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const add = (m) => {
    if (single) { onChange([{ id: m.id, full_name: m.full_name }]); setQ(''); setOpen(false); return }
    if (!value.some(v => v.id === m.id)) onChange([...value, { id: m.id, full_name: m.full_name }])
    setQ(''); setOpen(false)
  }
  const remove = (id) => onChange(value.filter(v => v.id !== id))

  return (
    <div ref={boxRef} className="relative">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {value.map(v => (
            <span key={v.id} className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-800 rounded-full px-2 py-0.5">
              {v.full_name || 'Member'}
              <button type="button" onClick={() => remove(v.id)} className="hover:text-orange-950"><X size={11} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={single && value.length ? value[0].full_name : placeholder}
          className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-orange-400"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-52 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {results.map(m => (
            <button key={m.id} type="button" onClick={() => add(m)}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-orange-50 flex flex-col">
              <span className="text-gray-800">{m.full_name || m.email || 'Member'}</span>
              {m.email && <span className="text-[11px] text-gray-400">{m.email}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
