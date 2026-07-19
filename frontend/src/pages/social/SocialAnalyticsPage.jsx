import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost, apiDelete } from '@/hooks/useApi'
import { useStudio } from '@/contexts/StudioContext'
import { useRole } from '@/hooks/useRole'
import {
  Camera, ThumbsUp, Star, TrendingUp, TrendingDown, Minus, Play, Heart,
  MessageCircle, Bookmark, Share2, ArrowUpRight, RefreshCw, Sparkles,
  BarChart3, Info, Loader2, AlertCircle, Pencil, X,
  Music, Flame, Plus, Trash2, Copy, Check, Sliders, ExternalLink,
  ChevronRight, MessageSquare, Reply,
} from 'lucide-react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

const fmt = (n) => n == null ? '—' : n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n)
const INP = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 mt-0.5'

// Instagram/Facebook CDN images 403 in the browser (cross-site Sec-Fetch/referrer
// checks) — route them through our server-side proxy, which re-fetches cleanly.
const API_BASE = import.meta.env.VITE_API_URL || ''
const PROXY_HOSTS = /(cdninstagram\.com|fbcdn\.net)/i
const thumbSrc = (url) => url && PROXY_HOSTS.test(url) ? `${API_BASE}/api/social/img?u=${encodeURIComponent(url)}` : url

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

