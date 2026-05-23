import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Pencil, X, TrendingUp, DollarSign, Users, Phone, MessageSquare, Trophy } from 'lucide-react'
import { apiGet, apiPut } from '@/hooks/useApi'
import { useRole } from '@/hooks/useRole'
import { useMonth } from '@/contexts/MonthContext'
import { supabase } from '@/lib/supabase'

// ─── Commission calculator (mirrors backend) ─────────────────────────────────

const TSA_QUOTA     = 500
const MANAGER_QUOTA = 750

function calcCommission(goals, role, studioData = {}) {
  const eft    = Number(goals.eft_actual)    || 0
  const pos    = Number(goals.pos_collected) || 0
  const p6     = Number(goals.pif_6mo)       || 0
  const p12    = Number(goals.pif_12mo)      || 0

  if (role === 'manager') {
    const quota         = MANAGER_QUOTA
    const eft_exceeds   = eft > quota
    const eft_rate      = eft_exceeds ? 0.30 : 0.15
    const eft_comm      = pos * eft_rate
    const pif_comm      = p6 * 0.05 + p12 * 0.10
    const rm_total      = (Number(studioData.retail) || 0) + (Number(studioData.membership_cash) || 0)
    const rm_qualifies  = rm_total >= 5000
    const rm_bonus      = rm_qualifies ? round2(rm_total * 0.04) : 0

    let itb_bonus
    if (goals.itb_bonus_override != null && goals.itb_bonus_override !== '') {
      itb_bonus = Number(goals.itb_bonus_override)
    } else {
      const itb  = Number(studioData.in_the_bank) || 0
      const goal = Number(studioData.itb_goal)    || 0
      if (goal > 0 && itb >= goal * 1.10) itb_bonus = 500
      else if (goal > 0 && itb >= goal)   itb_bonus = 200
      else                                itb_bonus = 0
    }

    let net_eft_bonus
    if (goals.net_eft_bonus_override != null && goals.net_eft_bonus_override !== '') {
      net_eft_bonus = Number(goals.net_eft_bonus_override)
    } else {
      const neft = Number(studioData.net_eft) || 0
      if      (neft >= 50000) net_eft_bonus = 1200
      else if (neft >= 45000) net_eft_bonus = 900
      else if (neft >= 30000) net_eft_bonus = 700
      else if (neft >= 20000) net_eft_bonus = 500
      else if (neft >= 15000) net_eft_bonus = 350
      else                    net_eft_bonus = 0
    }

    return {
      type: 'manager', eft_rate, eft_exceeds, eft_quota: quota,
      eft_commission: round2(eft_comm), pif_commission: round2(pif_comm),
      rm_bonus, rm_total: round2(rm_total), rm_qualifies,
      itb_bonus, net_eft_bonus,
      total: round2(eft_comm + pif_comm + rm_bonus + itb_bonus + net_eft_bonus),
    }
  }

  // TSA
  const quota       = TSA_QUOTA
  const eft_exceeds = eft > quota
  const eft_rate    = eft_exceeds ? 0.30 : 0.15
  const eft_comm    = pos * eft_rate
  const pif_comm    = p6 * 0.05 + p12 * 0.10
  const retail      = Number(goals.retail_actual) || 0
  let retail_rate   = 0
  if (retail >= 3000)      retail_rate = 0.15
  else if (retail >= 2000) retail_rate = 0.11
  else if (retail >= 1000) retail_rate = 0.10
  const retail_comm = retail * retail_rate

  let itb_bonus
  if (goals.itb_bonus_override != null && goals.itb_bonus_override !== '') {
    itb_bonus = Number(goals.itb_bonus_override)
  } else if (eft >= quota * 1.10) { itb_bonus = 100 }
  else if (eft >= quota)           { itb_bonus = 50 }
  else                             { itb_bonus = 0 }

  return {
    type: 'tsa', eft_rate, eft_exceeds, eft_quota: quota,
    eft_commission: round2(eft_comm), pif_commission: round2(pif_comm),
    retail_commission: round2(retail_comm), retail_rate,
    itb_bonus, net_eft_bonus: 0,
    total: round2(eft_comm + pif_comm + retail_comm + itb_bonus),
  }
}

function round2(n) { return Math.round(n * 100) / 100 }
const fmt$ = n => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function fmtTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

