import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost, apiPut } from '@/hooks/useApi'
import { useStudio } from '@/contexts/StudioContext'
import { useRole } from '@/hooks/useRole'
import { Rocket, Loader2, Plus, Check, Calendar, TrendingUp, Pencil, X } from 'lucide-react'

const fmt = (n) => (n ?? 0).toLocaleString()
const GROUP_ORDER = ['Always on', 'Feet on the street', 'Ambassadors', 'People', 'Other']

// One channel row: actual/planned bar + a quick "+ leads" logger.
function ChannelRow({ ch, editing, onLog, onPlan }) {
  const [n, setN] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const pct = ch.planned > 0 ? Math.min(100, Math.round((ch.actual / ch.planned) * 100)) : (ch.actual > 0 ? 100 : 0)
  const log = async () => {
    const v = parseInt(n); if (!Number.isFinite(v) || v === 0) return
    setSaving(true); await onLog(ch.id, v, note); setN(''); setNote(''); setSaving(false)
  }
  return (
    <div className="py-2.5 border-b border-gray-100 last:border-0">
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="text-sm font-semibold text-gray-800">{ch.label}</span>
        <span className="text-xs font-bold text-gray-900">{fmt(ch.actual)}<span className="text-gray-400 font-normal"> / {fmt(ch.planned)}</span></span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1.5">
        <div className="h-full rounded-full bg-[#C8102E]" style={{ width: `${pct}%` }} />
      </div>
      {editing ? (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>Plan:</span>
          <input type="number" defaultValue={ch.plan_units} onBlur={e => onPlan(ch.id, { plan_units: e.target.value })}
            className="w-16 border border-gray-300 rounded px-1.5 py-0.5 text-right" /> units ×
          <input type="number" defaultValue={ch.plan_per_unit} onBlur={e => onPlan(ch.id, { plan_per_unit: e.target.value })}
            className="w-16 border border-gray-300 rounded px-1.5 py-0.5 text-right" /> each = <b className="text-gray-700">{fmt(ch.plan_units * ch.plan_per_unit)}</b>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <input type="number" value={n} onChange={e => setN(e.target.value)} onKeyDown={e => e.key === 'Enter' && log()}
            placeholder="+ leads" className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm" />
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="source / note (optional)"
            className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1 text-xs" />
          <button onClick={log} disabled={saving} className="flex-shrink-0 bg-gray-800 hover:bg-black text-white rounded-lg px-2 py-1.5 disabled:opacity-50">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          </button>
        </div>
      )}
    </div>
  )
}

function Sparkline({ daily }) {
  const max = Math.max(1, ...daily.map(d => d.count))
  return (
    <div className="flex items-end gap-0.5 h-10">
      {daily.map(d => (
        <div key={d.date} title={`${d.date}: ${d.count}`} className="flex-1 bg-[#C8102E]/70 rounded-sm" style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }} />
      ))}
    </div>
  )
}

