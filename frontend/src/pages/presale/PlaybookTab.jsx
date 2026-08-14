import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import { Loader2, Copy, Check, Gift, Tag, BookOpen, Plus, Trash2 } from 'lucide-react'

const fmt$ = (n) => `$${(Number(n) || 0).toLocaleString()}`

// Copy-to-clipboard canvass / outreach scripts. Static — no backend.
const SCRIPTS = [
  {
    title: 'Business drop-in (30 sec)',
    body: `Hi! I'm with HOTWORX — the new infrared fitness studio opening soon right here in the neighborhood. We're doing a pre-sale and giving our founding members some incredible perks. Could I leave a few passes at your front desk for your team? Everyone who signs up before we open locks in our lowest rate ever.`,
  },
  {
    title: 'Property manager email',
    body: `Subject: A wellness perk for your residents (free launch passes)

Hi [Name],

HOTWORX is opening soon nearby and we'd love to offer your residents complimentary founding-member passes as a building amenity — infrared sauna workouts, 24/7 access, no equipment needed. We can set up a lobby table or drop off flyers, whatever's easiest for you. Would this week work for a quick 10-minute intro?

Thanks so much,
[Your name] — HOTWORX Pre-Sale Team`,
  },
  {
    title: 'Lobby / event table opener',
    body: `Hey there! Have you heard HOTWORX is opening nearby? It's infrared sauna workouts — 15 to 30 minutes, burn more, recover faster. We're signing up founding members right now at our lowest rate ever, and everyone who joins today is entered to win our giveaway bundle. Want me to grab your info so you don't miss it?`,
  },
  {
    title: 'Corporate wellness opener',
    body: `Hi [Name], I lead pre-sale for the new HOTWORX opening nearby. A lot of local employers are setting up a corporate wellness perk for their team — discounted founding memberships plus a few free passes to hand out. It's zero cost to you and a great retention benefit. Could I send over a one-pager or stop by for 10 minutes?`,
  },
]

function ScriptCard({ s }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard?.writeText(s.body); setCopied(true); setTimeout(() => setCopied(false), 1400) }
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4">
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-sm font-bold text-gray-800">{s.title}</h3>
        <button onClick={copy} className="flex items-center gap-1 text-[12px] font-semibold text-[#C8102E] border border-[#C8102E]/30 rounded-lg px-2 py-1 hover:bg-[#C8102E]/5">
          {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
        </button>
      </div>
      <p className="text-[13px] text-gray-600 whitespace-pre-line leading-relaxed">{s.body}</p>
    </div>
  )
}

function BundleCard({ b, canManage, onAssign, onDelete, unassigned }) {
  const pct = b.target_value > 0 ? Math.min(100, Math.round((b.committed_value / b.target_value) * 100)) : (b.committed_value > 0 ? 100 : 0)
  const [pick, setPick] = useState('')
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5"><Gift size={14} className="text-[#C8102E]" /> {b.name}</h3>
          {b.blurb ? <p className="text-[11px] text-gray-400 mt-0.5">{b.blurb}</p> : null}
        </div>
        {canManage && <button onClick={() => onDelete(b)} className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={14} /></button>}
      </div>
      <div className="flex items-baseline justify-between mt-2 mb-1">
        <span className="text-lg font-black text-gray-900">{fmt$(b.committed_value)}<span className="text-xs text-gray-400 font-bold"> / {fmt$(b.target_value)}</span></span>
        <span className="text-[11px] text-gray-500">{pct}% committed</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-[#C8102E]" style={{ width: `${pct}%` }} />
      </div>
      {b.prizes.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {b.prizes.map(p => (
            <li key={p.id} className="text-[12px] text-gray-600 flex justify-between gap-2">
              <span>🎁 {p.prize_item || 'Prize'} <span className="text-gray-400">· {p.business_name}</span></span>
              <span className="font-semibold text-gray-700">{fmt$(p.prize_value)}</span>
            </li>
          ))}
        </ul>
      )}
      {canManage && unassigned.length > 0 && (
        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-100">
          <select value={pick} onChange={e => setPick(e.target.value)} className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1 text-xs">
            <option value="">Add a donated prize…</option>
            {unassigned.map(u => <option key={u.id} value={u.id}>{u.prize_item || 'Prize'} — {u.business_name} ({fmt$(u.prize_value)})</option>)}
          </select>
          <button onClick={() => { if (pick) { onAssign(pick, b.id); setPick('') } }} disabled={!pick} className="bg-gray-800 text-white rounded-lg px-2 py-1.5 disabled:opacity-40"><Plus size={12} /></button>
        </div>
      )}
    </div>
  )
}

