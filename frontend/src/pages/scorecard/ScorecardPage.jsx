import { useState, useEffect, useCallback, useRef } from 'react'
import { apiGet, apiPut, apiPost } from '@/hooks/useApi'
import { useMonth } from '@/hooks/useMonth'
import { useStudio } from '@/contexts/StudioContext'
import { useRole } from '@/hooks/useRole'
import { formatCurrency, formatMonthYear } from '@/lib/utils'
import {
  CheckCircle2, AlertTriangle, XCircle, MinusCircle,
  Printer, Settings2, ClipboardCheck, Loader2, Save, RotateCcw,
  ChevronUp, ChevronDown, ExternalLink, Building2,
} from 'lucide-react'
import { Link } from 'react-router-dom'

// ── Status logic ────────────────────────────────────────────────────────────
// Color thresholds come from the API (editable constants, not hard-coded here).
function computeStatus(metric, thresholds) {
  const { actual, goal, type, lowerIsBetter } = metric
  const g = { green: thresholds?.green ?? 1, amber: thresholds?.amber ?? 0.8 }

  if (type === 'boolean') {
    if (actual == null || actual === '') return 'empty'
    return Number(actual) ? 'green' : 'red'
  }
  if (type === 'date' || type === 'text') {
    return (actual == null || actual === '') ? 'empty' : 'green'
  }
  if (actual == null || actual === '') return 'empty'
  const a = Number(actual)

  if (lowerIsBetter) {
    if (goal === 0) {
      if (a <= 0) return 'green'
      if (a <= 1) return 'amber'
      return 'red'
    }
    const ratio = a / goal
    if (ratio <= g.green) return 'green'
    if (ratio <= 1.25) return 'amber'
    return 'red'
  }

  if (!goal) return 'empty'
  const ratio = a / goal
  if (ratio >= g.green) return 'green'
  if (ratio >= g.amber) return 'amber'
  return 'red'
}

const STATUS_META = {
  green: { label: 'On target',  Icon: CheckCircle2,  text: 'text-green-700', bg: 'bg-green-50',  border: 'border-green-200', dot: 'bg-green-500' },
  amber: { label: 'Close',      Icon: AlertTriangle, text: 'text-amber-700', bg: 'bg-amber-50',  border: 'border-amber-200', dot: 'bg-amber-500' },
  red:   { label: 'Off target', Icon: XCircle,       text: 'text-red-700',   bg: 'bg-red-50',    border: 'border-red-200',   dot: 'bg-red-500' },
  empty: { label: 'No data',    Icon: MinusCircle,   text: 'text-gray-400',  bg: 'bg-gray-50',   border: 'border-gray-200',  dot: 'bg-gray-300' },
}
function statusLabel(metric, status) {
  if (metric.type === 'boolean') return status === 'green' ? 'Met' : status === 'red' ? 'Not met' : 'No data'
  if (metric.type === 'date')  return status === 'green' ? 'Held' : 'Not yet'
  if (metric.type === 'text')  return status === 'green' ? 'Logged' : 'Not yet'
  return STATUS_META[status].label
}

