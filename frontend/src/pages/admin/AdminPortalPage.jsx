import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost } from '@/hooks/useApi'
import { Building2, Plus, Loader2, Copy, Check, X, ShieldCheck, Users } from 'lucide-react'

const BLANK = { code: '', name: '', address: '', timezone: 'America/Chicago', owner_full_name: '', owner_email: '' }

const TIMEZONES = [
  'America/Chicago', 'America/New_York', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu',
]

export default function AdminPortalPage() {
  const [studios, setStudios] = useState(null)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try { setStudios(await apiGet('/api/admin/studios')) }
    catch (e) { setError(e.message); setStudios([]) }
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-red-600" />
          <h1 className="text-2xl font-black text-gray-900">Franchise Admin</h1>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg shadow-sm">
            <Plus size={16} /> New Franchise
          </button>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-6">Spin up a new franchisee: creates their studio, owner login, and seeds starter content.</p>

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}

      {showForm && <NewFranchiseForm onClose={() => setShowForm(false)} onProvisioned={load} />}

      {studios === null ? (
        <div className="flex items-center justify-center h-40 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Studio</th>
                <th className="text-left px-4 py-2.5 font-semibold">Code</th>
                <th className="text-left px-4 py-2.5 font-semibold">Owner(s)</th>
                <th className="text-right px-4 py-2.5 font-semibold">Team</th>
                <th className="text-left px-4 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {studios.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-gray-400 py-10">No studios yet.</td></tr>
              ) : studios.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 size={15} className="text-gray-400 flex-shrink-0" />
                      <div>
                        <div className="font-semibold text-gray-900">{s.name}</div>
                        {s.address && <div className="text-xs text-gray-400">{s.address}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{s.code}</td>
                  <td className="px-4 py-3 text-gray-600">{s.owners?.length ? s.owners.join(', ') : <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-right text-gray-600"><span className="inline-flex items-center gap-1"><Users size={12} className="text-gray-400" />{s.member_count}</span></td>
                  <td className="px-4 py-3"><span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">{s.status || 'active'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function NewFranchiseForm({ onClose, onProvisioned }) {
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setError(null); setSaving(true)
    try {
      const res = await apiPost('/api/admin/provision', {
        studio: { code: form.code, name: form.name, address: form.address, timezone: form.timezone },
        owner: { full_name: form.owner_full_name, email: form.owner_email },
      })
      setResult(res)
      onProvisioned?.()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  // Success screen — one-time temp password + seed summary.
  if (result) {
    const seeded = (result.seed?.steps || []).filter(s => !s.error)
    const failed = (result.seed?.steps || []).filter(s => s.error)
    return (
      <div className="mb-6 bg-white border border-green-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Check className="w-5 h-5 text-green-600" />
          <h2 className="font-bold text-gray-900">{result.studio.name} is live</h2>
        </div>
        <p className="text-sm text-gray-600 mb-3">Share these credentials with the owner. <b>The temporary password is shown only once</b> — they'll be prompted to change it on first login.</p>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm space-y-1.5 mb-3">
          <div><span className="text-gray-400">Login email:</span> <span className="font-semibold text-gray-800">{result.owner.email}</span></div>
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Temp password:</span>
            <code className="font-bold text-gray-900 bg-white border border-gray-200 rounded px-2 py-0.5">{result.owner.temp_password}</code>
            <button onClick={() => { navigator.clipboard.writeText(result.owner.temp_password); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
              className="text-gray-400 hover:text-red-600">{copied ? <Check size={14} /> : <Copy size={14} />}</button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mb-1">Seeded starter content: {seeded.map(s => `${s.table}${s.copied ? ` (${s.copied})` : ''}`).join(', ') || '—'}</p>
        {failed.length > 0 && <p className="text-xs text-amber-600 mb-1">Some libraries did not seed: {failed.map(f => `${f.table}: ${f.error}`).join('; ')}. Re-run to retry.</p>}
        <button onClick={onClose} className="mt-2 px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg">Done</button>
      </div>
    )
  }

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-200 focus:border-red-400 outline-none'
  const lbl = 'block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1'
  return (
    <form onSubmit={submit} className="mb-6 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-gray-900">New Franchise</h2>
        <button type="button" onClick={onClose} className="text-gray-300 hover:text-gray-600"><X size={18} /></button>
      </div>
      {error && <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <div><label className={lbl}>Studio name *</label><input className={inp} value={form.name} onChange={e => set('name', e.target.value)} placeholder="HOTWORX Brookfield" /></div>
        <div><label className={lbl}>Studio code *</label><input className={inp} value={form.code} onChange={e => set('code', e.target.value.toUpperCase())} placeholder="WI0042" /></div>
        <div className="col-span-2"><label className={lbl}>Address</label><input className={inp} value={form.address} onChange={e => set('address', e.target.value)} placeholder="123 Main St, Brookfield, WI 53045" /></div>
        <div><label className={lbl}>Timezone</label>
          <select className={inp} value={form.timezone} onChange={e => set('timezone', e.target.value)}>
            {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>
        <div />
        <div><label className={lbl}>Owner name *</label><input className={inp} value={form.owner_full_name} onChange={e => set('owner_full_name', e.target.value)} placeholder="Jane Franchisee" /></div>
        <div><label className={lbl}>Owner email *</label><input type="email" className={inp} value={form.owner_email} onChange={e => set('owner_email', e.target.value)} placeholder="jane@example.com" /></div>
      </div>
      <div className="flex items-center gap-2 mt-4">
        <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-bold rounded-lg">
          {saving ? <><Loader2 size={15} className="animate-spin" /> Provisioning…</> : <>Create franchise & seed content</>}
        </button>
        <span className="text-xs text-gray-400">Creates studio + owner login + copies your starter libraries.</span>
      </div>
    </form>
  )
}
