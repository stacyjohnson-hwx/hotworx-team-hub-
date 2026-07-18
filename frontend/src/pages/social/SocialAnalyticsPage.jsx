import { useState, useEffect, useCallback } from 'react'
import { apiGet } from '@/hooks/useApi'
import { useStudio } from '@/contexts/StudioContext'
import {
  Camera, ThumbsUp, Star, TrendingUp, TrendingDown, Minus, Play, Heart,
  MessageCircle, Bookmark, Share2, ArrowUpRight, RefreshCw, Sparkles,
  BarChart3, Info, Loader2, AlertCircle,
} from 'lucide-react'

const fmt = (n) => n == null ? '—' : n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n)

const PLATFORM_META = {
  instagram: { Icon: Camera,   color: '#E1306C', label: 'Instagram' },
  facebook:  { Icon: ThumbsUp, color: '#1877F2', label: 'Facebook' },
  tiktok:    { Icon: Play,      color: '#111111', label: 'TikTok' },
  google:    { Icon: Star,      color: '#EA4335', label: 'Google' },
}
const ORDER = ['instagram', 'facebook', 'tiktok', 'google']

function Delta({ value, suffix }) {
  if (value == null) return <span className="text-gray-400">— {suffix}</span>
  const up = value > 0, flat = value === 0
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown
  const cls = flat ? 'text-gray-500' : up ? 'text-green-700' : 'text-red-700'
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold ${cls}`}>
      <Icon size={13} strokeWidth={2.5} />{up ? '+' : ''}{value}
      {suffix && <span className="text-gray-400 font-normal ml-0.5">{suffix}</span>}
    </span>
  )
}

function ChannelCard({ ch }) {
  const meta = PLATFORM_META[ch.platform]
  const { Icon, color } = meta
  const isGoogle = ch.platform === 'google'
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg grid place-items-center" style={{ background: color + '18' }}>
          <Icon size={16} color={color} strokeWidth={2} fill={isGoogle || ch.platform === 'tiktok' ? color : 'none'} />
        </span>
        <span className="text-[13px] font-semibold text-gray-600">{meta.label}</span>
        {ch.handle && <span className="text-[11px] text-gray-400 truncate">{ch.handle}</span>}
      </div>
      {!ch.has_data ? (
        <div className="py-1">
          <p className="text-2xl font-bold text-gray-300 tracking-tight">—</p>
          <p className="text-[11px] text-gray-400">No data yet — connect this account</p>
        </div>
      ) : isGoogle ? (
        <>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold text-gray-900 tracking-tight">{ch.rating ?? '—'}</span>
            <span className="flex gap-0.5">
              {[1,2,3,4,5].map(i => <Star key={i} size={13} className="text-amber-500" fill={i <= Math.round(ch.rating || 0) ? '#f59e0b' : 'none'} />)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>{ch.reviews ?? '—'} reviews</span>
            <Delta value={ch.delta30} suffix="/30d" />
          </div>
        </>
      ) : (
        <>
          <span className="text-3xl font-bold text-gray-900 tracking-tight">{fmt(ch.followers)}</span>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <Delta value={ch.delta7} suffix="/7d" />
            <Delta value={ch.delta30} suffix="/30d" />
          </div>
        </>
      )}
    </div>
  )
}

function Metric({ Icon, value }) {
  return <span className="inline-flex items-center gap-1 text-xs text-gray-600 font-medium"><Icon size={13} className="text-gray-400" />{fmt(value)}</span>
}

function ContentRow({ item }) {
  const [open, setOpen] = useState(false)
  const meta = PLATFORM_META[item.platform] || PLATFORM_META.instagram
  const { Icon, color } = meta
  const daysAgo = item.posted_at ? Math.max(0, Math.round((Date.now() - new Date(item.posted_at)) / 86400000)) : null
  const hasTeardown = !!item.teardown
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="w-full flex gap-3.5 py-4 text-left items-start hover:bg-gray-50/60 rounded-lg px-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40">
        {item.thumb_url
          ? <img src={item.thumb_url} alt="" className="w-13 h-13 rounded-xl object-cover flex-shrink-0" style={{ width: 52, height: 52 }} />
          : <span className="w-13 h-13 rounded-xl grid place-items-center flex-shrink-0" style={{ width: 52, height: 52, background: `linear-gradient(135deg, ${color}, ${color}bb)` }}>
              <Icon size={18} color="#fff" fill={item.platform === 'tiktok' ? '#fff' : 'none'} />
            </span>}
        <div className="flex-1 min-w-0">
          <div className="flex justify-between gap-3 items-start">
            <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">{item.caption || '(no caption)'}</p>
            {item.follows_driven != null && (
              <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-[11px] font-semibold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full whitespace-nowrap">
                +{item.follows_driven} follows{item.is_estimate && <span title="Estimated — not UTM-attributed" className="text-orange-400">*</span>}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-3.5 mt-2 items-center">
            <Metric Icon={Play} value={item.views} />
            <Metric Icon={Heart} value={item.likes} />
            <Metric Icon={MessageCircle} value={item.comments} />
            <Metric Icon={Bookmark} value={item.saves} />
            <Metric Icon={Share2} value={item.shares} />
            {daysAgo != null && <span className="text-xs text-gray-400 ml-auto">{daysAgo}d ago</span>}
          </div>
        </div>
      </button>
      {open && (
        <div className="ml-[70px] mr-1 mb-4 p-3.5 bg-gray-50 rounded-xl border border-gray-100">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Sparkles size={13} className="text-orange-600" />
            <span className="text-[11px] font-bold text-orange-600 uppercase tracking-wider">Teardown</span>
          </div>
          {hasTeardown ? (
            <>
              {[['Hook', item.teardown.hook], ['Value', item.teardown.value], ['CTA', item.teardown.cta]].map(([k, v]) => (
                <div key={k} className="flex gap-2.5 mb-1.5">
                  <span className="text-xs font-bold text-gray-500 w-11 flex-shrink-0">{k}</span>
                  <span className="text-[12.5px] text-gray-700 leading-relaxed">{v || '—'}</span>
                </div>
              ))}
              {item.teardown.why && (
                <div className="mt-2.5 pt-2.5 border-t border-dashed border-gray-200 flex gap-2">
                  <ArrowUpRight size={15} className="text-green-700 flex-shrink-0 mt-0.5" />
                  <span className="text-[12.5px] text-green-800 leading-relaxed font-medium">{item.teardown.why}</span>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-gray-500">Teardown not generated yet — it appears here once the AI teardown job runs for this post.</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function SocialAnalyticsPage() {
  const { currentStudio } = useStudio()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setData(await apiGet('/api/social/dashboard')) }
    catch (e) { setError(e?.message || 'Failed to load') }
    finally { setLoading(false) }
  }, [currentStudio?.id])
  useEffect(() => { load() }, [load])

  const channels = data?.channels || []
  const byPlatform = Object.fromEntries(channels.map(c => [c.platform, c]))
  const cards = ORDER.map(p => byPlatform[p] || { platform: p, has_data: false })
  const anyChannels = channels.length > 0
  const top = data?.top_content || []
  const totalReach = top.reduce((s, c) => s + (c.views || 0), 0)
  const totalFollows = top.reduce((s, c) => s + (c.follows_driven || 0), 0)
  const updated = data?.updated_at ? new Date(data.updated_at).toLocaleString() : null

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
            <BarChart3 size={22} className="text-orange-500" /> Social Analytics
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {currentStudio?.name || 'Studio'} · {updated ? `Updated ${updated}` : 'Not synced yet'}
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 text-[13px] font-semibold text-gray-600 bg-white border border-gray-200 px-3.5 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Sync
        </button>
      </div>

      {error && (
        <div className="mb-5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>Couldn&apos;t load the dashboard: {error}. Your last-synced data is unaffected — try Sync again.</span>
        </div>
      )}

      {loading && !data ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-gray-300" size={28} /></div>
      ) : (
        <>
          <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            {cards.map(ch => <ChannelCard key={ch.platform} ch={ch} />)}
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-1.5">
              <h2 className="text-[15px] font-bold text-gray-900">Best-performing content</h2>
              <span className="text-xs text-gray-400">Last 14 days</span>
            </div>
            {top.length > 0 && (
              <div className="flex gap-6 mb-1.5 pb-3 border-b border-gray-100">
                <div><div className="text-xl font-bold tracking-tight">{fmt(totalReach)}</div><div className="text-[11.5px] text-gray-500">combined reach</div></div>
                <div><div className="text-xl font-bold tracking-tight text-orange-600">+{totalFollows}</div><div className="text-[11.5px] text-gray-500">follows driven</div></div>
              </div>
            )}
            {top.length > 0 ? (
              <>
                {top.map(item => <ContentRow key={item.id} item={item} />)}
                <p className="mt-3.5 text-xs text-gray-400 flex items-center gap-1.5"><Info size={12} /> Tap any post for its AI teardown. <span className="text-orange-400">*</span> = estimated follows.</p>
              </>
            ) : (
              <div className="py-10 text-center">
                <p className="text-sm font-semibold text-gray-700">
                  {anyChannels ? 'No posts synced yet.' : 'No channels connected yet.'}
                </p>
                <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                  {anyChannels
                    ? 'The nightly sync will populate follower trends and top posts once the platform connectors are provisioned.'
                    : 'Connect Instagram, Facebook, TikTok, and Google to start tracking follower growth, reviews, and your best content.'}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