function fmtShiftDate(d) {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// ─── Team member color palette ────────────────────────────────────────────────

const PALETTE = [
  { avatar: 'bg-red-600',    bar: 'bg-red-500',    light: 'bg-red-50',    border: 'border-red-300',    text: 'text-red-700',    badge: 'bg-red-100 text-red-700'    },
  { avatar: 'bg-blue-600',   bar: 'bg-blue-500',   light: 'bg-blue-50',   border: 'border-blue-300',   text: 'text-blue-700',   badge: 'bg-blue-100 text-blue-700'   },
  { avatar: 'bg-purple-600', bar: 'bg-purple-500', light: 'bg-purple-50', border: 'border-purple-300', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700'},
  { avatar: 'bg-orange-500', bar: 'bg-orange-500', light: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-700'},
  { avatar: 'bg-teal-600',   bar: 'bg-teal-500',   light: 'bg-teal-50',   border: 'border-teal-300',   text: 'text-teal-700',   badge: 'bg-teal-100 text-teal-700'   },
  { avatar: 'bg-green-600',  bar: 'bg-green-500',  light: 'bg-green-50',  border: 'border-green-300',  text: 'text-green-700',  badge: 'bg-green-100 text-green-700'  },
]

const MEDALS = ['🥇', '🥈', '🥉']

// ─── Reusable components ──────────────────────────────────────────────────────

function ProgressBar({ value, target, color = 'bg-red-600' }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-400 w-8 text-right">{Math.round(pct)}%</span>
    </div>
  )
}

function KpiCard({ label, target, actual, prefix = '$', suffix = '', color = 'bg-red-600' }) {
  const met = target > 0 && actual >= target
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <div className="flex items-end justify-between mb-2">
        <p className="text-xl font-bold text-gray-900">{prefix}{Number(actual || 0).toLocaleString()}{suffix}</p>
        <p className="text-xs text-gray-400">Goal: {prefix}{Number(target || 0).toLocaleString()}{suffix}</p>
      </div>
      <ProgressBar value={actual} target={target} color={met ? 'bg-green-500' : color} />
    </div>
  )
}

function StatCard({ label, value, prefix = '', suffix = '', sub, highlight }) {
  return (
    <div className={`bg-white rounded-xl border p-4 ${highlight ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${highlight ? 'text-green-700' : 'text-gray-900'}`}>
        {prefix}{value != null ? Number(value).toLocaleString() : '—'}{suffix}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function NumField({ label, prefix, suffix, value, onChange, placeholder, integer }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">{prefix}</span>}
        <input
          type="number" min="0" step={integer ? '1' : '0.01'}
          value={value ?? ''} onChange={e => onChange(e.target.value)}
          placeholder={placeholder || '0'}
          className={`w-full border border-gray-300 rounded-lg py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600 ${prefix ? 'pl-6 pr-3' : 'px-3'} ${suffix ? 'pr-8' : ''}`}
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">{suffix}</span>}
      </div>
    </div>
  )
}

function Avatar({ name, avatarUrl, size = 8, palette }) {
  const cls = `w-${size} h-${size} rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold`
  if (avatarUrl) return <img src={avatarUrl} alt={name} className={`${cls} object-cover`} />
  const bg = palette ? palette.avatar : 'bg-red-600/10'
  const textColor = palette ? 'text-white' : 'text-red-600'
  return <div className={`${cls} ${bg} ${textColor}`}>{name?.charAt(0)}</div>
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}>
      {children}
    </button>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GoalsPage() {
  const { isOwnerOrManager } = useRole()
  const { selectedMonth: { month, year } } = useMonth()
  const [tab, setTab]       = useState('studio')
  const [tsaTab, setTsaTab] = useState('goals')
  const [currentUserId, setCurrentUserId] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data?.user?.id))
  }, [])

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Goals</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} targets and actuals
        </p>
      </div>

      {isOwnerOrManager ? (
        <>
          <div className="flex gap-1 mb-6 border-b border-gray-200">
            <TabBtn active={tab === 'studio'} onClick={() => setTab('studio')}>Studio Goals</TabBtn>
            <TabBtn active={tab === 'team'}   onClick={() => setTab('team')}>Team Goals</TabBtn>
            <TabBtn active={tab === 'perf'}   onClick={() => setTab('perf')}>🏆 Team Performance</TabBtn>
          </div>
          {tab === 'studio' && <StudioGoals month={month} year={year} />}
          {tab === 'team'   && <TeamGoals   month={month} year={year} />}
          {tab === 'perf'   && <TeamPerformance month={month} year={year} currentUserId={currentUserId} />}
        </>
      ) : (
        <>
          <div className="flex gap-1 mb-6 border-b border-gray-200">
            <TabBtn active={tsaTab === 'goals'} onClick={() => setTsaTab('goals')}>My Goals</TabBtn>
            <TabBtn active={tsaTab === 'perf'}  onClick={() => setTsaTab('perf')}>🏆 Team Performance</TabBtn>
          </div>
          {tsaTab === 'goals' && <MyGoals month={month} year={year} />}
          {tsaTab === 'perf'  && <TeamPerformance month={month} year={year} currentUserId={currentUserId} />}
        </>
      )}
    </div>
  )
}

// ─── Studio Goals ─────────────────────────────────────────────────────────────