// ── Value formatting ─────────────────────────────────────────────────────────
function formatValue(type, v) {
  if (v == null || v === '') return '—'
  if (type === 'text') return String(v)
  if (type === 'date') return new Date(String(v) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const n = Number(v)
  if (type === 'currency') return formatCurrency(n)
  if (type === 'percent') return `${n}%`
  if (type === 'rating') return `${n.toFixed(1)}★`
  if (type === 'boolean') return n ? 'Yes' : 'No'
  return n.toLocaleString()
}
function formatGoal(metric) {
  if (metric.type === 'date' || metric.type === 'text') return null  // no numeric goal
  if (metric.type === 'boolean') return 'Yes'
  return formatValue(metric.type, metric.goal)
}

// ── Editable actual input ─────────────────────────────────────────────────────
function ActualInput({ metric, value, readOnly, large, onChange, onCommit }) {
  // Auto-pulled metrics are read-only: render the value as static text.
  if (readOnly) {
    return <span className={`font-bold text-gray-900 ${large ? 'text-2xl' : 'text-sm'}`}>{formatValue(metric.type, value)}</span>
  }
  if (metric.type === 'date') {
    return (
      <input
        type="date"
        value={value || ''}
        onChange={(e) => onCommit(e.target.value || null)}
        className="bg-white border border-gray-300 rounded-lg text-sm text-gray-900 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[var(--studio-accent)]/30 focus:border-[var(--studio-accent)]"
      />
    )
  }
  if (metric.type === 'text') {
    return (
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onCommit(e.target.value === '' ? null : e.target.value)}
        placeholder="Add challenge…"
        className="bg-white border border-gray-300 rounded-lg text-sm text-gray-900 px-2.5 py-1 w-48 focus:outline-none focus:ring-2 focus:ring-[var(--studio-accent)]/30 focus:border-[var(--studio-accent)]"
      />
    )
  }
  if (metric.type === 'boolean') {
    const on = Number(value) === 1
    return (
      <div className="inline-flex rounded-lg overflow-hidden border border-gray-300">
        {['Yes', 'No'].map((opt, i) => {
          const isOn = (i === 0) === on && value != null && value !== ''
          return (
            <button
              key={opt}
              type="button"
              disabled={readOnly}
              onClick={() => onCommit(i === 0 ? 1 : 0)}
              className={`px-3 py-1 text-sm font-medium transition-colors ${
                isOn
                  ? (i === 0 ? 'bg-green-600 text-white' : 'bg-red-600 text-white')
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              } ${i === 0 ? 'border-r border-gray-300' : ''} disabled:opacity-60`}
            >
              {opt}
            </button>
          )
        })}
      </div>
    )
  }
  const prefix = metric.type === 'currency' ? '$' : null
  const suffix = metric.type === 'percent' ? '%' : metric.type === 'rating' ? '★' : null
  return (
    <div className="relative inline-flex items-center">
      {prefix && <span className={`absolute left-2 text-gray-400 ${large ? 'text-xl' : 'text-sm'}`}>{prefix}</span>}
      <input
        type="number"
        step={metric.type === 'rating' ? '0.1' : '1'}
        value={value ?? ''}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onCommit(e.target.value === '' ? null : Number(e.target.value))}
        placeholder="—"
        className={`bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[var(--studio-accent)]/30 focus:border-[var(--studio-accent)] read-only:bg-gray-50 ${
          large ? 'text-2xl font-bold w-full py-1' : 'text-sm w-24 py-1'
        } ${prefix ? 'pl-6' : 'pl-2.5'} ${suffix ? 'pr-6' : 'pr-2'}`}
      />
      {suffix && <span className={`absolute right-2 text-gray-400 ${large ? 'text-lg' : 'text-sm'}`}>{suffix}</span>}
    </div>
  )
}