function ChannelCard({ ch, onClick }) {
  const meta = PLATFORM_META[ch.platform]
  const { Icon, color } = meta
  const isGoogle = ch.platform === 'google'
  const clickable = ch.has_data && onClick
  return (
    <div onClick={clickable ? onClick : undefined} role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      className={`bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-col gap-2.5 transition-all ${clickable ? 'cursor-pointer hover:border-orange-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-orange-500/30' : ''}`}>
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg grid place-items-center" style={{ background: color + '18' }}>
          <Icon size={16} color={color} strokeWidth={2} fill={isGoogle || ch.platform === 'tiktok' ? color : 'none'} />
        </span>
        <span className="text-[13px] font-semibold text-gray-600">{meta.label}</span>
        {ch.handle && <span className="text-[11px] text-gray-400 truncate">{ch.handle}</span>}
        {clickable && <ChevronRight size={15} className="text-gray-300 ml-auto flex-shrink-0" />}
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

const Badge = ({ children }) => <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 capitalize">{children}</span>

// The "ready-to-shoot" recreation block (trend teardowns only).
function StealThis({ st }) {
  const [copied, setCopied] = useState(false)
  const copy = (text) => { try { navigator.clipboard?.writeText(text) } catch { /* ignore */ } setCopied(true); setTimeout(() => setCopied(false), 1500) }
  return (
    <div className="mt-3 pt-3 border-t border-gray-200">
      <div className="flex items-center gap-1.5 mb-1.5"><Flame size={13} className="text-orange-600" /><span className="text-[11px] font-bold text-orange-600 uppercase tracking-wider">Steal this for your studio</span></div>
      {st.concept && <p className="text-[12.5px] font-semibold text-gray-800 mb-1.5">{st.concept}</p>}
      {Array.isArray(st.shot_list) && st.shot_list.length > 0 && (
        <ol className="list-decimal ml-4 space-y-0.5 mb-2">{st.shot_list.map((s, i) => <li key={i} className="text-[12.5px] text-gray-700 leading-relaxed">{s}</li>)}</ol>
      )}
      {st.onscreen_hook && <p className="text-[12px] text-gray-600 mb-1"><span className="font-semibold">On-screen:</span> &ldquo;{st.onscreen_hook}&rdquo;</p>}
      {st.caption && (
        <div className="flex items-start gap-2 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 mt-1">
          <span className="text-[12px] text-gray-600 flex-1">{st.caption}</span>
          <button onClick={() => copy(st.caption)} className="text-gray-400 hover:text-orange-600 flex-shrink-0" title="Copy caption">{copied ? <Check size={13} /> : <Copy size={13} />}</button>
        </div>
      )}
    </div>
  )
}

// Thumbnail with proxy routing + graceful fallback to the platform gradient when
// the image errors (expired/blocked CDN URL) — never shows a broken-image icon.
function Thumb({ item, color, Icon }) {
  const [err, setErr] = useState(false)
  const src = thumbSrc(item.thumb_url)
  if (src && !err) {
    return <img src={src} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setErr(true)} className="w-full h-full object-cover" />
  }
  return (
    <span className="w-full h-full grid place-items-center" style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)` }}>
      <Icon size={18} color="#fff" fill={item.platform === 'tiktok' ? '#fff' : 'none'} />
    </span>
  )
}

function ContentRow({ item }) {
  const [open, setOpen] = useState(false)
  const meta = PLATFORM_META[item.platform] || PLATFORM_META.instagram
  const { Icon, color } = meta
  const daysAgo = item.posted_at ? Math.max(0, Math.round((Date.now() - new Date(item.posted_at)) / 86400000)) : null
  const td = item.teardown
  return (
    <div className="border-b border-gray-100 last:border-0">
      <div className="flex gap-3.5 py-4 items-start px-1">
        {item.permalink
          ? <a href={item.permalink} target="_blank" rel="noopener noreferrer" title="Open the original post"
              className="relative rounded-xl overflow-hidden flex-shrink-0 block group" style={{ width: 52, height: 52 }}>
              <Thumb item={item} color={color} Icon={Icon} />
              <span className="absolute inset-0 grid place-items-center bg-black/0 group-hover:bg-black/40 transition-colors">
                <Play size={16} fill="#fff" className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </span>
            </a>
          : <span className="rounded-xl overflow-hidden flex-shrink-0 block" style={{ width: 52, height: 52 }}>
              <Thumb item={item} color={color} Icon={Icon} />
            </span>}
        <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex-1 min-w-0 text-left focus:outline-none">
          <div className="flex justify-between gap-3 items-start">
            <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">
              {item.author_handle && <span className="text-gray-400 font-normal">@{item.author_handle} · </span>}
              {item.caption || '(no caption)'}
            </p>
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
        </button>
        {item.permalink && (
          <a href={item.permalink} target="_blank" rel="noopener noreferrer" title="Open the original post"
            className="flex-shrink-0 text-gray-300 hover:text-orange-600 mt-0.5 p-0.5"><ExternalLink size={14} /></a>
        )}
      </div>
      {open && (
        <div className="ml-[70px] mr-1 mb-4 p-3.5 bg-gray-50 rounded-xl border border-gray-100">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Sparkles size={13} className="text-orange-600" />
            <span className="text-[11px] font-bold text-orange-600 uppercase tracking-wider">Teardown</span>
          </div>
          {td ? (
            <>
              {[['Hook', td.hook], ['Value', td.value], ['CTA', td.cta]].map(([k, v]) => (
                <div key={k} className="flex gap-2.5 mb-1.5">
                  <span className="text-xs font-bold text-gray-500 w-11 flex-shrink-0">{k}</span>
                  <span className="text-[12.5px] text-gray-700 leading-relaxed">{v || '—'}</span>
                </div>
              ))}
              {td.why && (
                <div className="mt-2.5 pt-2.5 border-t border-dashed border-gray-200 flex gap-2">
                  <ArrowUpRight size={15} className="text-green-700 flex-shrink-0 mt-0.5" />
                  <span className="text-[12.5px] text-green-800 leading-relaxed font-medium">{td.why}</span>
                </div>
              )}
              {(td.format || td.content_pillar || td.effort) && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {td.format && <Badge>{td.format}</Badge>}
                  {td.content_pillar && <Badge>{td.content_pillar}</Badge>}
                  {td.effort && <Badge>{td.effort} effort</Badge>}
                </div>
              )}
              {td.trending_sound && (
                <div className="flex items-center gap-1.5 mt-2 text-[12px] text-purple-700"><Music size={12} /> {td.trending_sound}</div>
              )}
              {td.steal_this && <StealThis st={td.steal_this} />}
            </>
          ) : (
            <p className="text-xs text-gray-500">Teardown not generated yet — it appears here once the AI teardown runs for this post.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Per-channel deep-dive modal ──────────────────────────────────────────────
const shortDate = (s) => { if (!s) return ''; const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s); return `${d.getMonth() + 1}/${d.getDate()}` }

function StatTile({ label, value, accent }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
      <div className={`text-lg font-bold tracking-tight ${accent || 'text-gray-900'}`}>{value}</div>
      <div className="text-[11px] text-gray-500 leading-tight mt-0.5">{label}</div>
    </div>
  )
}

function Stars({ rating, size = 12 }) {
  return <span className="inline-flex gap-0.5">{[1, 2, 3, 4, 5].map(i => <Star key={i} size={size} className="text-amber-500" fill={i <= Math.round(rating || 0) ? '#f59e0b' : 'none'} />)}</span>
}

// The follower / review-count trend line (needs ≥2 points to draw).
function TrendChart({ snapshots, field, color }) {
  const pts = (snapshots || []).filter(s => s[field] != null).map(s => ({ d: shortDate(s.snapshot_date), v: s[field] }))
  if (pts.length < 2) {
    return <div className="h-[140px] grid place-items-center text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">Trend line appears once there are at least 2 days of history.</div>
  }
  return (
    <div className="h-[160px] -ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={pts} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis dataKey="d" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={44} domain={['auto', 'auto']} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #eee' }} />
          <Line type="monotone" dataKey="v" name="value" stroke={color} strokeWidth={2.5} dot={{ r: 2.5, fill: color }} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function ReviewCard({ r }) {
  const when = r.review_date ? new Date(r.review_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null
  return (
    <div className="border-b border-gray-100 last:border-0 py-3.5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[13px] font-semibold text-gray-800">{r.author_name || 'Google user'}</span>
        <Stars rating={r.rating} />
        {when && <span className="text-[11px] text-gray-400 ml-auto">{when}</span>}
      </div>
      {r.text && <p className="text-[13px] text-gray-600 leading-relaxed whitespace-pre-line">{r.text}</p>}
      {r.owner_response && (
        <div className="mt-2 ml-3 pl-3 border-l-2 border-orange-200">
          <p className="text-[11px] font-bold text-orange-600 flex items-center gap-1 mb-0.5"><Reply size={11} /> Owner response</p>
          <p className="text-[12px] text-gray-500 leading-relaxed whitespace-pre-line">{r.owner_response}</p>
        </div>
      )}
    </div>
  )
}

// Deep-dive for one channel — trend chart + best-practice stats + top posts, and
// for Google the actual reviews, star distribution, and AI theme summary.
function ChannelDetailModal({ platform, onClose }) {
  const meta = PLATFORM_META[platform]
  const { Icon, color, label } = meta
  const isGoogle = platform === 'google'
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true); setError('')
    apiGet(`/api/social/channel/${platform}`)
      .then(r => { if (alive) setD(r) })
      .catch(e => { if (alive) setError(e?.message || 'Failed to load') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [platform])

  const dist = d?.distribution || {}
  const distMax = Math.max(1, ...Object.values(dist))
  const stats = d?.stats || {}
  const ins = d?.insights || null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-xl my-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-6 py-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl z-10">
          <span className="w-8 h-8 rounded-lg grid place-items-center" style={{ background: color + '18' }}>
            <Icon size={17} color={color} fill={isGoogle || platform === 'tiktok' ? color : 'none'} />
          </span>
          <div>
            <h2 className="text-[15px] font-bold text-gray-900 leading-tight">{label}</h2>
            {d?.handle && <p className="text-[11px] text-gray-400">{d.handle}</p>}
          </div>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>

        <div className="px-6 py-5">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin text-gray-300" size={26} /></div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
          ) : isGoogle ? (
            <>
              <div className="flex items-end gap-3 mb-1">
                <span className="text-4xl font-bold tracking-tight text-gray-900">{d.rating ?? '—'}</span>
                <div className="pb-1"><Stars rating={d.rating} size={15} /><div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">{d.review_count ?? '—'} reviews <Delta value={d.delta30} suffix="/30d" /></div></div>
              </div>

              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mt-5 mb-2">Reviews over time</p>
              <TrendChart snapshots={d.snapshots} field="review_count" color={color} />

              <div className="grid grid-cols-3 gap-2.5 mt-5">
                <StatTile label="new in last 30d" value={d.velocity_30d ?? '—'} accent="text-orange-600" />
                <StatTile label="owner response rate" value={d.response_rate != null ? `${d.response_rate}%` : '—'} />
                <StatTile label="reviews pulled" value={(d.reviews || []).length} />
              </div>

              {(d.reviews || []).length > 0 && (
                <>
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mt-6 mb-2">Star breakdown</p>
                  <div className="space-y-1.5">
                    {[5, 4, 3, 2, 1].map(star => (
                      <div key={star} className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-500 w-8 flex-shrink-0 flex items-center gap-0.5">{star}<Star size={10} className="text-amber-500" fill="#f59e0b" /></span>
                        <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full bg-amber-400" style={{ width: `${((dist[star] || 0) / distMax) * 100}%` }} /></div>
                        <span className="text-[11px] text-gray-500 w-6 text-right">{dist[star] || 0}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {ins && (ins.summary || (ins.loves || []).length > 0) && (
                <div className="mt-6 rounded-xl border border-orange-100 bg-orange-50/60 p-4">
                  <div className="flex items-center gap-1.5 mb-2"><Sparkles size={13} className="text-orange-600" /><span className="text-[11px] font-bold text-orange-600 uppercase tracking-wider">What people are saying</span>{ins.sentiment && <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white text-gray-500 capitalize border border-gray-200">{ins.sentiment}</span>}</div>
                  {ins.summary && <p className="text-[13px] text-gray-700 leading-relaxed mb-3">{ins.summary}</p>}
                  {(ins.loves || []).length > 0 && (
                    <div className="mb-2"><p className="text-[11px] font-semibold text-green-700 mb-1">Customers love</p><div className="flex flex-wrap gap-1.5">{ins.loves.map((l, i) => <span key={i} className="text-[11.5px] bg-green-50 text-green-800 border border-green-200 px-2 py-0.5 rounded-full">{l}</span>)}</div></div>
                  )}
                  {(ins.issues || []).length > 0 && (
                    <div><p className="text-[11px] font-semibold text-amber-700 mb-1">Worth watching</p><div className="flex flex-wrap gap-1.5">{ins.issues.map((l, i) => <span key={i} className="text-[11.5px] bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full">{l}</span>)}</div></div>
                  )}
                </div>
              )}

              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mt-6 mb-1 flex items-center gap-1.5"><MessageSquare size={12} /> Recent reviews</p>
              {(d.reviews || []).length > 0 ? (
                <div>{d.reviews.map(r => <ReviewCard key={r.id} r={r} />)}</div>
              ) : (
                <p className="text-xs text-gray-400 py-4">No individual reviews pulled yet. Tap “Scrape now” on the dashboard to fetch them.</p>
              )}
            </>
          ) : (
            <>
              <div className="flex items-end gap-3 mb-1">
                <span className="text-4xl font-bold tracking-tight text-gray-900">{fmt(d.followers)}</span>
                <div className="pb-1.5 flex items-center gap-3 text-xs"><Delta value={d.delta7} suffix="/7d" /><Delta value={d.delta30} suffix="/30d" /></div>
              </div>

              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mt-5 mb-2">Followers over time</p>
              <TrendChart snapshots={d.snapshots} field="followers" color={color} />

              <div className="grid grid-cols-3 gap-2.5 mt-5">
                <StatTile label="engagement rate" value={stats.engagement_rate != null ? `${stats.engagement_rate}%` : '—'} accent="text-orange-600" />
                <StatTile label="posts / week" value={stats.posting_cadence ?? '—'} />
                <StatTile label="avg views / post" value={fmt(stats.avg_views)} />
                <StatTile label="avg likes / post" value={fmt(stats.avg_likes)} />
                <StatTile label="posts (30d)" value={stats.posts_30d ?? '—'} />
                <StatTile label="posts synced" value={stats.total_posts ?? '—'} />
              </div>

              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mt-6 mb-1">Top posts</p>
              {(d.top_posts || []).length > 0 ? (
                <div>{d.top_posts.map(item => <ContentRow key={item.id} item={item} />)}</div>
              ) : (
                <p className="text-xs text-gray-400 py-4">No posts synced for this channel yet. Tap “Scrape now” on the dashboard.</p>
              )}
              {stats.engagement_rate == null && (
                <p className="mt-3 text-[11px] text-gray-400 flex items-start gap-1.5"><Info size={12} className="flex-shrink-0 mt-0.5" /> Some metrics (reach, saves, best-time-to-post) need the official {label} API — they’ll fill in if we connect it later.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Manual-entry: type today's numbers by hand — the free, zero-setup data path.
function ManualEntryModal({ channels, onClose, onSaved }) {
  const byP = Object.fromEntries((channels || []).map(c => [c.platform, c]))
  const [form, setForm] = useState(() => ORDER.reduce((a, p) => {
    const c = byP[p] || {}
    a[p] = {
      handle: c.handle || '',
      followers: c.followers != null ? String(c.followers) : '',
      rating: c.rating != null ? String(c.rating) : '',
      review_count: c.reviews != null ? String(c.reviews) : '',
    }
    return a
  }, {}))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (p, k, v) => setForm(f => ({ ...f, [p]: { ...f[p], [k]: v } }))

  const save = async () => {
    setSaving(true); setErr('')
    try {
      for (const p of ORDER) {
        const row = form[p]
        if (!(row.handle || row.followers || row.rating || row.review_count)) continue
        await apiPost('/api/social/manual-entry', {
          platform: p, handle: row.handle || null,
          followers: row.followers, rating: row.rating, review_count: row.review_count,
        })
      }
      onSaved()
    } catch (e) { setErr(e?.message || 'Save failed'); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Update your numbers</h2>
            <p className="text-xs text-gray-500 mt-0.5 max-w-sm">Type today&apos;s counts from each app. The dashboard fills in and builds trend history over time — no account connection needed.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 mt-1"><X size={20} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {err && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{err}</div>}
          {ORDER.map(p => {
            const meta = PLATFORM_META[p]; const { Icon, color } = meta; const isG = p === 'google'
            return (
              <div key={p} className="border border-gray-200 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 rounded-lg grid place-items-center" style={{ background: color + '18' }}>
                    <Icon size={14} color={color} fill={isG || p === 'tiktok' ? color : 'none'} />
                  </span>
                  <span className="text-sm font-semibold text-gray-700">{meta.label}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label className="text-[11px] text-gray-500">Handle (optional)</label>
                    <input className={INP} value={form[p].handle} onChange={e => set(p, 'handle', e.target.value)} placeholder={isG ? 'Studio name on Google' : '@yourhandle'} />
                  </div>
                  {isG ? (
                    <>
                      <div><label className="text-[11px] text-gray-500">Star rating</label><input type="number" step="0.1" min="0" max="5" className={INP} value={form[p].rating} onChange={e => set(p, 'rating', e.target.value)} placeholder="4.9" /></div>
                      <div><label className="text-[11px] text-gray-500"># of reviews</label><input type="number" min="0" className={INP} value={form[p].review_count} onChange={e => set(p, 'review_count', e.target.value)} placeholder="214" /></div>
                    </>
                  ) : (
                    <div className="col-span-2"><label className="text-[11px] text-gray-500">Followers</label><input type="number" min="0" className={INP} value={form[p].followers} onChange={e => set(p, 'followers', e.target.value)} placeholder="3184" /></div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium">Cancel</button>
          <button onClick={save} disabled={saving} className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />} Save numbers
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Dashboard tab (own channels) ─────────────────────────────────────────────
function DashboardTab() {
  const { currentStudio } = useStudio()
  const { isOwnerOrManager } = useRole()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [scraping, setScraping] = useState(false)
  const [scrapeResult, setScrapeResult] = useState(null)
  const [detail, setDetail] = useState(null)   // platform key of the open deep-dive

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setData(await apiGet('/api/social/dashboard')) }
    catch (e) { setError(e?.message || 'Failed to load') }
    finally { setLoading(false) }
  }, [currentStudio?.id])
  useEffect(() => { load() }, [load])

  const scrapeNow = async () => {
    setScraping(true); setScrapeResult(null)
    try { const r = await apiPost('/api/social/sync-now', {}); setScrapeResult(r); await load() }
    catch (e) { setScrapeResult({ results: [{ platform: 'all', status: 'error', error: e?.message || 'failed' }] }) }
    finally { setScraping(false) }
  }

  const channels = data?.channels || []
  const byPlatform = Object.fromEntries(channels.map(c => [c.platform, c]))
  const cards = ORDER.map(p => byPlatform[p] || { platform: p, has_data: false })
  const anyChannels = channels.length > 0
  const top = data?.top_content || []
  const totalReach = top.reduce((s, c) => s + (c.views || 0), 0)
  const totalFollows = top.reduce((s, c) => s + (c.follows_driven || 0), 0)
  const updated = data?.updated_at ? new Date(data.updated_at).toLocaleString() : null

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <p className="text-sm text-gray-500">{updated ? `Updated ${updated}` : 'Not synced yet'}</p>
        <div className="flex items-center gap-2">
          {isOwnerOrManager && (
            <button onClick={scrapeNow} disabled={scraping}
              className="flex items-center gap-2 text-[13px] font-semibold text-white bg-orange-500 hover:bg-orange-600 px-3.5 py-2 rounded-lg disabled:opacity-50">
              {scraping ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} {scraping ? 'Scraping…' : 'Scrape now'}
            </button>
          )}
          {isOwnerOrManager && (
            <button onClick={() => setEditing(true)}
              className="flex items-center gap-2 text-[13px] font-semibold text-gray-600 bg-white border border-gray-200 px-3.5 py-2 rounded-lg hover:bg-gray-50">
              <Pencil size={13} /> Update numbers
            </button>
          )}
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 text-[13px] font-semibold text-gray-600 bg-white border border-gray-200 px-3.5 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Sync
          </button>
        </div>
      </div>

      {editing && <ManualEntryModal channels={cards} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load() }} />}

      {error && (
        <div className="mb-5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>Couldn&apos;t load the dashboard: {error}. Your last-synced data is unaffected — try Sync again.</span>
        </div>
      )}

      {scrapeResult && (
        <div className="mb-5 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-sm font-semibold text-gray-700 mb-1.5">Follower & review sync</p>
          <div className="space-y-1">
            {(scrapeResult.results || []).map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="capitalize font-medium w-20 flex-shrink-0 text-gray-600">{r.platform}</span>
                {r.status === 'ok'
                  ? <span className="text-green-700">✓ {r.value?.followers != null ? `${r.value.followers.toLocaleString()} followers` : r.value?.rating != null ? `${r.value.rating}★ · ${r.value.review_count ?? '?'} reviews` : 'saved'}</span>
                  : r.status === 'no_number'
                    ? <span className="text-amber-700">⚠ scraped {r.scraped_items} item(s) but couldn’t read the number{r.field_names ? ` — fields: ${(r.field_names || []).join(', ')}` : ''}</span>
                    : <span className="text-red-700">✗ {r.error}</span>}
              </div>
            ))}
          </div>
          {scrapeResult.posts?.results && (
            <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
              <p className="text-xs font-semibold text-gray-600 mb-0.5">Your posts</p>
              {scrapeResult.posts.results.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="capitalize font-medium w-20 flex-shrink-0 text-gray-600">{r.platform}</span>
                  {r.status === 'ok'
                    ? <span className="text-green-700">✓ {r.kept} posts</span>
                    : r.status === 'no_posts'
                      ? <span className="text-amber-700">⚠ none found{r.field_names ? ` — fields: ${(r.field_names || []).join(', ')}` : ''}</span>
                      : <span className="text-red-700">✗ {r.error}</span>}
                </div>
              ))}
              {scrapeResult.posts.teardowns?.generated != null && <p className="text-[11px] text-gray-500">{scrapeResult.posts.teardowns.generated} AI teardown(s) generated.</p>}
            </div>
          )}
        </div>
      )}

      {loading && !data ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-gray-300" size={28} /></div>
      ) : (
        <>
          <div className="flex items-center gap-1.5 mb-2 text-[11px] text-gray-400"><Info size={11} /> Tap a channel for its full dashboard — trends, top posts{' '}{cards.some(c => c.platform === 'google' && c.has_data) && '& Google reviews'}.</div>
          <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            {cards.map(ch => <ChannelCard key={ch.platform} ch={ch} onClick={() => setDetail(ch.platform)} />)}
          </div>
          {detail && <ChannelDetailModal platform={detail} onClose={() => setDetail(null)} />}

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-1.5">
              <h2 className="text-[15px] font-bold text-gray-900">Best-performing content</h2>
              <span className="text-xs text-gray-400">Last 30 days</span>
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
                <p className="text-sm font-semibold text-gray-700">{anyChannels ? 'No posts synced yet.' : 'No channels connected yet.'}</p>
                <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                  {anyChannels
                    ? 'Follower trends and top posts fill in here. Use “Update numbers” to log today’s counts, or connect a platform for automatic syncing.'
                    : 'Tap “Update numbers” (top right) to enter your follower counts and Google rating by hand — the dashboard starts working immediately, no account connection needed.'}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Trends tab (viral niche content) ─────────────────────────────────────────
function DiscoverResult({ result }) {
  if (result.error) return <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">✗ {result.error}</div>
  const sources = result.sources || []
  const gen = Object.values(result.teardowns || {}).reduce((s, t) => s + (t?.generated || 0), 0)
  return (
    <div className="mb-4 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
      <p className="text-sm font-semibold text-gray-700 mb-1.5">Discovery results</p>
      <div className="space-y-1">
        {sources.map((s, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <span className="font-medium w-40 flex-shrink-0 text-gray-600 truncate">{s.source}</span>
            {s.status === 'ok'
              ? <span className="text-green-700">✓ kept {s.kept} of {s.scraped} scraped</span>
              : s.status === 'no_posts'
                ? <span className="text-amber-700">⚠ scraped {s.scraped} but none usable{s.field_names ? ` — fields: ${(s.field_names || []).join(', ')}` : ''}</span>
                : <span className="text-red-700">✗ {s.error}</span>}
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-1.5">{result.anthropic ? `${gen} AI teardown(s) generated.` : 'Add ANTHROPIC_API_KEY on Railway to generate the AI breakdowns.'}</p>
    </div>
  )
}

function SourcesModal({ onClose }) {
  const [sources, setSources] = useState(null)
  const [platform, setPlatform] = useState('instagram')
  const [kind, setKind] = useState('hashtag')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const load = async () => { try { setSources(await apiGet('/api/social/trends/sources')) } catch { setSources([]) } }
  useEffect(() => { load() }, [])
  const add = async () => {
    if (!query.trim()) return
    setBusy(true)
    try { await apiPost('/api/social/trends/sources', { platform, kind, query }); setQuery(''); await load() }
    catch { /* ignore */ } finally { setBusy(false) }
  }
  const del = async (id) => { setSources(s => (s || []).filter(x => x.id !== id)); try { await apiDelete(`/api/social/trends/sources/${id}`) } catch { /* ignore */ } }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Trend sources</h2>
            <p className="text-xs text-gray-500 mt-0.5">Hashtags, keywords, and competitor/creator accounts we scan for viral content.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 mt-1"><X size={20} /></button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div className="space-y-1.5">
            {sources === null ? <p className="text-xs text-gray-400">Loading…</p>
              : sources.length === 0 ? <p className="text-xs text-gray-400">No sources yet — add one below.</p>
              : sources.map(s => (
                <div key={s.id} className="flex items-center gap-2 border border-gray-200 rounded-lg px-2.5 py-2 text-sm">
                  <span className="capitalize text-[11px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{s.platform}</span>
                  <span className="text-gray-700">{s.kind === 'account' ? '@' : s.kind === 'hashtag' ? '#' : ''}{s.query}</span>
                  <button onClick={() => del(s.id)} className="ml-auto text-gray-300 hover:text-red-500" title="Remove"><Trash2 size={13} /></button>
                </div>
              ))}
          </div>
          <div className="border-t border-gray-100 pt-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <select className={INP} value={platform} onChange={e => setPlatform(e.target.value)}><option value="instagram">Instagram</option><option value="tiktok">TikTok</option></select>
              <select className={INP} value={kind} onChange={e => setKind(e.target.value)}><option value="hashtag">Hashtag</option><option value="account">Account</option><option value="keyword">Keyword</option></select>
            </div>
            <input className={INP} value={query} onChange={e => setQuery(e.target.value)} placeholder={kind === 'account' ? 'competitor/creator handle' : kind === 'hashtag' ? 'hashtag (no #)' : 'keyword'} onKeyDown={e => { if (e.key === 'Enter') add() }} />
            <button onClick={add} disabled={busy || !query.trim()} className="w-full flex items-center justify-center gap-1.5 bg-gray-800 hover:bg-black text-white text-sm font-semibold rounded-lg py-2 disabled:opacity-40"><Plus size={14} /> Add source</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function TrendsTab() {
  const { currentStudio } = useStudio()
  const { isOwnerOrManager } = useRole()
  const [posts, setPosts] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [discovering, setDiscovering] = useState(false)
  const [result, setResult] = useState(null)
  const [showSources, setShowSources] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setPosts(await apiGet('/api/social/trends')) }
    catch (e) { setError(e?.message || 'Failed to load'); setPosts([]) }
    finally { setLoading(false) }
  }, [currentStudio?.id])
  useEffect(() => { load() }, [load])

  const discover = async () => {
    setDiscovering(true); setResult(null)
    try { const r = await apiPost('/api/social/trends/discover', {}); setResult(r); await load() }
    catch (e) { setResult({ error: e?.message || 'failed' }) }
    finally { setDiscovering(false) }
  }

  const list = posts || []
  const sounds = {}, pillars = {}
  for (const p of list) {
    if (!p.teardown) continue
    if (p.teardown.trending_sound) sounds[p.teardown.trending_sound] = (sounds[p.teardown.trending_sound] || 0) + 1
    if (p.teardown.content_pillar) pillars[p.teardown.content_pillar] = (pillars[p.teardown.content_pillar] || 0) + 1
  }
  const topSound = Object.entries(sounds).sort((a, b) => b[1] - a[1])[0]?.[0]
  const topPillar = Object.entries(pillars).sort((a, b) => b[1] - a[1])[0]?.[0]

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <p className="text-sm text-gray-500">Viral content in your niche, ranked, with an AI plan to recreate each.</p>
        <div className="flex items-center gap-2">
          {isOwnerOrManager && (
            <button onClick={() => setShowSources(true)} className="flex items-center gap-2 text-[13px] font-semibold text-gray-600 bg-white border border-gray-200 px-3.5 py-2 rounded-lg hover:bg-gray-50">
              <Sliders size={13} /> Sources
            </button>
          )}
          {isOwnerOrManager && (
            <button onClick={discover} disabled={discovering} className="flex items-center gap-2 text-[13px] font-semibold text-white bg-orange-500 hover:bg-orange-600 px-3.5 py-2 rounded-lg disabled:opacity-50">
              {discovering ? <Loader2 size={13} className="animate-spin" /> : <Flame size={13} />} {discovering ? 'Finding…' : 'Find trends'}
            </button>
          )}
          <button onClick={load} disabled={loading} className="flex items-center gap-2 text-[13px] font-semibold text-gray-600 bg-white border border-gray-200 px-3.5 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {(topSound || topPillar) && (
        <div className="flex flex-wrap gap-2 mb-4 text-xs">
          {topSound && <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 border border-purple-100 px-2.5 py-1 rounded-full font-medium"><Music size={12} /> Trending: {topSound}</span>}
          {topPillar && <span className="inline-flex items-center gap-1 bg-orange-50 text-orange-700 border border-orange-100 px-2.5 py-1 rounded-full font-medium"><Flame size={12} /> Hot pillar: {topPillar}</span>}
        </div>
      )}

      {error && (
        <div className="mb-5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /><span>Couldn&apos;t load trends: {error}</span>
        </div>
      )}
      {result && <DiscoverResult result={result} />}

      {loading && !posts ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-gray-300" size={28} /></div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-1.5">
            <h2 className="text-[15px] font-bold text-gray-900">Viral in your niche</h2>
            <span className="text-xs text-gray-400">Last 3 weeks</span>
          </div>
          {list.length > 0 ? (
            <>
              {list.map(item => <ContentRow key={item.id} item={item} />)}
              <p className="mt-3.5 text-xs text-gray-400 flex items-center gap-1.5"><Info size={12} /> Tap a post for the full breakdown + your “steal this” plan.</p>
            </>
          ) : (
            <div className="py-10 text-center">
              <p className="text-sm font-semibold text-gray-700">No trends found yet.</p>
              <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">Tap “Find trends” to pull viral Reels &amp; TikToks from your seeded hashtags. Add your own hashtags or competitor/creator accounts under “Sources.”</p>
            </div>
          )}
        </div>
      )}

      {showSources && <SourcesModal onClose={() => setShowSources(false)} />}
    </div>
  )
}

// ─── Coach tab: holistic AI social coaching report ─────────────────────────────
const GRADE_COLOR = (g = '') => {
  const c = g.trim().toUpperCase()[0]
  if (c === 'A') return 'bg-green-100 text-green-700 border-green-200'
  if (c === 'B') return 'bg-emerald-100 text-emerald-700 border-emerald-200'
  if (c === 'C') return 'bg-amber-100 text-amber-700 border-amber-200'
  if (c === 'D') return 'bg-orange-100 text-orange-700 border-orange-200'
  return 'bg-red-100 text-red-700 border-red-200'
}

function CoachSection({ Icon, title, subtitle, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-4">
      <div className="flex items-center gap-1.5 mb-3">
        <Icon size={15} className="text-orange-600" />
        <h2 className="text-[15px] font-bold text-gray-900">{title}</h2>
        {subtitle && <span className="text-xs text-gray-400 ml-auto">{subtitle}</span>}
      </div>
      {children}
    </div>
  )
}

function CoachTab() {
  const { currentStudio } = useStudio()
  const { isOwnerOrManager } = useRole()
  const [row, setRow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setRow(await apiGet('/api/social/coach')) }
    catch (e) { setError(e?.message || 'Failed to load') }
    finally { setLoading(false) }
  }, [currentStudio?.id])
  useEffect(() => { load() }, [load])

  const refresh = async () => {
    setRunning(true); setError('')
    try { setRow(await apiPost('/api/social/coach/refresh', {})) }
    catch (e) { setError(e?.message || 'Failed to generate') }
    finally { setRunning(false) }
  }

  const r = row?.report || null
  const unavailable = row?.status === 'unavailable'
  const generated = row?.generated_at ? new Date(row.generated_at).toLocaleString() : null
  const asOf = row?.inputs?.data_as_of ? new Date(row.inputs.data_as_of).toLocaleDateString() : null
  const ep = r?.engagement_playbook || {}

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <p className="text-sm text-gray-500">
          {generated ? `Coached ${generated}` : 'No coaching report yet'}
          {asOf && <span className="text-gray-400"> · based on data through {asOf}</span>}
        </p>
        {isOwnerOrManager && (
          <button onClick={refresh} disabled={running}
            className="flex items-center gap-2 text-[13px] font-semibold text-white bg-orange-500 hover:bg-orange-600 px-3.5 py-2 rounded-lg disabled:opacity-50">
            {running ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} {running ? 'Coaching…' : row ? 'Refresh coaching' : 'Get coaching'}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>Couldn&apos;t generate coaching: {error}. Try again in a moment.</span>
        </div>
      )}

      {loading && !row ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-gray-300" size={28} /></div>
      ) : running && !r ? (
        <div className="flex flex-col items-center py-20 text-gray-400">
          <Loader2 className="animate-spin mb-3" size={28} />
          <p className="text-sm">Your coach is reviewing your pages…</p>
        </div>
      ) : !row || row.report === null ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
          <Sparkles size={26} className="text-orange-400 mx-auto mb-3" />
          <h3 className="text-[15px] font-bold text-gray-900 mb-1">Your on-demand social media coach</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Get a full teardown of your Instagram &amp; TikTok — what&apos;s working, what to fix, exactly what content and visuals to make, how the team should engage with followers and local targets, and advice channeled from top creators.
          </p>
          {!isOwnerOrManager && <p className="mt-3 text-xs text-gray-400">Ask your owner or manager to run the coach.</p>}
        </div>
      ) : unavailable ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
          <Info size={16} className="flex-shrink-0 mt-0.5" />
          <span>{r?.message || 'AI coaching is temporarily unavailable.'}</span>
        </div>
      ) : (
        <>
          {/* Header: grade + assessment */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-4">
            <div className="flex items-start gap-4">
              {r.grade && (
                <div className={`flex-shrink-0 w-16 h-16 rounded-2xl border flex items-center justify-center text-2xl font-black ${GRADE_COLOR(r.grade)}`}>
                  {r.grade}
                </div>
              )}
              <div>
                {r.headline && <h2 className="text-[16px] font-bold text-gray-900 leading-snug">{r.headline}</h2>}
                {r.summary && <p className="text-sm text-gray-600 mt-1 leading-relaxed">{r.summary}</p>}
              </div>
            </div>
          </div>

          {/* What's working */}
          {r.whats_working?.length > 0 && (
            <CoachSection Icon={Check} title="What's working">
              <ul className="space-y-2">
                {r.whats_working.map((w, i) => (
                  <li key={i} className="flex gap-2 text-[13px] text-gray-700 leading-relaxed">
                    <Check size={15} className="text-green-600 flex-shrink-0 mt-0.5" /> {w}
                  </li>
                ))}
              </ul>
            </CoachSection>
          )}

          {/* Fixes */}
          {r.fixes?.length > 0 && (
            <CoachSection Icon={ArrowUpRight} title="Fixes to make">
              <div className="space-y-3.5">
                {r.fixes.map((f, i) => (
                  <div key={i} className="pb-3.5 border-b border-gray-100 last:border-0 last:pb-0">
                    <p className="text-[13.5px] font-bold text-gray-900">{f.title}</p>
                    {f.why && <p className="text-[12.5px] text-gray-500 mt-0.5">{f.why}</p>}
                    {f.how && (
                      <p className="text-[12.5px] text-green-800 font-medium mt-1.5 flex gap-1.5">
                        <ArrowUpRight size={14} className="text-green-700 flex-shrink-0 mt-0.5" /> {f.how}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CoachSection>
          )}

          {/* Content plan */}
          {r.content_plan?.length > 0 && (
            <CoachSection Icon={Flame} title="Content & visuals to make">
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                {r.content_plan.map((c, i) => (
                  <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-3.5">
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {c.pillar && <Badge>{c.pillar}</Badge>}
                      {c.format && <Badge>{c.format}</Badge>}
                    </div>
                    {c.idea && <p className="text-[13px] font-semibold text-gray-800 leading-snug">{c.idea}</p>}
                    {c.visual && (
                      <p className="text-[12px] text-gray-500 mt-1.5 flex gap-1.5">
                        <Camera size={13} className="text-gray-400 flex-shrink-0 mt-0.5" /> {c.visual}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CoachSection>
          )}

          {/* Engagement playbook */}
          {(ep.own_followers?.length || ep.target_accounts?.length || ep.lead_flow?.length) > 0 && (
            <CoachSection Icon={Heart} title="Engagement playbook">
              <div className="space-y-4">
                {[
                  { Icon: Heart, label: 'Engage your followers', items: ep.own_followers },
                  { Icon: Share2, label: 'Engage local accounts & targets', items: ep.target_accounts },
                  { Icon: ArrowUpRight, label: 'Turn engagement into leads', items: ep.lead_flow },
                ].filter(g => g.items?.length).map((g, gi) => (
                  <div key={gi}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <g.Icon size={13} className="text-orange-500" />
                      <p className="text-[11px] font-bold text-orange-600 uppercase tracking-wider">{g.label}</p>
                    </div>
                    <ul className="space-y-1.5 ml-1">
                      {g.items.map((it, i) => (
                        <li key={i} className="flex gap-2 text-[13px] text-gray-700 leading-relaxed">
                          <span className="text-orange-300 flex-shrink-0">•</span> {it}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </CoachSection>
          )}

          {/* Creator voices */}
          {r.creator_voices?.length > 0 && (
            <CoachSection Icon={Sparkles} title="Channeling top creators">
              <div className="space-y-3">
                {r.creator_voices.map((c, i) => (
                  <div key={i} className="border-l-2 border-orange-300 pl-3.5">
                    <p className="text-[12px] font-bold text-gray-900">{c.creator}</p>
                    <p className="text-[13px] text-gray-600 italic mt-0.5 leading-relaxed">"{c.advice}"</p>
                  </div>
                ))}
              </div>
            </CoachSection>
          )}

          {/* Team this week */}
          {r.team_this_week?.length > 0 && (
            <CoachSection Icon={Check} title="This week for the team">
              <ul className="space-y-2">
                {r.team_this_week.map((t, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[13px] text-gray-700 leading-relaxed">
                    <span className="w-4 h-4 rounded border border-gray-300 flex-shrink-0 mt-0.5" />
                    <span className="flex-1">{t.task}</span>
                    {t.owner && <Badge>{t.owner}</Badge>}
                  </li>
                ))}
              </ul>
            </CoachSection>
          )}

          <p className="mt-1 text-xs text-gray-400 flex items-center gap-1.5">
            <Info size={12} /> Advice is AI-generated from your synced pages and current best practices. Creator advice is inspired by their public style, not the creators themselves.
          </p>
        </>
      )}
    </div>
  )
}

// ─── Page shell ───────────────────────────────────────────────────────────────
export default function SocialAnalyticsPage() {
  const { currentStudio } = useStudio()
  const [tab, setTab] = useState('dashboard')
  const TABS = [
    { k: 'dashboard', label: 'Dashboard', Icon: BarChart3 },
    { k: 'trends', label: 'Trends', Icon: Flame },
    { k: 'coach', label: 'Coach', Icon: Sparkles },
  ]
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
          <BarChart3 size={22} className="text-orange-500" /> Social Analytics
        </h1>
        <p className="text-sm text-gray-500 mt-1">{currentStudio?.name || 'Studio'}</p>
      </div>
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === t.k ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            <t.Icon size={15} /> {t.label}
          </button>
        ))}
      </div>
      {tab === 'dashboard' ? <DashboardTab /> : tab === 'trends' ? <TrendsTab /> : <CoachTab />}
    </div>
  )
}