function StudioGoals({ month, year }) {
  const [goals, setGoals]     = useState(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm]       = useState({})
  const [saving, setSaving]   = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { const d = await apiGet(`/api/goals/studio?month=${month}&year=${year}`); setGoals(d); setForm(d) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [month, year])

  useEffect(() => { load() }, [load])

  async function save() {
    setSaving(true); setError(null)
    try { const d = await apiPut('/api/goals/studio', { month, year, ...form }); setGoals(d); setEditing(false) }
    catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  function setF(k, v) { setForm(p => ({ ...p, [k]: v })) }

  if (loading) return <Spinner />
  const g = goals || {}

  return (
    <div>
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">Monthly KPIs</h2>
        {!editing ? (
          <button onClick={() => { setForm({ ...goals }); setEditing(true) }}
            className="flex items-center gap-1.5 text-sm text-gray-500 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="text-sm text-gray-500 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50">Cancel</button>
            <button onClick={save} disabled={saving} className="text-sm bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-600-hover disabled:opacity-60">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Goals — actuals auto-filled from Studio Trends</p>
          {[
            { label: 'EFT Increase', tk: 'eft_target', prefix: '$' },
            { label: 'New Memberships', tk: 'memberships_target', prefix: '' },
            { label: 'Retail Sales', tk: 'retail_target', prefix: '$' },
          ].map(({ label, tk, prefix = '' }) => (
            <div key={label} className="grid grid-cols-3 gap-4 items-center">
              <p className="text-sm font-medium text-gray-700">{label}</p>
              <NumField label="Target" prefix={prefix} value={form[tk]} onChange={v => setF(tk, v)} />
              <p className="text-xs text-gray-400 mt-4">← from Studio Trends</p>
            </div>
          ))}

          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-2">Rates — Goal + Actual</p>
          {[
            { label: 'Conversion Rate', tk: 'conversion_rate_target', ak: 'conversion_rate_actual', suffix: '%' },
            { label: 'Check-in Show Rate', tk: 'checkin_show_rate_target', ak: 'checkin_show_rate_actual', suffix: '%' },
            { label: 'Studio Close Rate', tk: 'close_rate_target', ak: 'close_rate_actual', suffix: '%' },
          ].map(({ label, tk, ak, suffix = '' }) => (
            <GoalRow key={label} label={label} suffix={suffix}
              target={form[tk]} actual={form[ak]}
              onTarget={v => setF(tk, v)} onActual={v => setF(ak, v)} />
          ))}

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Goals only — actuals come from Studio Trends</p>
            <div className="grid grid-cols-2 gap-4">
              <NumField label="In the Bank — Goal" prefix="$" value={form.in_the_bank_target} onChange={v => setF('in_the_bank_target', v)} />
              <NumField label="Total Leads — Goal" value={form.total_leads_target} onChange={v => setF('total_leads_target', v)} integer />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea rows={2} value={form.notes || ''} onChange={e => setF('notes', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600" />
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <KpiCard label="EFT Increase"       target={g.eft_target}               actual={g.eft_actual}               prefix="$" color="bg-red-600" />
            <KpiCard label="New Memberships"    target={g.memberships_target}       actual={g.memberships_actual}       prefix="" color="bg-blue-500" />
            <KpiCard label="Retail Sales"       target={g.retail_target}            actual={g.retail_actual}            prefix="$" color="bg-purple-500" />
            <KpiCard label="Conversion Rate"    target={g.conversion_rate_target}   actual={g.conversion_rate_actual}   prefix="" suffix="%" color="bg-orange-500" />
            <KpiCard label="Check-in Show Rate" target={g.checkin_show_rate_target} actual={g.checkin_show_rate_actual} prefix="" suffix="%" color="bg-teal-500" />
            <KpiCard label="Studio Close Rate"  target={g.close_rate_target}        actual={g.close_rate_actual}        prefix="" suffix="%" color="bg-green-500" />
          </div>

          <h3 className="text-sm font-semibold text-gray-700 mb-3 mt-6">Studio Metrics</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <KpiCard label="In the Bank"   target={g.in_the_bank_target} actual={g.in_the_bank_actual} prefix="$" color="bg-green-600" />
            <KpiCard label="Total Leads"   target={g.total_leads_target} actual={g.total_leads_actual} prefix=""  color="bg-blue-600" />
            <StatCard label="Cancellations"   value={g.cancellations_actual} prefix="" />
            <StatCard label="Total Members"   value={g.total_members_actual} prefix="" />
            <StatCard
              label="Net Members"
              value={(g.new_members_actual != null && g.cancellations_actual != null)
                ? g.new_members_actual - g.cancellations_actual
                : null}
              prefix=""
              highlight={(g.new_members_actual - g.cancellations_actual) > 0}
              sub={g.new_members_actual != null ? `${g.new_members_actual} new − ${g.cancellations_actual ?? 0} cancelled` : null}
            />
            <StatCard label="EFT Decrease"     value={g.eft_decrease_actual}  prefix="$" />
            <StatCard label="Total EFT"        value={g.net_eft}              prefix="$" />
            <StatCard
              label="Net EFT"
              value={g.net_eft != null ? g.net_eft + (g.eft_actual || 0) - (g.eft_decrease_actual || 0) : null}
              prefix="$"
              highlight={(g.net_eft + (g.eft_actual || 0) - (g.eft_decrease_actual || 0)) > (g.net_eft || 0)}
              sub="Total EFT + Increase − Decrease"
            />
            <StatCard label="Membership Cash"  value={g.membership_cash}      prefix="$" />
          </div>

          {g.notes && <p className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3 mt-2">{g.notes}</p>}
        </>
      )}
    </div>
  )
}

function GoalRow({ label, prefix, suffix, target, actual, onTarget, onActual }) {
  return (
    <div className="grid grid-cols-3 gap-4 items-center">
      <p className="text-sm font-medium text-gray-700">{label}</p>
      <NumField label="Target" prefix={prefix} suffix={suffix} value={target} onChange={onTarget} />
      <NumField label="Actual" prefix={prefix} suffix={suffix} value={actual} onChange={onActual} />
    </div>
  )
}

// ─── Team Goals ───────────────────────────────────────────────────────────────

function TeamGoals({ month, year }) {
  const [team, setTeam]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setTeam(await apiGet(`/api/goals/personal?month=${month}&year=${year}`)) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [month, year])

  useEffect(() => { load() }, [load])

  function onSaved(updated) {
    setTeam(prev => prev.map(t => t.tsa_id === updated.tsa_id ? updated : t))
    setEditing(null)
  }

  if (loading) return <Spinner />

  return (
    <div>
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="space-y-2">
        {team.map(member => (
          <TeamMemberRow key={member.tsa_id} member={member} onEdit={() => setEditing(member)} />
        ))}
      </div>
      {editing && <PersonalGoalModal member={editing} month={month} year={year} onSaved={onSaved} onClose={() => setEditing(null)} />}
    </div>
  )
}

function MiniGoalBar({ label, actual, goal, prefix = '' }) {
  const a = Number(actual) || 0
  const g = Number(goal)  || 0
  if (g <= 0) return null
  const pct = Math.min(100, Math.round((a / g) * 100))
  const met = a >= g
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs text-gray-500">{label}</span>
        <span className={`text-xs font-medium ${met ? 'text-green-600' : 'text-gray-600'}`}>
          {prefix}{a.toLocaleString()} <span className="text-gray-400 font-normal">/ {prefix}{g.toLocaleString()}</span>
        </span>
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${met ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function TeamMemberRow({ member, onEdit }) {
  const c = member.commission || {}
  const isManager = member.tsa_role === 'manager'
  const hours = member.scheduled_hours || 0
  const pctOfTeam = member.hours_pct ? Math.round(member.hours_pct * 100) : 0
  const hasGoals = hours > 0 && (member.memberships_goal_computed || member.retail_goal_computed)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-4">
        <Avatar name={member.tsa_name} avatarUrl={member.avatar_url} size={9} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-900">{member.tsa_name}</p>
            {isManager && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">Manager</span>}
            {hours > 0 && (
              <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
                {hours}h · {pctOfTeam}%
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {isManager ? `POS: ${fmt$(member.pos_collected)}` : `Retail: ${fmt$(member.retail_actual)}`}
            &nbsp;·&nbsp; Basic: {member.sweat_basic || 0} &nbsp;·&nbsp; Elite: {member.sweat_elite || 0}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold text-gray-900">{fmt$(c.total)}</p>
          <p className="text-xs text-gray-400">Est. Commission</p>
        </div>
        <div className="text-right flex-shrink-0">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.itb_bonus >= 100 ? 'bg-green-100 text-green-700' : c.itb_bonus >= 50 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
            ITB: {fmt$(c.itb_bonus)}
          </span>
        </div>
        <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
          <Pencil className="w-4 h-4" />
        </button>
      </div>

      {hasGoals && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 grid grid-cols-2 gap-4">
          <MiniGoalBar label="Members"  actual={member.total_memberships} goal={member.memberships_goal_computed} />
          {!isManager
            ? <MiniGoalBar label="Retail" actual={member.retail_actual} goal={member.retail_goal_computed} prefix="$" />
            : <div />
          }
        </div>
      )}
    </div>
  )
}

function PersonalGoalModal({ member, month, year, onSaved, onClose }) {
  const isManager = member.tsa_role === 'manager'
  const studioData = member.studio_data || {}

  const [form, setForm] = useState({
    eft_actual:           member.eft_actual          || 0,
    pos_collected:        member.pos_collected        || 0,
    pif_6mo:              member.pif_6mo              || 0,
    pif_12mo:             member.pif_12mo             || 0,
    retail_actual:        member.retail_actual        || 0,
    sweat_basic:          member.sweat_basic          || 0,
    sweat_elite:          member.sweat_elite          || 0,
    total_memberships:    member.total_memberships    || 0,
    calls_made:           member.calls_made           || 0,
    texts_made:           member.texts_made           || 0,
    itb_bonus_override:   member.itb_bonus_override   ?? '',
    itb_bonus_note:       member.itb_bonus_note       || '',
    net_eft_bonus_override: member.net_eft_bonus_override ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  function setF(k, v) { setForm(p => ({ ...p, [k]: v })) }

  const preview = calcCommission(
    { ...form, itb_bonus_override: form.itb_bonus_override === '' ? null : form.itb_bonus_override,
               net_eft_bonus_override: form.net_eft_bonus_override === '' ? null : form.net_eft_bonus_override },
    isManager ? 'manager' : 'tsa',
    studioData
  )

  async function save() {
    setSaving(true); setError(null)
    try {
      const saved = await apiPut(`/api/goals/personal/${member.tsa_id}`, {
        month, year, ...form,
        itb_bonus_override:     form.itb_bonus_override     === '' ? null : Number(form.itb_bonus_override),
        net_eft_bonus_override: form.net_eft_bonus_override === '' ? null : Number(form.net_eft_bonus_override),
      })
      onSaved(saved)
    } catch (e) { setError(e.message); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <Avatar name={member.tsa_name} avatarUrl={member.avatar_url} size={9} />
            <div>
              <h2 className="text-base font-semibold text-gray-900">{member.tsa_name}</h2>
              <p className="text-xs text-gray-400">{new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
            </div>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="p-5 space-y-5">
          {error && <ErrorBox>{error}</ErrorBox>}

          <section>
            <SectionHeader icon={DollarSign} label="Sales" />
            <div className="grid grid-cols-2 gap-3">
              <NumField label="EFT Increase" prefix="$" value={form.eft_actual} onChange={v => setF('eft_actual', v)} />
              <NumField label="POS Collected" prefix="$" value={form.pos_collected} onChange={v => setF('pos_collected', v)} />
              <NumField label="PIF 6-Month Collected" prefix="$" value={form.pif_6mo} onChange={v => setF('pif_6mo', v)} />
              <NumField label="PIF 12-Month Collected" prefix="$" value={form.pif_12mo} onChange={v => setF('pif_12mo', v)} />
              {!isManager && <NumField label="Retail Sales" prefix="$" value={form.retail_actual} onChange={v => setF('retail_actual', v)} />}
            </div>
          </section>

          <section>
            <SectionHeader icon={Users} label="Memberships" />
            <div className="grid grid-cols-3 gap-3">
              <NumField label="Sweat Basic Sold" value={form.sweat_basic} onChange={v => setF('sweat_basic', v)} integer />
              <NumField label="Sweat Elite Sold" value={form.sweat_elite} onChange={v => setF('sweat_elite', v)} integer />
              <NumField label="Total Memberships" value={form.total_memberships} onChange={v => setF('total_memberships', v)} integer />
            </div>
          </section>

          <section>
            <SectionHeader icon={Phone} label="Activity" />
            <div className="grid grid-cols-2 gap-3 mb-2">
              <NumField label="Calls Made" value={form.calls_made} onChange={v => setF('calls_made', v)} integer />
              <NumField label="Texts Made" value={form.texts_made} onChange={v => setF('texts_made', v)} integer />
            </div>
            <div className="flex items-center justify-between rounded-lg bg-orange-50 border border-orange-200 px-3 py-2">
              <span className="text-xs text-orange-700 font-medium">📞 Goal: 50 outreaches per shift (calls or texts)</span>
              <span className="text-xs font-bold text-orange-800">{(Number(form.calls_made) || 0) + (Number(form.texts_made) || 0)} total</span>
            </div>
          </section>

          <section>
            <SectionHeader icon={TrendingUp} label="Bonus Overrides" />
            <div className="grid grid-cols-2 gap-3">
              <NumField label="ITB Bonus Override" prefix="$" value={form.itb_bonus_override} onChange={v => setF('itb_bonus_override', v)} placeholder="Auto" />
              {isManager && <NumField label="Net EFT Bonus Override" prefix="$" value={form.net_eft_bonus_override} onChange={v => setF('net_eft_bonus_override', v)} placeholder="Auto" />}
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Override Note</label>
                <input type="text" value={form.itb_bonus_note} onChange={e => setF('itb_bonus_note', e.target.value)}
                  placeholder="Reason…"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600" />
              </div>
            </div>
          </section>

          {isManager && (
            <div className="bg-purple-50 rounded-xl border border-purple-200 p-4 text-xs text-purple-700">
              <p className="font-semibold mb-1">Studio figures used for manager bonuses (from Studio Trends)</p>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <div><span className="text-purple-500">Retail + Mbr Cash</span><br /><strong>{fmt$(Number(studioData.retail || 0) + Number(studioData.membership_cash || 0))}</strong></div>
                <div><span className="text-purple-500">In The Bank</span><br /><strong>{fmt$(studioData.in_the_bank)}</strong></div>
                <div><span className="text-purple-500">Net EFT</span><br /><strong>{fmt$(studioData.net_eft)}</strong></div>
              </div>
            </div>
          )}

          <CommissionBreakdown commission={preview} isManager={isManager} />

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
            <button onClick={save} disabled={saving} className="flex-1 bg-red-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-red-600-hover transition-colors disabled:opacity-60">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Team Performance Leaderboard ─────────────────────────────────────────────

function TeamPerformance({ month, year, currentUserId }) {
  const [data, setPrev]       = useState([])
  const [curr, setCurr]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [metric, setMetric]   = useState('members')

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear  = month === 1 ? year - 1 : year
    try {
      const [current, previous] = await Promise.all([
        apiGet(`/api/goals/leaderboard?month=${month}&year=${year}`),
        apiGet(`/api/goals/leaderboard?month=${prevMonth}&year=${prevYear}`),
      ])
      setCurr(current)
      setPrev(previous)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [month, year])

  useEffect(() => { load() }, [load])

  if (loading) return <Spinner />
  if (error)   return <ErrorBox>{error}</ErrorBox>

  // Assign stable colors by alphabetical name order
  const colorMap = {}
  ;[...curr].sort((a, b) => a.tsa_name.localeCompare(b.tsa_name)).forEach((m, i) => {
    colorMap[m.tsa_id] = PALETTE[i % PALETTE.length]
  })

  // Previous month lookup
  const prevMap = {}
  for (const p of data) prevMap[p.tsa_id] = p

  // Pacing context
  const today         = new Date()
  const daysInMonth   = new Date(year, month, 0).getDate()
  const isCurrentMonth = month === today.getMonth() + 1 && year === today.getFullYear()
  const dayOfMonth    = isCurrentMonth ? today.getDate() : daysInMonth
  const monthElapsed  = dayOfMonth / daysInMonth

  // Sort by raw numbers — who actually sold the most
  function score(m) {
    if (metric === 'members')  return m.total_memberships || 0
    if (metric === 'retail')   return m.retail_actual || 0
    return (m.calls_made || 0) + (m.texts_made || 0)
  }

  const sorted = [...curr].sort((a, b) => score(b) - score(a))

  // Dense ranking: ties share the same rank, next rank is sequential (not skipped)
  const denseRanks = []
  sorted.forEach((member, idx) => {
    if (idx === 0) { denseRanks.push(1); return }
    const prev = denseRanks[idx - 1]
    denseRanks.push(score(member) === score(sorted[idx - 1]) ? prev : prev + 1)
  })
  // Build a map from tsa_id → dense rank for quick lookup
  const rankMap = Object.fromEntries(sorted.map((m, i) => [m.tsa_id, denseRanks[i]]))

  // Max outreach in the current group (for relative bar fill)
  const maxOutreach = Math.max(1, ...curr.map(m => (m.calls_made || 0) + (m.texts_made || 0)))

  // All members in top 3 rank positions with a non-zero score — every tied member gets their own slot
  const podiumMembers  = sorted.filter(m => score(m) > 0 && rankMap[m.tsa_id] <= 3)
  const uniquePodiumRanks = [...new Set(podiumMembers.map(m => rankMap[m.tsa_id]))]
  const PODIUM_HEIGHT  = { 1: 'h-28', 2: 'h-20', 3: 'h-14' }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-500" />
          <h2 className="text-sm font-semibold text-gray-700">Team Performance</h2>
        </div>
        {isCurrentMonth && (
          <span className="text-xs bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full">
            Day {dayOfMonth} of {daysInMonth} · {Math.round(monthElapsed * 100)}% through the month
          </span>
        )}
      </div>

      {/* Metric toggle */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
        {[
          { key: 'members',  label: '👥 Members Sold' },
          { key: 'retail',   label: '💰 Retail Sales' },
          { key: 'outreach', label: '📞 Outreach' },
        ].map(opt => (
          <button key={opt.key} onClick={() => setMetric(opt.key)}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
              metric === opt.key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {opt.label}
          </button>
        ))}
      </div>

      {/* Podium — every tied member gets their own equal-height slot */}
      {uniquePodiumRanks.length >= 2 && (
        <div className="mb-6 flex items-end justify-center gap-2 flex-wrap">
          {podiumMembers.map(m => (
            <PodiumSlot
              key={m.tsa_id}
              member={m}
              rank={rankMap[m.tsa_id]}
              metric={metric}
              colors={colorMap[m.tsa_id]}
              isMe={m.tsa_id === currentUserId}
              height={PODIUM_HEIGHT[rankMap[m.tsa_id]]}
            />
          ))}
        </div>
      )}

      {/* Leaderboard cards */}
      <div className="space-y-3">
        {sorted.map((member) => {
          const colors  = colorMap[member.tsa_id] || PALETTE[0]
          const isMe    = member.tsa_id === currentUserId
          const rank    = rankMap[member.tsa_id]
          const prev    = prevMap[member.tsa_id]

          const mActual = member.total_memberships || 0
          const mGoal   = member.memberships_goal_computed || 0
          const mPct    = mGoal > 0 ? mActual / mGoal : null

          const rActual = member.retail_actual || 0
          const rGoal   = member.retail_goal_computed || 0
          const rPct    = rGoal > 0 ? rActual / rGoal : null

          // Outreach totals + goal
          const oActual = (member.calls_made || 0) + (member.texts_made || 0)
          const oGoal   = member.outreach_goal || 0
          const oPct    = oGoal > 0 ? oActual / oGoal : null

          // Primary display value for big score
          const primaryRaw = metric === 'members' ? mActual : metric === 'retail' ? rActual : oActual
          const primaryPct = metric === 'members' ? mPct : metric === 'retail' ? rPct : oPct

          // Pacing badge
          const pacingLabel = isCurrentMonth && primaryPct != null
            ? primaryPct >= monthElapsed * 0.9 ? { label: '✓ On Pace', cls: 'bg-green-100 text-green-700' }
            : primaryPct >= monthElapsed * 0.6  ? { label: '↗ Almost',  cls: 'bg-yellow-100 text-yellow-700' }
            : { label: '⚠ Behind', cls: 'bg-red-100 text-red-700' }
            : null

          // Trend vs last month — compare raw numbers so it's always meaningful
          let trendLabel = null
          if (prev) {
            const currRaw = score(member)
            const prevRaw = metric === 'members'  ? (prev.total_memberships || 0)
              : metric === 'retail'   ? (prev.retail_actual || 0)
              : ((prev.calls_made || 0) + (prev.texts_made || 0))
            if (currRaw > 0 || prevRaw > 0) {
              const delta = currRaw - prevRaw
              trendLabel = delta > 0
                ? { label: '↑ vs last month', cls: 'text-green-600' }
                : delta < 0
                ? { label: '↓ vs last month', cls: 'text-red-500' }
                : { label: '→ same as last month', cls: 'text-gray-400' }
            }
          }

          return (
            <div key={member.tsa_id}
              className={`rounded-2xl overflow-hidden ${
                isMe ? 'ring-2 ring-yellow-400 shadow-lg shadow-yellow-100/60' : 'border border-gray-200'
              }`}>
              {/* Top row */}
              <div className="flex items-center gap-3 px-4 py-4 bg-white">
                {/* Rank */}
                <div className="flex-shrink-0 w-9 text-center">
                  {rank <= 3
                    ? <span className="text-2xl leading-none">{MEDALS[rank - 1]}</span>
                    : <span className="text-base font-bold text-gray-300">#{rank}</span>
                  }
                </div>

                {/* Avatar */}
                <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${colors.avatar} overflow-hidden`}>
                  {member.avatar_url
                    ? <img src={member.avatar_url} className="w-full h-full object-cover" alt={member.tsa_name} />
                    : <span className="text-xl font-bold text-white">{member.tsa_name.charAt(0)}</span>
                  }
                </div>

                {/* Name + badges */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-gray-900 truncate">{member.tsa_name}</span>
                    {isMe && (
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-semibold border border-yellow-200">
                        You
                      </span>
                    )}
                    {member.tsa_role === 'manager' && (
                      <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">Manager</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {pacingLabel && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pacingLabel.cls}`}>{pacingLabel.label}</span>
                    )}
                    {trendLabel && (
                      <span className={`text-xs font-medium ${trendLabel.cls}`}>{trendLabel.label}</span>
                    )}
                  </div>
                </div>

                {/* Big score */}
                <div className="flex-shrink-0 text-right">
                  <p className={`text-2xl font-black ${primaryPct != null && primaryPct >= 1 ? 'text-green-600' : colors.text}`}>
                    {metric === 'members'
                      ? primaryRaw
                      : metric === 'retail'
                      ? `$${Number(primaryRaw).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
                      : primaryRaw}
                  </p>
                  <p className="text-xs text-gray-400">
                    {primaryPct != null ? `${Math.round(primaryPct * 100)}% of goal` : 'no goal set'}
                  </p>
                </div>
              </div>

              {/* Progress bars section */}
              <div className={`px-4 pb-4 pt-3 ${colors.light}`}>
                {/* Members bar */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className={`font-semibold ${metric === 'members' ? 'text-gray-800' : 'text-gray-400'}`}>
                      👥 Members Sold
                    </span>
                    <span className={`font-medium ${metric === 'members' ? 'text-gray-800' : 'text-gray-400'}`}>
                      {mActual}
                      {mGoal > 0 ? ` / ${mGoal}` : ''}
                      {(member.sweat_basic > 0 || member.sweat_elite > 0) && (
                        <span className="text-gray-400 font-normal ml-1">
                          ({member.sweat_basic}B · {member.sweat_elite}E)
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-3 bg-white/70 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${mPct != null && mPct >= 1 ? 'bg-green-500' : metric === 'members' ? colors.bar : 'bg-gray-300'}`}
                      style={{ width: `${Math.min(100, (mPct || 0) * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Retail bar */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className={`font-semibold ${metric === 'retail' ? 'text-gray-800' : 'text-gray-400'}`}>
                      💰 Retail Sales
                    </span>
                    <span className={`font-medium ${metric === 'retail' ? 'text-gray-800' : 'text-gray-400'}`}>
                      ${rActual.toLocaleString()}
                      {rGoal > 0 ? ` / $${rGoal.toLocaleString()}` : ''}
                    </span>
                  </div>
                  <div className="h-3 bg-white/70 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${rPct != null && rPct >= 1 ? 'bg-green-500' : metric === 'retail' ? colors.bar : 'bg-gray-300'}`}
                      style={{ width: `${Math.min(100, (rPct || 0) * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Outreach split bar — calls (blue) + texts (orange) */}
                {metric === 'outreach' && (() => {
                  const calls   = member.calls_made || 0
                  const texts   = member.texts_made || 0
                  const callPct = Math.round((calls  / maxOutreach) * 100)
                  const textPct = Math.round((texts  / maxOutreach) * 100)
                  const goalPct = oGoal > 0 ? Math.min(100, Math.round((oGoal / maxOutreach) * 100)) : null
                  return (
                    <div className="mt-1">
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="font-semibold text-gray-800">📞 Outreach</span>
                        <span className="font-medium text-gray-600">
                          {oActual}{oGoal > 0 ? ` / ${oGoal} goal` : ''}
                        </span>
                      </div>
                      {/* Stacked bar */}
                      <div className="relative h-3 bg-white/70 rounded-full overflow-hidden">
                        <div className="absolute inset-0 flex">
                          <div className="h-full bg-blue-400 flex-none transition-all" style={{ width: `${callPct}%` }} />
                          <div className="h-full bg-orange-400 flex-none transition-all" style={{ width: `${textPct}%` }} />
                        </div>
                        {/* Goal marker */}
                        {goalPct != null && goalPct < 100 && (
                          <div className="absolute top-0 bottom-0 w-0.5 bg-gray-500/40"
                            style={{ left: `${goalPct}%` }} />
                        )}
                      </div>
                      {/* Legend */}
                      <div className="flex gap-3 mt-1.5">
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <span className="w-2 h-2 rounded-full bg-blue-400 flex-none" />
                          {calls} calls
                        </span>
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <span className="w-2 h-2 rounded-full bg-orange-400 flex-none" />
                          {texts} texts
                        </span>
                        {oGoal > 0 && (
                          <span className="text-xs text-gray-400 ml-auto">
                            {member.shift_count} shift{member.shift_count !== 1 ? 's' : ''} × 50
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })()}

                {/* Footer row */}
                <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
                  <span>{member.scheduled_hours}h scheduled · {Math.round((member.hours_pct || 0) * 100)}% of team hours</span>
                  {primaryPct != null && primaryPct >= 1 && (
                    <span className="text-green-600 font-semibold">🎉 Goal met!</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {curr.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Trophy className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No schedule data for this month yet.</p>
        </div>
      )}
    </div>
  )
}

function PodiumSlot({ member, rank, metric, colors, isMe, height }) {
  const val = metric === 'members'
    ? `${member.total_memberships} mbrs`
    : metric === 'retail'
    ? `$${Number(member.retail_actual || 0).toLocaleString()}`
    : `${(member.calls_made || 0) + (member.texts_made || 0)} contacts`

  return (
    <div className="flex flex-col items-center gap-2 w-24">
      {/* Medal */}
      <span className="text-2xl">{MEDALS[rank - 1]}</span>
      {/* Avatar */}
      <div className={`w-14 h-14 rounded-full flex items-center justify-center ${colors?.avatar || 'bg-gray-400'} ${isMe ? 'ring-3 ring-yellow-400' : ''} overflow-hidden flex-shrink-0`}>
        {member.avatar_url
          ? <img src={member.avatar_url} className="w-full h-full object-cover" alt={member.tsa_name} />
          : <span className="text-2xl font-black text-white">{member.tsa_name.charAt(0)}</span>
        }
      </div>
      {/* Name */}
      <p className="text-xs font-bold text-gray-900 text-center truncate w-full">{member.tsa_name.split(' ')[0]}</p>
      {/* Podium block */}
      <div className={`w-full ${height} ${colors?.avatar || 'bg-gray-400'} rounded-t-lg flex items-center justify-center`}>
        <span className="text-white text-xs font-bold text-center px-1">{val}</span>
      </div>
    </div>
  )
}

// ─── Goal progress bar (TSA view) ────────────────────────────────────────────

function GoalProgressBar({ label, actual, goal, prefix = '', perShift }) {
  const a = Number(actual) || 0
  const g = Number(goal)   || 0
  if (g <= 0) return null
  const pct = Math.min(100, Math.round((a / g) * 100))
  const met = a >= g
  const color = met ? 'bg-green-500' : pct >= 75 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <div className="text-right">
          <span className={`text-sm font-bold ${met ? 'text-green-600' : 'text-gray-900'}`}>
            {prefix}{a.toLocaleString()}
          </span>
          <span className="text-xs text-gray-400 ml-1">/ {prefix}{g.toLocaleString()} goal</span>
        </div>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between">
        <span className={`text-xs ${met ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
          {pct}%{met ? ' ✓ Goal met!' : ' complete'}
        </span>
        {perShift != null && (
          <span className="text-xs text-gray-400">{prefix}{Number(perShift).toLocaleString()} / shift</span>
        )}
      </div>
    </div>
  )
}

// ─── My Goals (TSA view) ─────────────────────────────────────────────────────

function MyGoals({ month, year }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { const r = await apiGet(`/api/goals/personal?month=${month}&year=${year}`); setData(r[0] || null) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [month, year])

  useEffect(() => { load() }, [load])

  if (loading) return <Spinner />
  const g = data || {}
  const c = g.commission || calcCommission(g, 'tsa')
  const todayStr = new Date().toLocaleDateString('en-CA')
  const isCurrentMonth = month === new Date().getMonth() + 1 && year === new Date().getFullYear()
  const todayShiftsWithNotes = (g.todays_shifts || []).filter(s => s.notes)
  const hasComputedGoals = g.memberships_goal_computed || g.retail_goal_computed
  const st = g.studio_targets || {}

  return (
    <div className="space-y-4">
      {error && <ErrorBox>{error}</ErrorBox>}

      {/* Today's shift notes */}
      {isCurrentMonth && todayShiftsWithNotes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-800">Notes for Today's Shift</h3>
          </div>
          <div className="space-y-2">
            {todayShiftsWithNotes.map(s => (
              <div key={s.id} className="flex gap-3">
                <span className="text-xs text-amber-600 font-medium whitespace-nowrap mt-0.5">
                  {fmtTime(s.start_time)}–{fmtTime(s.end_time)}
                </span>
                <p className="text-sm text-amber-900">{s.notes}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My Goals — Members + Retail only (EFT is a studio metric) */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">My Goals</h2>
          {g.scheduled_hours > 0 && (
            <span className="text-xs text-gray-400">
              {g.scheduled_hours}h · {Math.round((g.hours_pct || 0) * 100)}% of team hours
            </span>
          )}
        </div>
        {hasComputedGoals ? (
          <div className="space-y-5">
            <GoalProgressBar label="New Members"  actual={g.total_memberships} goal={g.memberships_goal_computed}             perShift={g.memberships_per_shift} />
            <GoalProgressBar label="Retail Sales" actual={g.retail_actual}     goal={g.retail_goal_computed}      prefix="$" perShift={g.retail_per_shift} />
          </div>
        ) : (
          <p className="text-sm text-gray-400">No schedule or studio goals set for this month yet.</p>
        )}
      </div>

      {/* Outreach Goal */}
      {(() => {
        const calls      = Number(g.calls_made)  || 0
        const texts      = Number(g.texts_made)  || 0
        const total      = calls + texts
        const shifts     = g.scheduled_shifts || 0
        const goalPerShift = 50
        const monthGoal  = shifts * goalPerShift
        const pct        = monthGoal > 0 ? Math.min(100, Math.round((total / monthGoal) * 100)) : null
        const met        = monthGoal > 0 && total >= monthGoal
        const color      = met ? 'bg-green-500' : pct != null && pct >= 75 ? 'bg-yellow-500' : 'bg-red-500'
        return (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold text-gray-700">📞 Outreach</h2>
              <span className="text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-semibold">
                Goal: 50 per shift
              </span>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Calls and texts count equally — hit 50 every shift you work.
            </p>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="text-center border border-gray-100 rounded-xl p-3">
                <p className="text-2xl font-black text-gray-900">{calls}</p>
                <p className="text-xs text-gray-400 mt-0.5">Calls</p>
              </div>
              <div className="text-center border border-gray-100 rounded-xl p-3">
                <p className="text-2xl font-black text-gray-900">{texts}</p>
                <p className="text-xs text-gray-400 mt-0.5">Texts</p>
              </div>
              <div className={`text-center rounded-xl p-3 ${met ? 'bg-green-50 border border-green-200' : 'border border-gray-100'}`}>
                <p className={`text-2xl font-black ${met ? 'text-green-600' : 'text-gray-900'}`}>{total}</p>
                <p className="text-xs text-gray-400 mt-0.5">Total</p>
              </div>
            </div>
            {monthGoal > 0 ? (
              <>
                <div className="flex justify-between items-baseline mb-1.5">
                  <span className="text-sm font-medium text-gray-700">Monthly total</span>
                  <span className={`text-sm font-bold ${met ? 'text-green-600' : 'text-gray-900'}`}>
                    {total} <span className="text-xs text-gray-400 font-normal">/ {monthGoal} goal</span>
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
                  <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between">
                  <span className={`text-xs ${met ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
                    {pct}%{met ? ' ✓ Goal met!' : ' complete'}
                  </span>
                  <span className="text-xs text-gray-400">{shifts} shift{shifts !== 1 ? 's' : ''} × {goalPerShift} = {monthGoal} total goal</span>
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-400">No shifts scheduled yet — goal will appear once your schedule is set.</p>
            )}
          </div>
        )
      })()}

      {/* Studio Goals context */}
      {(st.memberships_target > 0 || st.retail_target > 0) && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Studio Team Goals</h2>
          <div className="grid grid-cols-2 gap-3">
            {st.memberships_target > 0 && (
              <div className="text-center border border-gray-100 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">Team Members Goal</p>
                <p className="text-lg font-bold text-gray-900">{st.memberships_target}</p>
              </div>
            )}
            {st.retail_target > 0 && (
              <div className="text-center border border-gray-100 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-1">Team Retail Goal</p>
                <p className="text-lg font-bold text-gray-900">${Number(st.retail_target).toLocaleString()}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Shift-by-shift breakdown */}
      {(g.all_shifts || []).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Your Shifts This Month</h2>
            {hasComputedGoals && (
              <span className="text-xs text-gray-400">targets per shift shown below</span>
            )}
          </div>
          <div className="space-y-2">
            {(g.all_shifts || []).map(s => {
              const isToday = s.shift_date === todayStr
              const isPast  = s.shift_date < todayStr
              return (
                <div key={s.id} className={`rounded-xl border p-3 ${isToday ? 'border-red-300 bg-red-50' : isPast ? 'border-gray-100 bg-gray-50' : 'border-gray-200 bg-white'}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${isToday ? 'text-red-700' : isPast ? 'text-gray-500' : 'text-gray-900'}`}>
                        {fmtShiftDate(s.shift_date)}
                      </span>
                      <span className={`text-xs ${isToday ? 'text-red-500' : 'text-gray-400'}`}>
                        {fmtTime(s.start_time)}–{fmtTime(s.end_time)}
                      </span>
                      {isToday && <span className="text-xs bg-red-600 text-white px-1.5 py-0.5 rounded-full font-medium">Today</span>}
                    </div>
                    <div className="flex gap-3 text-xs text-gray-500 flex-wrap">
                      {hasComputedGoals && g.memberships_per_shift != null && <span className="font-medium text-gray-700">Mbrs: <span className="text-blue-600">{g.memberships_per_shift}</span></span>}
                      {hasComputedGoals && g.retail_per_shift != null && <span className="font-medium text-gray-700">Retail: <span className="text-purple-600">${Number(g.retail_per_shift).toLocaleString()}</span></span>}
                      <span className="font-medium text-gray-700">Outreach: <span className="text-orange-600">50</span></span>
                    </div>
                  </div>
                  {s.notes && (
                    <div className="mt-2 flex gap-2">
                      <MessageSquare className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-gray-700">{s.notes}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <CommissionBreakdown commission={c} isManager={false} />
    </div>
  )
}

// ─── Commission Breakdown ─────────────────────────────────────────────────────

function CommissionBreakdown({ commission: c, isManager }) {
  if (!c) return null
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-red-600" />
        <p className="text-sm font-semibold text-gray-700">Commission Breakdown</p>
        <span className="text-xs text-gray-400">Quota: {fmt$(c.eft_quota)}</span>
      </div>
      <div className="space-y-1.5">
        <CommLine label={`EFT Commission (${pct(c.eft_rate)} — ${c.eft_exceeds ? '✓ Above quota' : 'Below quota'})`}
          value={fmt$(c.eft_commission)} highlight={c.eft_exceeds} />
        <CommLine label="PIF Commission (5% / 10%)" value={fmt$(c.pif_commission)} />
        {isManager ? (
          <>
            <CommLine
              label={`Retail + Membership Cash (4%${c.rm_qualifies ? ' — ✓ $5k met' : ' — below $5k min'})`}
              value={fmt$(c.rm_bonus)} highlight={c.rm_qualifies} />
            <CommLine label="ITB Bonus (studio In The Bank)" value={fmt$(c.itb_bonus)} highlight={c.itb_bonus > 0} />
            <CommLine label="Net EFT Tier Bonus" value={fmt$(c.net_eft_bonus)} highlight={c.net_eft_bonus > 0} />
          </>
        ) : (
          <>
            <CommLine label={`Retail Commission (${pct(c.retail_rate)})`} value={fmt$(c.retail_commission)} />
            <CommLine label="ITB Bonus" value={fmt$(c.itb_bonus)} highlight={c.itb_bonus > 0} />
          </>
        )}
        <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between items-center">
          <p className="text-sm font-bold text-gray-900">Total Est. Commission</p>
          <p className="text-lg font-bold text-red-600">{fmt$(c.total)}</p>
        </div>
      </div>
    </div>
  )
}

function CommLine({ label, value, highlight }) {
  return (
    <div className="flex justify-between items-center">
      <p className={`text-xs ${highlight ? 'text-green-700 font-medium' : 'text-gray-500'}`}>{label}</p>
      <p className={`text-sm font-medium ${highlight ? 'text-green-700' : 'text-gray-700'}`}>{value}</p>
    </div>
  )
}

function SectionHeader({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-gray-400" />
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
    </div>
  )
}

function pct(r) { return `${Math.round((r || 0) * 100)}%` }
function Spinner() { return <div className="flex items-center justify-center py-16 text-gray-400"><RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…</div> }
function ErrorBox({ children }) { return <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm mb-4">{children}</div> }