// ── Hero card ─────────────────────────────────────────────────────────────────
function HeroCard({ metric, status, draft, readOnly, editGoals, onChange, onCommit, onGoalChange }) {
  const meta = STATUS_META[status]
  return (
    <div className={`scorecard-card rounded-2xl border ${meta.border} ${meta.bg} p-4 flex flex-col`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 leading-tight min-h-[2rem] flex items-start gap-1">
        <span className="flex-1">{metric.label}</span>
        {metric.auto && <span className="text-[8px] font-bold bg-gray-200 text-gray-500 px-1 py-0.5 rounded" title="Pulled automatically">AUTO</span>}
      </p>
      <div className="mt-2">
        <ActualInput metric={metric} value={draft} readOnly={readOnly} large onChange={onChange} onCommit={onCommit} />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        {editGoals ? (
          <span className="flex items-center gap-1 text-gray-500">
            Goal
            <input
              type="number" step={metric.type === 'rating' ? '0.1' : '1'}
              defaultValue={metric.goal}
              onChange={(e) => onGoalChange(metric.key, e.target.value)}
              className="w-16 border border-gray-300 rounded px-1 py-0.5 text-gray-900"
            />
          </span>
        ) : (
          <span className="text-gray-500">Goal: <span className="font-semibold text-gray-700">{formatGoal(metric)}</span></span>
        )}
        <span className={`inline-flex items-center gap-1 font-semibold ${meta.text}`}>
          <meta.Icon size={14} /> {statusLabel(metric, status)}
        </span>
      </div>
    </div>
  )
}

// ── Supporting metric row ─────────────────────────────────────────────────────
function MetricRow({ metric, status, draft, readOnly, editGoals, onChange, onCommit, onGoalChange, onLowerToggle,
                     expandList, expanded, onToggle, accessory }) {
  const meta = STATUS_META[status]
  const hasGoal = metric.type !== 'date' && metric.type !== 'text'
  return (
   <div className="scorecard-card border-b border-gray-100 last:border-0">
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${meta.dot}`} />
          <p className="text-sm font-medium text-gray-800 truncate">{metric.label}</p>
          {metric.auto && <span className="text-[8px] font-bold bg-gray-200 text-gray-500 px-1 py-0.5 rounded flex-shrink-0" title="Pulled automatically">AUTO</span>}
          {expandList && (
            <button onClick={onToggle} className="text-gray-400 hover:text-gray-600 flex-shrink-0" title="Show details">
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}
        </div>
        <p className="text-[11px] text-gray-400 pl-4 truncate">
          {metric.note ? `${metric.note} · ` : ''}<span className="uppercase">{metric.source}</span>
          {metric.lowerIsBetter ? ' · lower is better' : ''}
        </p>
        {accessory}
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        {hasGoal && (editGoals ? (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <span>Goal</span>
            <input
              type="number" step={metric.type === 'rating' ? '0.1' : '1'}
              defaultValue={metric.goal}
              onChange={(e) => onGoalChange(metric.key, e.target.value)}
              className="w-16 border border-gray-300 rounded px-1 py-0.5 text-gray-900"
            />
            {metric.type !== 'boolean' && (
              <label className="flex items-center gap-1 ml-1" title="Lower is better">
                <input type="checkbox" defaultChecked={metric.lowerIsBetter} onChange={(e) => onLowerToggle(metric.key, e.target.checked)} />
                <span className="text-[10px]">↓</span>
              </label>
            )}
          </div>
        ) : (
          <span className="text-xs text-gray-400 hidden sm:inline">Goal: {formatGoal(metric)}</span>
        ))}
        <ActualInput metric={metric} value={draft} readOnly={readOnly} onChange={onChange} onCommit={onCommit} />
        <span className={`text-[11px] font-semibold ${meta.text} w-16 text-right hidden md:inline`}>{statusLabel(metric, status)}</span>
      </div>
    </div>

    {expandList && expanded && (
      <div className="pl-4 pb-2.5 -mt-1 space-y-1">
        {expandList.length === 0 ? (
          <p className="text-[11px] text-gray-400 italic">Nothing logged this month yet.</p>
        ) : expandList.map((it) => (
          <div key={it.id} className="flex items-center gap-2 text-[11px] text-gray-500">
            <span className="w-1 h-1 rounded-full bg-gray-300 flex-shrink-0" />
            <span className="text-gray-700 font-medium truncate">{it.title}</span>
            {it.start_date && <span className="text-gray-400">· {new Date(it.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
            {it.event_type && <span className="text-gray-400 capitalize">· {String(it.event_type).replace(/_/g, ' ')}</span>}
            {it.promo_type && <span className="text-gray-400 capitalize">· {String(it.promo_type).replace(/_/g, ' ')}</span>}
          </div>
        ))}
      </div>
    )}
   </div>
  )
}

// ── Business of the Month card (accessory under that metric row) ───────────────
function BusinessOfMonthCard({ bom }) {
  return (
    <div className="ml-4 mt-2 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
      {bom.logo_url ? (
        <img src={bom.logo_url} alt={bom.business_name} className="w-9 h-9 rounded-md object-cover flex-shrink-0 bg-white" />
      ) : (
        <div className="w-9 h-9 rounded-md bg-amber-100 flex items-center justify-center flex-shrink-0"><Building2 size={16} className="text-amber-600" /></div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 truncate">{bom.business_name}</p>
        <div className="flex items-center gap-3 text-[11px]">
          <Link to="/b2b" className="text-amber-700 font-medium hover:underline inline-flex items-center gap-0.5">B2B card</Link>
          {bom.website && (
            <a href={bom.website.startsWith('http') ? bom.website : `https://${bom.website}`} target="_blank" rel="noreferrer"
               className="text-gray-500 hover:underline inline-flex items-center gap-0.5">Website <ExternalLink size={10} /></a>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Marketing funnel ──────────────────────────────────────────────────────────
// HOTWORX "Golden Ratio": 145 leads × 35% lead→member ≈ 50 members/month.
const GOLDEN = { leads: 145, leadToMember: 35, members: 50 }
const rate = (num, den) => (den > 0 ? Math.round((num / den) * 100) : null)

function GoldenChip({ label, actual, goal, suffix = '', lowerBound }) {
  // green ≥100% of goal, amber ≥80%, red below
  let cls = 'bg-gray-100 text-gray-400'
  if (actual != null) {
    const ratio = goal > 0 ? actual / goal : 1
    cls = ratio >= 1 ? 'bg-green-50 text-green-700 border-green-200'
      : ratio >= 0.8 ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-red-50 text-red-700 border-red-200'
  }
  return (
    <div className={`flex-1 rounded-lg border px-3 py-2 text-center ${cls}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-base font-bold leading-tight">
        {actual == null ? '—' : `${actual}${suffix}`}
        <span className="text-[11px] font-medium opacity-60"> / {goal}{suffix}</span>
      </p>
    </div>
  )
}

function MarketingFunnel({ funnel }) {
  if (!funnel) {
    return (
      <div className="scorecard-card bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-1">Marketing Funnel</h2>
        <p className="text-xs text-gray-400">Enter this month’s Studio Trends (Leads, Red Appts Booked/Held, New Members) to see the funnel.</p>
      </div>
    )
  }
  const f = funnel
  const stages = [
    { label: 'Leads',   value: f.leads,  op: 0.5 },
    { label: 'Booked',  value: f.booked, op: 0.67 },
    { label: 'Showed',  value: f.showed, op: 0.84 },
    { label: 'Closed (Members)', value: f.closed, op: 1 },
  ]
  const maxV = Math.max(f.leads, f.booked, f.showed, f.closed, 1)
  const convs = [
    rate(f.booked, f.leads),
    rate(f.showed, f.booked),
    rate(f.closed, f.showed),
  ]
  const leadToMember = rate(f.closed, f.leads)

  return (
    <div className="scorecard-card bg-white rounded-xl border border-gray-200 p-4 mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Marketing Funnel</h2>
        <span className="text-[11px] text-gray-400">Golden Ratio: <strong className="text-gray-600">145 leads → 35% → 50 members</strong></span>
      </div>

      <div className="space-y-1">
        {stages.map((s, i) => (
          <div key={s.label}>
            <div className="flex items-center" style={{ minHeight: '2.25rem' }}>
              <div
                className="rounded-md flex items-center justify-between px-3 text-white transition-all"
                style={{
                  width: `${Math.max((s.value / maxV) * 100, 22)}%`,
                  minHeight: '2.25rem',
                  backgroundColor: 'var(--studio-accent)',
                  opacity: s.op,
                }}
              >
                <span className="text-xs font-semibold drop-shadow-sm">{s.label}</span>
                <span className="text-base font-bold drop-shadow-sm">{(s.value || 0).toLocaleString()}</span>
              </div>
            </div>
            {i < convs.length && (
              <div className="flex items-center gap-1 pl-3 py-0.5 text-[11px] text-gray-400">
                <ChevronDown size={11} />
                <span><strong className="text-gray-500">{convs[i] == null ? '—' : `${convs[i]}%`}</strong> {['booked','showed','closed'][i]}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Golden-ratio scorecard */}
      <div className="flex gap-2 mt-3">
        <GoldenChip label="Leads" actual={f.leads} goal={GOLDEN.leads} />
        <GoldenChip label="Lead → Member" actual={leadToMember} goal={GOLDEN.leadToMember} suffix="%" />
        <GoldenChip label="Members" actual={f.closed} goal={GOLDEN.members} />
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ScorecardPage() {
  const { selectedMonth } = useMonth()
  const { currentStudio } = useStudio()
  const { isOwner } = useRole()
  const { month, year } = selectedMonth

  const [data, setData] = useState(null)
  const [draft, setDraft] = useState({})          // metric_key -> actual (local, mirrors server)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | error
  const [editGoals, setEditGoals] = useState(false)
  const [expanded, setExpanded] = useState({})     // metric_key -> bool
  const goalEdits = useRef({})                     // metric_key -> { goal, lower_is_better }

  const studioId = currentStudio?.id

  const load = useCallback(async () => {
    if (!studioId) return
    setLoading(true); setError(null)
    try {
      const res = await apiGet(`/api/scorecard/${year}/${month}`, studioId)
      setData(res)
      const d = {}
      for (const m of res.metrics) d[m.key] = m.actual
      setDraft(d)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [studioId, year, month])

  useEffect(() => { load() }, [load])

  const flashSaved = () => {
    setSaveState('saved')
    setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1800)
  }

  const commitActual = async (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setData((prev) => prev && { ...prev, metrics: prev.metrics.map((m) => m.key === key ? { ...m, actual: value } : m) })
    try {
      setSaveState('saving')
      await apiPut(`/api/scorecard/${year}/${month}`, { actuals: { [key]: value } }, studioId)
      flashSaved()
    } catch (e) {
      setSaveState('error'); setError(e.message)
    }
  }

  const saveGoals = async () => {
    const edits = goalEdits.current
    const goals = Object.entries(edits).map(([metric_key, v]) => ({ metric_key, ...v }))
    if (!goals.length) { setEditGoals(false); return }
    try {
      setSaveState('saving')
      await apiPut('/api/scorecard/goals', { goals }, studioId)
      goalEdits.current = {}
      setEditGoals(false)
      flashSaved()
      await load()
    } catch (e) {
      setSaveState('error'); setError(e.message)
    }
  }

  const onGoalChange = (key, val) => {
    goalEdits.current[key] = { ...(goalEdits.current[key] || {}), goal: val === '' ? null : Number(val) }
  }
  const onLowerToggle = (key, checked) => {
    goalEdits.current[key] = { ...(goalEdits.current[key] || {}), lower_is_better: checked }
  }

  const toggleReview = async () => {
    const next = !data?.reviewedAt
    try {
      setSaveState('saving')
      const res = await apiPost(`/api/scorecard/${year}/${month}/review`, { reviewed: next }, studioId)
      setData((prev) => prev && { ...prev, reviewedAt: res.reviewed_at, reviewedBy: res.reviewed_by, reviewedByName: next ? 'You' : null })
      flashSaved()
    } catch (e) {
      setSaveState('error'); setError(e.message)
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="animate-spin mr-2" size={18} /> Loading scorecard…
      </div>
    )
  }
  if (error && !data) {
    return (
      <div className="max-w-xl mx-auto mt-12 bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <p className="text-red-700 font-medium mb-1">Couldn’t load the scorecard</p>
        <p className="text-red-600 text-sm">{error}</p>
        <button onClick={load} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm">Try again</button>
      </div>
    )
  }

  const thresholds = data?.thresholds
  const heroMetrics = data?.metrics.filter((m) => m.isHero) || []
  const groupOrder = data?.groupOrder || []
  const groups = data?.groups || {}
  const reviewedDate = data?.reviewedAt ? new Date(data.reviewedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null

  return (
    <div className="scorecard-print max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Monthly Studio Scorecard</h1>
          <p className="text-sm text-gray-500">
            {currentStudio?.name || 'HOTWORX'} · <span className="font-medium text-gray-700">{formatMonthYear(month, year)}</span>
          </p>
        </div>

        <div className="flex items-center gap-2 no-print">
          {saveState === 'saving' && <span className="text-xs text-gray-400 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Saving…</span>}
          {saveState === 'saved' && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 size={12} /> Saved</span>}

          {isOwner && (editGoals ? (
            <>
              <button onClick={saveGoals} className="px-3 py-1.5 rounded-lg text-sm font-medium text-white flex items-center gap-1" style={{ backgroundColor: 'var(--studio-accent)' }}>
                <Save size={14} /> Save goals
              </button>
              <button onClick={() => { goalEdits.current = {}; setEditGoals(false) }} className="px-3 py-1.5 rounded-lg text-sm text-gray-600 border border-gray-300 flex items-center gap-1">
                Cancel
              </button>
            </>
          ) : (
            <button onClick={() => setEditGoals(true)} className="px-3 py-1.5 rounded-lg text-sm text-gray-700 border border-gray-300 hover:bg-gray-50 flex items-center gap-1">
              <Settings2 size={14} /> Edit goals
            </button>
          ))}

          {isOwner && (
            <button
              onClick={toggleReview}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1 border ${
                data?.reviewedAt ? 'bg-green-50 text-green-700 border-green-200' : 'text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {data?.reviewedAt ? <><RotateCcw size={14} /> Reviewed</> : <><ClipboardCheck size={14} /> Mark reviewed</>}
            </button>
          )}

          <button onClick={() => window.print()} className="px-3 py-1.5 rounded-lg text-sm font-medium text-white flex items-center gap-1" style={{ backgroundColor: 'var(--studio-accent)' }}>
            <Printer size={14} /> Export PDF
          </button>
        </div>
      </div>

      {/* Review status banner */}
      {data?.reviewedAt && (
        <div className="mb-4 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5">
          <CheckCircle2 size={13} /> Reviewed{data.reviewedByName ? ` by ${data.reviewedByName}` : ''}{reviewedDate ? ` · ${reviewedDate}` : ''}
        </div>
      )}

      {/* Hero row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {heroMetrics.map((m) => (
          <HeroCard
            key={m.key}
            metric={m}
            status={computeStatus({ ...m, actual: m.auto ? m.actual : draft[m.key] }, thresholds)}
            draft={m.auto ? m.actual : draft[m.key]}
            readOnly={!!m.auto}
            editGoals={editGoals}
            onChange={(v) => setDraft((d) => ({ ...d, [m.key]: v }))}
            onCommit={(v) => commitActual(m.key, v)}
            onGoalChange={onGoalChange}
          />
        ))}
      </div>

      {/* Marketing funnel */}
      <MarketingFunnel funnel={data.funnel} />

      {/* Grouped sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {groupOrder.map((gkey) => {
          const metrics = data.metrics.filter((m) => m.group === gkey)
          if (!metrics.length) return null
          const g = groups[gkey] || {}
          return (
            <section key={gkey} className="scorecard-card bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">{g.label}</h2>
                <span className="text-[10px] text-gray-400">{g.owner}</span>
              </div>
              <div>
                {metrics.map((m) => {
                  const val = m.auto ? m.actual : draft[m.key]
                  const expandList = m.key === 'events_held' ? (data.eventsThisMonth || [])
                    : m.key === 'promotions_run' ? (data.promosThisMonth || [])
                    : m.key === 'business_of_the_month' ? (data.bomEventsThisMonth || [])
                    : m.key === 'influencer_visits' ? (data.influencerEventsThisMonth || [])
                    : null
                  const bom = m.key === 'business_of_the_month' ? data.businessOfMonth : null
                  return (
                    <MetricRow
                      key={m.key}
                      metric={m}
                      status={computeStatus({ ...m, actual: val }, thresholds)}
                      draft={val}
                      readOnly={!!m.auto}
                      editGoals={editGoals}
                      onChange={(v) => setDraft((d) => ({ ...d, [m.key]: v }))}
                      onCommit={(v) => commitActual(m.key, v)}
                      onGoalChange={onGoalChange}
                      onLowerToggle={onLowerToggle}
                      expandList={expandList}
                      expanded={!!expanded[m.key]}
                      onToggle={() => setExpanded((s) => ({ ...s, [m.key]: !s[m.key] }))}
                      accessory={bom ? <BusinessOfMonthCard bom={bom} /> : null}
                    />
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      {/* Footer / data-source legend */}
      <div className="mt-6 pt-4 border-t border-gray-200 text-[11px] text-gray-400 leading-relaxed">
        <p className="font-medium text-gray-500 mb-1">Data sources</p>
        <p>Metrics tagged <span className="font-semibold text-gray-500">AUTO</span> pull live from other Team Hub modules (Studio Trends, Events, Maintenance) — enter those numbers in their own screens. The rest are manual entry here. Source labels show where each number comes from.</p>
        <p className="mt-1">
          Color status: <span className="text-green-600 font-medium">green ≥100% of goal</span> · <span className="text-amber-600 font-medium">amber 80–99%</span> · <span className="text-red-600 font-medium">red &lt;80%</span> (inverted for “lower is better” metrics).
        </p>
      </div>
    </div>
  )
}