export default function PlaybookTab({ canManage }) {
  const [bundles, setBundles] = useState(null)
  const [unassigned, setUnassigned] = useState([])
  const [promos, setPromos] = useState(null)
  const [adding, setAdding] = useState(null)
  const load = useCallback(() => {
    apiGet('/api/presale/bundles').then(d => { setBundles(d.bundles || []); setUnassigned(d.unassigned || []) }).catch(() => setBundles([]))
    apiGet('/api/presale/promotions').then(setPromos).catch(() => setPromos([]))
  }, [])
  useEffect(() => { load() }, [load])
  const assign = async (partnerId, bundle_id) => { try { await apiPut(`/api/presale/partners/${partnerId}`, { bundle_id }); load() } catch { /* ignore */ } }
  const createBundle = async () => {
    if (!adding?.name) return
    try { await apiPost('/api/presale/bundles', adding); setAdding(null); load() } catch { /* ignore */ }
  }
  const delBundle = async (b) => { if (!window.confirm(`Delete "${b.name}"?`)) return; try { await apiDelete(`/api/presale/bundles/${b.id}`); load() } catch { /* ignore */ } }

  return (
    <div className="space-y-5">
      {/* Prize bundles */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-gray-800 flex items-center gap-1.5"><Gift size={15} className="text-[#C8102E]" /> Prize Bundles</h2>
          {canManage && (
            <button onClick={() => setAdding(adding ? null : { name: '', target_value: 300, blurb: '' })} className="flex items-center gap-1 text-[13px] font-semibold text-[#C8102E] border border-[#C8102E]/30 rounded-lg px-2.5 py-1 hover:bg-[#C8102E]/5">
              <Plus size={13} /> Add bundle
            </button>
          )}
        </div>
        {adding && (
          <div className="flex flex-wrap items-end gap-2 p-2.5 bg-gray-50 rounded-lg mb-2">
            <input value={adding.name} onChange={e => setAdding({ ...adding, name: e.target.value })} placeholder="Bundle name" className="flex-1 min-w-[140px] border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            <label className="text-[11px] text-gray-500">Target $ <input type="number" value={adding.target_value} onChange={e => setAdding({ ...adding, target_value: e.target.value })} className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm ml-1" /></label>
            <input value={adding.blurb} onChange={e => setAdding({ ...adding, blurb: e.target.value })} placeholder="Blurb (optional)" className="flex-1 min-w-[140px] border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            <button onClick={createBundle} disabled={!adding.name} className="bg-[#C8102E] text-white text-sm font-semibold rounded-lg px-3 py-1.5 disabled:opacity-40">Add</button>
          </div>
        )}
        {bundles === null ? <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-[#C8102E]" /></div>
          : bundles.length === 0 ? <p className="text-sm text-gray-400">No bundles yet.</p>
            : <div className="grid gap-3 sm:grid-cols-2">{bundles.map(b => <BundleCard key={b.id} b={b} canManage={canManage} unassigned={unassigned} onAssign={assign} onDelete={delBundle} />)}</div>}
        {unassigned.length > 0 && <p className="text-[11px] text-gray-400 mt-2">{unassigned.length} donated prize{unassigned.length === 1 ? '' : 's'} not yet earmarked to a bundle. Assign them from the bundle cards above (log prizes under Partners → prize donor).</p>}
      </section>

      {/* Promotions */}
      <section>
        <h2 className="text-sm font-bold text-gray-800 flex items-center gap-1.5 mb-2"><Tag size={15} className="text-[#C8102E]" /> What we can offer</h2>
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4">
          {promos === null ? <div className="py-6 flex justify-center"><Loader2 className="animate-spin text-[#C8102E]" /></div>
            : promos.length === 0 ? <p className="text-sm text-gray-400">No promotions configured. Add founding-rate and ambassador offers in the Events &amp; Promos module — they'll appear here.</p>
              : promos.map(p => (
                <div key={p.id} className="py-2 border-b border-gray-100 last:border-0 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-gray-800">{p.title}</div>
                    {p.description ? <div className="text-[11px] text-gray-400">{p.description}</div> : null}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {p.discount_value ? <span className="font-semibold text-gray-700">{p.discount_unit === 'percent' ? `${p.discount_value}%` : fmt$(p.discount_value)}</span> : null}
                    <span className={`px-2 py-0.5 rounded-full font-bold ${p.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>{p.active ? 'Active' : 'Off'}</span>
                  </div>
                </div>
              ))}
        </div>
      </section>

      {/* Scripts */}
      <section>
        <h2 className="text-sm font-bold text-gray-800 flex items-center gap-1.5 mb-2"><BookOpen size={15} className="text-[#C8102E]" /> Scripts</h2>
        <div className="space-y-3">{SCRIPTS.map(s => <ScriptCard key={s.title} s={s} />)}</div>
      </section>
    </div>
  )
}
