/**
 * AdvisorPage — Layer 2 AI Advisor
 *
 * Owner + Manager only. Displays AI-generated monthly recommendations
 * powered by studio data + team feedback signals.
 */

import { useState, useEffect } from 'react'
import { useMonth } from '@/contexts/MonthContext'
import { apiGet, apiPost } from '@/hooks/useApi'
import {
  Sparkles,
  Building2,
  Megaphone,
  Target,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Clock,
  ThumbsUp,
} from 'lucide-react'

const SECTION_ICONS = {
  Building2,
  Megaphone,
  Target,
  Sparkles,
}

const PRIORITY_STYLES = {
  high:   { dot: 'bg-red-500',    badge: 'bg-red-50 text-red-700 border-red-200',    label: 'High' },
  medium: { dot: 'bg-amber-400',  badge: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Medium' },
  low:    { dot: 'bg-gray-400',   badge: 'bg-gray-100 text-gray-600 border-gray-200',  label: 'Low' },
}

function PriorityBadge({ priority }) {
  const style = PRIORITY_STYLES[priority] || PRIORITY_STYLES.medium
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${style.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  )
}

function RecommendationCard({ item, index }) {
  return (
    <div className="flex gap-3 p-4 bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center mt-0.5">
        <span className="text-xs font-bold text-gray-500">{index + 1}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3 mb-1.5">
          <p className="font-semibold text-gray-900 text-sm leading-snug">{item.label}</p>
          <PriorityBadge priority={item.priority} />
        </div>
        <p className="text-sm text-gray-600 leading-relaxed mb-2">{item.reason}</p>
        {item.action && (
          <div className="flex items-start gap-1.5 mt-2 p-2.5 bg-gray-50 rounded-lg border border-gray-100">
            <ArrowRight size={13} className="text-brand-red flex-shrink-0 mt-0.5" />
            <p className="text-xs font-medium text-gray-700 leading-relaxed">{item.action}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function SectionCard({ section, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  const Icon = SECTION_ICONS[section.icon] || Sparkles
  const highCount = (section.items || []).filter(i => i.priority === 'high').length

  return (
    <div className="bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-5 hover:bg-gray-100/60 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-red/10 flex items-center justify-center flex-shrink-0">
            <Icon size={17} className="text-brand-red" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">{section.title}</h3>
            {section.summary && (
              <p className="text-xs text-gray-500 mt-0.5 leading-snug max-w-xl">{section.summary}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-4">
          {highCount > 0 && (
            <span className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
              {highCount} high priority
            </span>
          )}
          <span className="text-xs text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
            {(section.items || []).length}
          </span>
          {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </button>

      {/* Items */}
      {open && (
        <div className="px-5 pb-5 space-y-3">
          {(section.items || []).length === 0 ? (
            <p className="text-sm text-gray-400 italic py-2">No specific recommendations for this section.</p>
          ) : (
            section.items.map((item, i) => (
              <RecommendationCard key={i} item={item} index={i} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

function EmptyState({ onGenerate, generating }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center mb-5 border border-red-100">
        <Sparkles size={28} className="text-brand-red" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">No recommendations yet</h3>
      <p className="text-sm text-gray-500 max-w-sm mb-6 leading-relaxed">
        Your AI advisor analyzes feedback signals, B2B pipeline, events, and performance trends to generate personalized recommendations.
      </p>
      <button
        onClick={onGenerate}
        disabled={generating}
        className="flex items-center gap-2 px-5 py-2.5 bg-brand-red text-white rounded-xl font-semibold text-sm hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-wait"
      >
        {generating ? (
          <>
            <RefreshCw size={15} className="animate-spin" />
            Analyzing studio data…
          </>
        ) : (
          <>
            <Sparkles size={15} />
            Generate Recommendations
          </>
        )}
      </button>
    </div>
  )
}

export default function AdvisorPage() {
  const { month, year } = useMonth()
  const [cache, setCache]       = useState(null)   // last advisor_cache row
  const [loading, setLoading]   = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError]       = useState(null)

  const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' })

  // Load cached recommendations on mount / month change
  useEffect(() => {
    setLoading(true)
    setError(null)
    apiGet(`/api/advisor?month=${month}&year=${year}`)
      .then(data => setCache(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [month, year])

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      const data = await apiPost('/api/advisor/generate', { month, year })
      setCache(data)
    } catch (err) {
      setError(err.message || 'Failed to generate recommendations. Check that ANTHROPIC_API_KEY is set in your backend .env file.')
    } finally {
      setGenerating(false)
    }
  }

  const sections = cache?.recommendations?.sections || []
  const generatedAt = cache?.generated_at ? new Date(cache.generated_at) : null

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-brand-red/10 flex items-center justify-center">
              <Sparkles size={14} className="text-brand-red" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">AI Advisor</h1>
          </div>
          <p className="text-sm text-gray-500">
            Monthly recommendations for <span className="font-medium text-gray-700">{monthName} {year}</span> based on your studio data and team feedback.
          </p>
        </div>

        {cache && (
          <button
            onClick={generate}
            disabled={generating}
            title="Regenerate recommendations"
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-60 disabled:cursor-wait flex-shrink-0"
          >
            <RefreshCw size={13} className={generating ? 'animate-spin' : ''} />
            {generating ? 'Analyzing…' : 'Regenerate'}
          </button>
        )}
      </div>

      {/* Last generated timestamp */}
      {generatedAt && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Clock size={11} />
          Last generated {generatedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at{' '}
          {generatedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          <span className="mx-1">·</span>
          <ThumbsUp size={11} />
          Powered by your team&apos;s feedback signals
        </div>
      )}

      {/* How it works callout (shown when no data yet) */}
      {!loading && !cache && !generating && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800 flex gap-3">
          <Sparkles size={16} className="flex-shrink-0 mt-0.5 text-blue-500" />
          <div>
            <p className="font-semibold mb-1">How this works</p>
            <p className="leading-relaxed text-blue-700">
              Your advisor reads the 👍 / 😐 / 👎 signals your team has rated on events, promos, B2B partners, missions, and plays — then combines that with EOD performance data, your B2B pipeline, and monthly goals to generate specific, data-grounded recommendations.
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Could not generate recommendations</p>
            <p className="mt-1 text-red-600">{error}</p>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-28 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !cache && !generating && !error && (
        <EmptyState onGenerate={generate} generating={generating} />
      )}

      {/* Generating placeholder */}
      {generating && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-brand-red/10 flex items-center justify-center mb-4 border border-red-100">
            <Sparkles size={22} className="text-brand-red animate-pulse" />
          </div>
          <p className="font-semibold text-gray-900 mb-1">Analyzing your studio data…</p>
          <p className="text-sm text-gray-500">This takes about 10–15 seconds.</p>
        </div>
      )}

      {/* Recommendations sections */}
      {!loading && !generating && sections.length > 0 && (
        <div className="space-y-4">
          {sections.map((section, i) => (
            <SectionCard key={section.id || i} section={section} defaultOpen={i === 0} />
          ))}
        </div>
      )}

      {/* Footer note */}
      {sections.length > 0 && (
        <p className="text-xs text-gray-400 text-center pb-4">
          Recommendations are based on your team&apos;s feedback signals and available studio data. Use your judgment — you know your members best.
        </p>
      )}
    </div>
  )
}