export default function PreSalePage() {
  const { currentStudio } = useStudio()
  const { isOwner } = useRole()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await apiGet('/api/presale/dashboard')) } catch { setData(null) }
    finally { setLoading(false) }
  }, [currentStudio?.id])
  useEffect(() => { load() }, [load])

  const logLead = async (channel_id, lead_count, notes) => {
    try { await apiPost('/api/presale/leads', { channel_id, lead_count, notes }); await load() } catch { /* ignore */ }
  }
  const savePlan = async (id, patch) => {
    try { await apiPut(`/api/presale/channels/${id}/plan`, patch); await load() } catch { /* ignore */ }
  }
  const saveCampaign = async (patch) => {
    try { await apiPut('/api/presale/campaign', patch); await load() } catch { /* ignore */ }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#C8102E]" size={26} /></div>
  if (!data?.campaign) return (
    <div className="max-w-2xl mx-auto text-center py-20">
      <Rocket className="mx-auto text-gray-300 mb-3" size={30} />
      <p className="text-sm font-semibold text-gray-700">No pre-sale campaign for this studio.</p>
      <p className="text-xs text-gray-400 mt-1">The Pre-Sale tab is enabled per studio in Franchise Admin.</p>
    </div>
  )

  const { campaign, goal, actual, planned, channels, pace, daily } = data
  const pct = goal > 0 ? Math.min(100, Math.round((actual / goal) * 100)) : 0
  const planPct = goal > 0 ? Math.min(100, Math.round((planned / goal) * 100)) : 0
  const groups = {}
  for (const c of channels) (groups[c.channel_group] = groups[c.channel_group] || []).push(c)
  const orderedGroups = GROUP_ORDER.filter(g => groups[g])

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-10">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5"><Rocket size={22} className="text-[#C8102E]" /> {campaign.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{currentStudio?.name} · pre-sale lead campaign</p>
        </div>
        {isOwner && (
          <button onClick={() => setEditing(e => !e)} className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-600 bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">
            {editing ? <><X size={13} /> Done</> : <><Pencil size={13} /> Edit plan</>}
          </button>
        )}
      </div>

      {/* The math */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-4xl font-black text-gray-900 tracking-tight">{fmt(actual)}<span className="text-xl text-gray-400 font-bold"> / {fmt(goal)}</span></div>
            <div className="text-xs text-gray-500 mt-0.5">leads banked · {pct}% of goal</div>
          </div>
          <div className="flex gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-gray-900">{pace.days_remaining ?? '—'}</div>
              <div className="text-[11px] text-gray-500">days to launch</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#C8102E]">{pace.per_day_required != null ? fmt(pace.per_day_required) : '—'}</div>
              <div className="text-[11px] text-gray-500">leads/day needed</div>
            </div>
          </div>
        </div>
        {/* Dual bar: actual (solid) over plan (ghost) on the same goal scale */}
        <div className="mt-4 relative h-4 bg-gray-100 rounded-full overflow-hidden">
          <div className="absolute inset-y-0 left-0 bg-gray-200 rounded-full" style={{ width: `${planPct}%` }} title={`Plan: ${fmt(planned)}`} />
          <div className="absolute inset-y-0 left-0 bg-[#C8102E] rounded-full" style={{ width: `${pct}%` }} title={`Actual: ${fmt(actual)}`} />
        </div>
        <div className="flex justify-between text-[11px] text-gray-400 mt-1">
          <span><span className="inline-block w-2 h-2 rounded-full bg-[#C8102E] mr-1" />Actual {fmt(actual)}</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-gray-300 mr-1" />Planned {fmt(planned)}</span>
          <span>Goal {fmt(goal)}</span>
        </div>

        {isOwner && editing && (
          <div className="flex flex-wrap items-center gap-3 mt-4 pt-3 border-t border-gray-100 text-sm">
            <label className="flex items-center gap-1.5 text-gray-600">Goal
              <input type="number" defaultValue={goal} onBlur={e => saveCampaign({ goal_leads: e.target.value })} className="w-24 border border-gray-300 rounded px-2 py-1" /></label>
            <label className="flex items-center gap-1.5 text-gray-600"><Calendar size={14} /> Launch day
              <input type="date" defaultValue={campaign.launch_day || ''} onBlur={e => saveCampaign({ launch_day: e.target.value })} className="border border-gray-300 rounded px-2 py-1" /></label>
          </div>
        )}
      </div>

      {/* 14-day trend */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4">
        <div className="flex items-center justify-between mb-1.5"><span className="text-[13px] font-bold text-gray-700 flex items-center gap-1.5"><TrendingUp size={14} /> Last 14 days</span></div>
        <Sparkline daily={daily} />
      </div>

      {/* Channels */}
      {orderedGroups.map(g => (
        <div key={g} className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
          <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">{g}</h2>
          {groups[g].map(ch => <ChannelRow key={ch.id} ch={ch} editing={editing} onLog={logLead} onPlan={savePlan} />)}
        </div>
      ))}
      <p className="text-xs text-gray-400 flex items-center gap-1.5"><Check size={12} /> Every lead is a ledger entry — channel totals are the sum, never typed over. Deeper B2B / events / canvass / ambassador integration comes next.</p>
    </div>
  )
}
