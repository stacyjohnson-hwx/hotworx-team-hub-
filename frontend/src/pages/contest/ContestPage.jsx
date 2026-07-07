import { useState, useEffect, useRef } from 'react'
import { useRole } from '@/hooks/useRole'
import { useStudio } from '@/contexts/StudioContext'
import { supabase } from '@/lib/supabase'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import { RichTextEditor, renderRichText } from '@/components/RichText'
import { formatCurrency, currentMonthYear, todayCT } from '@/lib/utils'
import {
  Trophy, Plus, X, Loader2, ImagePlus, MoreHorizontal, Pencil, Trash2,
  Flag, Crown, Gift, CalendarDays, Users, Medal,
} from 'lucide-react'

const CHEER_EMOJI = ['❤️', '🔥', '👏', '💪', '🎉', '🏆']

// How each auto metric (and the manual mode) is labelled + formatted.
const METRIC_META = {
  memberships:    { label: 'Memberships Sold',   fmt: n => `${n}`,                    money: false },
  retail:         { label: 'Retail Sales',       fmt: n => formatCurrency(n),         money: true  },
  eft:            { label: 'EFT Increase',       fmt: n => formatCurrency(n),         money: true  },
  outreach:       { label: 'Outreach (calls + texts)', fmt: n => `${n}`,              money: false },
  leadgen_points: { label: 'Lead Gen Points',    fmt: n => `${n} pts`,                money: false },
  commission:     { label: 'Commission Earned',  fmt: n => formatCurrency(n),         money: true  },
}

function scoreLabel(contest) {
  if (contest.scoring_mode === 'auto') return METRIC_META[contest.metric]?.label || 'Score'
  return contest.score_label || 'Points'
}
export function fmtScore(contest, n) {
  if (contest.scoring_mode === 'auto') return (METRIC_META[contest.metric]?.fmt || (x => `${x}`))(n || 0)
  return `${n || 0}`
}

// Whole days between today (CT) and a YYYY-MM-DD date; negative if past.
function daysUntil(dateStr) {
  const today = todayCT()
  const a = new Date(today + 'T00:00:00'), b = new Date(dateStr + 'T00:00:00')
  return Math.round((b - a) / 86400000)
}
export function countdownLabel(contest) {
  if (contest.effective_status === 'ended') return 'Ended'
  if (contest.effective_status === 'upcoming') {
    const d = daysUntil(contest.starts_on)
    return d <= 0 ? 'Starts today' : `Starts in ${d} day${d === 1 ? '' : 's'}`
  }
  const d = daysUntil(contest.ends_on)
  if (d < 0)  return 'Wrapping up'
  if (d === 0) return 'Last day!'
  return `${d} day${d === 1 ? '' : 's'} left`
}

// ─── Story-ring avatar (matches the announcements feed) ───────────────────────
export function Avatar({ name, url, size = 40 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className="rounded-full p-[2px] bg-gradient-to-tr from-yellow-400 via-[#E8611A] to-pink-600 flex-shrink-0"
      style={{ width: size, height: size }}>
      <div className="w-full h-full rounded-full bg-white p-[2px]">
        {url
          ? <img src={url} alt="" className="w-full h-full rounded-full object-cover" />
          : <div className="w-full h-full rounded-full bg-gradient-to-br from-[#1A1A1A] to-gray-700 flex items-center justify-center">
              <span className="text-white font-bold" style={{ fontSize: size * 0.32 }}>{initials}</span>
            </div>}
      </div>
    </div>
  )
}

const MEDALS = ['🥇', '🥈', '🥉']

// ─── Confetti burst (no dependency) ───────────────────────────────────────────
function Confetti() {
  const colors = ['#E8611A', '#C8102E', '#FBBF24', '#EC4899', '#22C55E', '#3B82F6']
  const pieces = Array.from({ length: 44 }, (_, i) => ({
    left: (i * 2.27) % 100,
    delay: (i % 11) * 0.12,
    dur: 2.4 + (i % 5) * 0.35,
    color: colors[i % colors.length],
    rot: (i * 47) % 360,
  }))
  return (
    <div className="pointer-events-none fixed inset-0 z-[10000] overflow-hidden">
      <style>{`@keyframes contest-fall{0%{transform:translateY(-12vh) rotate(0);opacity:1}100%{transform:translateY(105vh) rotate(720deg);opacity:.9}}`}</style>
      {pieces.map((p, i) => (
        <span key={i} style={{
          position: 'absolute', top: 0, left: `${p.left}%`, width: 9, height: 14,
          background: p.color, borderRadius: 2, transform: `rotate(${p.rot}deg)`,
          animation: `contest-fall ${p.dur}s linear ${p.delay}s forwards`,
        }} />
      ))}
    </div>
  )
}

// ─── Leaderboard rows ─────────────────────────────────────────────────────────
function Leaderboard({ contest, board, meId }) {
  if (!board?.length) return (
    <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center">
      <Users size={20} className="mx-auto text-gray-300 mb-2" />
      <p className="text-sm text-gray-400 font-medium">No scores yet</p>
      <p className="text-xs text-gray-400 mt-0.5">
        {contest.scoring_mode === 'auto' ? 'Standings appear as the numbers come in.' : 'The manager will add scores soon.'}
      </p>
    </div>
  )
  const top = Math.max(...board.map(r => r.score), 1)
  return (
    <div className="space-y-2">
      {board.map((r, i) => {
        const isMe = r.user_id === meId
        return (
          <div key={r.user_id}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
              i === 0 ? 'bg-amber-50 border-amber-200' : isMe ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-100'}`}>
            <div className="w-7 text-center flex-shrink-0">
              {i < 3 ? <span className="text-lg">{MEDALS[i]}</span>
                     : <span className="text-sm font-bold text-gray-400">{i + 1}</span>}
            </div>
            <Avatar name={r.name} url={r.avatar_url} size={38} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">
                {r.name}{isMe && <span className="ml-1.5 text-[10px] font-semibold text-[#E8611A]">YOU</span>}
              </p>
              <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-[#E8611A] to-[#C8102E]"
                  style={{ width: `${Math.max(6, Math.round((r.score / top) * 100))}%` }} />
              </div>
            </div>
            <div className="text-sm font-extrabold text-gray-900 flex-shrink-0 tabular-nums">
              {fmtScore(contest, r.score)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Cheers bar (reuses the announcements reaction pattern) ────────────────────
function Cheers({ contestId, reactions, onChange }) {
  const total = (reactions || []).reduce((s, r) => s + r.count, 0)
  const toggle = async (emoji) => {
    // optimistic
    onChange(prev => {
      const list = [...(prev || [])]
      const idx = list.findIndex(r => r.emoji === emoji)
      if (idx === -1) list.push({ emoji, count: 1, mine: true, names: [] })
      else {
        const r = list[idx]
        list[idx] = { ...r, mine: !r.mine, count: r.count + (r.mine ? -1 : 1) }
      }
      return list.filter(r => r.count > 0)
    })
    try { await apiPost(`/api/contests/${contestId}/react`, { emoji }) } catch {}
  }
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {CHEER_EMOJI.map(emoji => {
        const r = (reactions || []).find(x => x.emoji === emoji)
        const count = r?.count || 0, mine = r?.mine
        return (
          <button key={emoji} onClick={() => toggle(emoji)} title={r?.names?.join(', ') || `Cheer ${emoji}`}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-sm transition-all hover:scale-110 active:scale-95 ${
              mine ? 'bg-orange-50 border-orange-300 shadow-sm'
                   : count > 0 ? 'bg-gray-50 border-gray-200'
                               : 'bg-white border-transparent opacity-45 hover:opacity-100 hover:border-gray-200'}`}>
            <span>{emoji}</span>
            {count > 0 && <span className={`text-[11px] font-bold ${mine ? 'text-[#E8611A]' : 'text-gray-500'}`}>{count}</span>}
          </button>
        )
      })}
      {total > 0 && <span className="ml-auto text-[11px] text-gray-400 font-medium">{total} cheer{total > 1 ? 's' : ''}</span>}
    </div>
  )
}

// ─── Detail modal ─────────────────────────────────────────────────────────────
function ContestDetail({ id, canManage, meId, onClose, onEdit, onScores, onEnded, onDeleted }) {
  const [c, setC] = useState(null)
  const [reactions, setReactions] = useState([])
  const [busy, setBusy] = useState(false)
  const [confetti, setConfetti] = useState(false)

  const load = () => apiGet(`/api/contests/${id}`).then(d => { setC(d); setReactions(d.reactions || []) }).catch(() => onClose())
  useEffect(() => { load() }, [id])

  const endContest = async () => {
    if (!window.confirm('End this contest and crown the winner? This freezes the standings.')) return
    setBusy(true)
    try { await apiPost(`/api/contests/${id}/end`, {}); setConfetti(true); setTimeout(() => setConfetti(false), 4500); await load(); onEnded() }
    catch (e) { alert('Could not end contest: ' + e.message) }
    finally { setBusy(false) }
  }
  const del = async () => {
    if (!window.confirm('Delete this contest for good?')) return
    try { await apiDelete(`/api/contests/${id}`); onDeleted(); onClose() }
    catch (e) { alert('Delete failed: ' + e.message) }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/50 px-3 py-6 overflow-y-auto">
      {confetti && <Confetti />}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-auto">
        {!c ? (
          <div className="p-10 flex items-center justify-center text-gray-400"><Loader2 className="animate-spin" /></div>
        ) : (
          <>
            {/* Cover / header */}
            <div className="relative">
              {c.cover_image?.url
                ? <img src={c.cover_image.url} alt="" className="w-full h-40 object-cover" />
                : <div className="w-full h-24 bg-gradient-to-r from-[#1A1A1A] via-[#C8102E] to-[#E8611A]" />}
              <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-full bg-black/40 text-white hover:bg-black/60"><X size={18} /></button>
              <span className="absolute top-3 left-3 text-[11px] font-bold uppercase tracking-wider text-white bg-black/40 rounded-full px-2.5 py-1">
                {c.effective_status === 'ended' ? '🏁 Ended' : c.effective_status === 'upcoming' ? '🗓 Upcoming' : `⏳ ${countdownLabel(c)}`}
              </span>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <h2 className="text-xl font-extrabold text-gray-900">{c.title}</h2>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                  <span className="inline-flex items-center gap-1"><Flag size={12} /> {scoreLabel(c)}</span>
                  {c.prize && <span className="inline-flex items-center gap-1 text-[#E8611A] font-semibold"><Gift size={12} /> {c.prize}</span>}
                </div>
              </div>

              {/* Winner banner */}
              {c.effective_status === 'ended' && c.winner_name && (
                <div className="rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 p-4 flex items-center gap-3">
                  <Crown size={26} className="text-amber-500 flex-shrink-0" />
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600">Winner</p>
                    <p className="text-base font-extrabold text-gray-900">{c.winner_name}</p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-lg font-extrabold text-[#E8611A]">{fmtScore(c, c.winner_score)}</p>
                  </div>
                </div>
              )}

              {c.description_html && c.description_html.replace(/<[^>]*>/g, '').trim() && (
                <div className="rich-content text-sm text-gray-700 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: renderRichText(c.description_html) }} />
              )}

              <Leaderboard contest={c} board={c.leaderboard} meId={meId} />

              <div className="pt-1 border-t border-gray-100">
                <Cheers contestId={c.id} reactions={reactions} onChange={setReactions} />
              </div>

              {/* Manager controls */}
              {canManage && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {c.scoring_mode === 'manual' && c.effective_status !== 'ended' && (
                    <button onClick={() => onScores(c)} className="flex-1 min-w-[8rem] py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50">Enter scores</button>
                  )}
                  {c.effective_status !== 'ended' && (
                    <button onClick={endContest} disabled={busy}
                      className="flex-1 min-w-[8rem] py-2 rounded-xl bg-[#E8611A] text-white text-sm font-bold hover:bg-orange-600 disabled:opacity-40 inline-flex items-center justify-center gap-1.5">
                      {busy ? <Loader2 size={15} className="animate-spin" /> : <Crown size={15} />} End & crown winner
                    </button>
                  )}
                  <button onClick={() => onEdit(c)} className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50" title="Edit"><Pencil size={15} /></button>
                  <button onClick={del} className="p-2 rounded-xl border border-gray-200 text-red-500 hover:bg-red-50" title="Delete"><Trash2 size={15} /></button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Create / edit modal ──────────────────────────────────────────────────────
function ContestForm({ contest, onSaved, onClose }) {
  const { currentStudio } = useStudio()
  const isNew = !contest
  const { month, year } = currentMonthYear()
  const [form, setForm] = useState({
    title:        contest?.title        ?? '',
    description_html: contest?.description_html ?? '',
    prize:        contest?.prize        ?? '',
    scoring_mode: contest?.scoring_mode ?? 'auto',
    metric:       contest?.metric       ?? 'memberships',
    score_label:  contest?.score_label  ?? '',
    period_month: contest?.period_month ?? month,
    period_year:  contest?.period_year  ?? year,
    starts_on:    contest?.starts_on    ?? todayCT(),
    ends_on:      contest?.ends_on      ?? new Date(year, month, 0).toISOString().slice(0, 10),
    cover_image:  contest?.cover_image  ?? null,
  })
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const upload = async (e) => {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file || !currentStudio?.id) return
    setUploading(true)
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${currentStudio.id}/contests/${Date.now()}-${safe}`
      const { error } = await supabase.storage.from('marketing-content').upload(path, file, { upsert: false, contentType: file.type })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('marketing-content').getPublicUrl(path)
      set('cover_image', { url: publicUrl, path })
    } catch (err) { alert('Upload failed: ' + (err?.message || 'error')) }
    finally { setUploading(false) }
  }

  const save = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const body = { ...form, prize: form.prize.trim() || null }
      if (isNew) await apiPost('/api/contests', body)
      else       await apiPut(`/api/contests/${contest.id}`, body)
      onSaved()
    } catch (e) { alert('Save failed: ' + e.message); setSaving(false) }
  }

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/50 px-3 py-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden my-auto">
        <div className="bg-[#1A1A1A] px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-[#E8611A] text-xs font-bold uppercase tracking-wider mb-0.5">Team Contest</p>
            <p className="text-white font-bold text-base">{isNew ? 'New Contest' : 'Edit Contest'}</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/70"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <Field label="Contest title" required>
            <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. July Membership Madness"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
          </Field>

          <Field label="Prize" hint="what the winner gets">
            <input value={form.prize} onChange={e => set('prize', e.target.value)} placeholder="e.g. $100 gift card + bragging rights"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
          </Field>

          {/* Scoring mode */}
          {isNew && (
            <Field label="How is it scored?">
              <div className="grid grid-cols-2 gap-2">
                <ModeBtn active={form.scoring_mode === 'auto'} onClick={() => set('scoring_mode', 'auto')}
                  title="Automatic" desc="From your studio's real numbers" />
                <ModeBtn active={form.scoring_mode === 'manual'} onClick={() => set('scoring_mode', 'manual')}
                  title="Manual" desc="You enter the scores" />
              </div>
            </Field>
          )}

          {form.scoring_mode === 'auto' ? (
            <>
              <Field label="Metric to compete on">
                <select value={form.metric} onChange={e => set('metric', e.target.value)} disabled={!isNew}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A] disabled:bg-gray-50 disabled:text-gray-500">
                  {Object.entries(METRIC_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </Field>
              {isNew && (
                <Field label="Scoring month" hint="which month's numbers count">
                  <div className="flex gap-2">
                    <select value={form.period_month} onChange={e => set('period_month', Number(e.target.value))}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                      {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                    <input type="number" value={form.period_year} onChange={e => set('period_year', Number(e.target.value))}
                      className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                  </div>
                </Field>
              )}
            </>
          ) : (
            <Field label="What are you counting?" hint="shown next to each score">
              <input value={form.score_label} onChange={e => set('score_label', e.target.value)} placeholder="e.g. 5-star reviews, cards sent"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-[#E8611A]" />
            </Field>
          )}

          {/* Dates */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Starts"><input type="date" value={form.starts_on} onChange={e => set('starts_on', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" /></Field>
            <Field label="Ends"><input type="date" value={form.ends_on} onChange={e => set('ends_on', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" /></Field>
          </div>

          <Field label="Details" hint="rules, hype, anything">
            <RichTextEditor value={form.description_html} onChange={v => set('description_html', v)} minHeight={90} />
          </Field>

          {/* Cover image */}
          <Field label="Cover image" hint="optional">
            <input ref={fileRef} type="file" accept="image/*" onChange={upload} className="hidden" />
            {form.cover_image?.url ? (
              <div className="relative">
                <img src={form.cover_image.url} alt="" className="w-full h-28 object-cover rounded-lg border border-gray-200" />
                <button onClick={() => set('cover_image', null)} className="absolute top-2 right-2 p-1 rounded-full bg-black/50 text-white hover:bg-black/70"><X size={14} /></button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="w-full border border-dashed border-gray-300 rounded-lg py-4 flex items-center justify-center gap-2 text-sm text-gray-500 hover:border-[#E8611A] hover:text-[#E8611A]">
                {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                {uploading ? 'Uploading…' : 'Add a cover photo'}
              </button>
            )}
          </Field>
        </div>

        <div className="px-5 pb-5 pt-2 flex gap-2 border-t border-gray-100">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={!form.title.trim() || saving}
            className="flex-1 py-2.5 rounded-xl bg-[#E8611A] text-white text-sm font-bold disabled:opacity-40 hover:bg-orange-600 inline-flex items-center justify-center gap-1.5">
            {saving && <Loader2 size={15} className="animate-spin" />} {isNew ? 'Launch Contest 🚀' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Manual scores editor ─────────────────────────────────────────────────────
function ScoresModal({ contest, onSaved, onClose }) {
  const [rows, setRows] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiGet(`/api/contests/${contest.id}`).then(d => {
      const byId = Object.fromEntries((d.leaderboard || []).map(r => [r.user_id, r.score]))
      setRows((d.roster || []).map(m => ({ ...m, score: byId[m.user_id] ?? 0 })))
    }).catch(() => setRows([]))
  }, [contest.id])

  const save = async () => {
    setSaving(true)
    try {
      await apiPut(`/api/contests/${contest.id}/scores`, {
        scores: rows.map(r => ({ user_id: r.user_id, user_name: r.name, score: Number(r.score) || 0 })),
      })
      onSaved()
    } catch (e) { alert('Save failed: ' + e.message); setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/50 px-3 py-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden my-auto">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-[#E8611A] text-xs font-bold uppercase tracking-wider">{contest.title}</p>
            <p className="font-bold text-gray-900 text-sm">Enter scores — {scoreLabel(contest)}</p>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
          {!rows ? <div className="py-8 flex justify-center text-gray-400"><Loader2 className="animate-spin" /></div>
            : rows.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">No team members found.</p>
            : rows.map((r, i) => (
              <div key={r.user_id} className="flex items-center gap-3">
                <Avatar name={r.name} url={r.avatar_url} size={34} />
                <span className="flex-1 text-sm font-medium text-gray-800 truncate">{r.name}</span>
                <input type="number" value={r.score}
                  onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, score: e.target.value } : x))}
                  className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right" />
              </div>
            ))}
        </div>
        <div className="px-4 pb-4 flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving || !rows}
            className="flex-1 py-2.5 rounded-xl bg-[#E8611A] text-white text-sm font-bold disabled:opacity-40 hover:bg-orange-600 inline-flex items-center justify-center gap-1.5">
            {saving && <Loader2 size={15} className="animate-spin" />} Save scores
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Contest card (from the list feed) ────────────────────────────────────────
function ContestCard({ contest, meId, onOpen }) {
  const ended = contest.effective_status === 'ended'
  return (
    <button onClick={() => onOpen(contest)}
      className="text-left w-full bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md hover:border-orange-200 transition-all">
      <div className="relative">
        {contest.cover_image?.url
          ? <img src={contest.cover_image.url} alt="" className="w-full h-28 object-cover" />
          : <div className="w-full h-16 bg-gradient-to-r from-[#1A1A1A] via-[#C8102E] to-[#E8611A]" />}
        <span className={`absolute top-2.5 left-2.5 text-[10px] font-bold uppercase tracking-wider rounded-full px-2.5 py-1 ${
          ended ? 'bg-white/90 text-gray-700' : 'bg-[#E8611A] text-white'}`}>
          {ended ? '🏁 Ended' : contest.effective_status === 'upcoming' ? '🗓 Upcoming' : `⏳ ${countdownLabel(contest)}`}
        </span>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-extrabold text-gray-900 leading-tight">{contest.title}</h3>
          {ended && <Trophy size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />}
        </div>
        {contest.prize && <p className="text-xs text-[#E8611A] font-semibold mt-0.5 inline-flex items-center gap-1"><Gift size={11} /> {contest.prize}</p>}

        {/* Winner or podium */}
        {ended && contest.winner_name ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
            <Crown size={18} className="text-amber-500" />
            <span className="text-sm font-bold text-gray-900 truncate">{contest.winner_name}</span>
            <span className="ml-auto text-sm font-extrabold text-[#E8611A]">{fmtScore(contest, contest.winner_score)}</span>
          </div>
        ) : contest.top3?.length ? (
          <div className="mt-3 space-y-1.5">
            {contest.top3.map((r, i) => (
              <div key={r.user_id} className="flex items-center gap-2">
                <span className="w-5 text-center text-sm">{MEDALS[i]}</span>
                <Avatar name={r.name} url={r.avatar_url} size={26} />
                <span className={`flex-1 text-xs truncate ${r.user_id === meId ? 'font-bold text-[#E8611A]' : 'font-medium text-gray-700'}`}>{r.name}</span>
                <span className="text-xs font-bold text-gray-900">{fmtScore(contest, r.score)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-gray-400">No scores yet — check back soon.</p>
        )}

        {/* My standing if not shown in podium */}
        {!ended && contest.my_rank && contest.my_rank > 3 && (
          <p className="mt-2 text-[11px] text-gray-500">You're <span className="font-bold text-[#E8611A]">#{contest.my_rank}</span> — {fmtScore(contest, contest.my_score)}</p>
        )}
      </div>
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ContestPage() {
  const { isOwnerOrManager, userId } = useRole()
  const [contests, setContests] = useState(null)
  const [err, setErr] = useState(null)
  const [form, setForm]     = useState(null)   // null | 'new' | contest
  const [detail, setDetail] = useState(null)   // contest id
  const [scores, setScores] = useState(null)   // contest for score editor

  const load = () => { setErr(null); apiGet('/api/contests').then(setContests).catch(e => { setErr(e.message); setContests([]) }) }
  useEffect(() => { load() }, [])

  const active   = (contests || []).filter(c => c.effective_status === 'active')
  const upcoming = (contests || []).filter(c => c.effective_status === 'upcoming')
  const ended    = (contests || []).filter(c => c.effective_status === 'ended')

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Trophy className="text-[#E8611A]" size={24} /> Contests</h1>
          <p className="text-gray-500 text-sm mt-1">Friendly competition, real bragging rights. 🔥</p>
        </div>
        {isOwnerOrManager && (
          <button onClick={() => setForm('new')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold bg-[#E8611A] text-white hover:bg-orange-600 flex-shrink-0">
            <Plus size={15} /> New Contest
          </button>
        )}
      </div>

      {err && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">⚠️ {err}</div>}

      {contests === null ? (
        <div className="flex items-center gap-2 text-gray-400"><Loader2 size={16} className="animate-spin" /><span className="text-sm">Loading contests…</span></div>
      ) : contests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-10 text-center">
          <Trophy size={30} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-semibold">No contests yet</p>
          <p className="text-sm text-gray-400 mt-1">
            {isOwnerOrManager ? 'Launch one to get the team fired up.' : 'Your manager will kick one off soon.'}
          </p>
          {isOwnerOrManager && (
            <button onClick={() => setForm('new')} className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-[#E8611A] text-white hover:bg-orange-600">
              <Plus size={15} /> New Contest
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {active.length > 0 && (
            <Section title="Live now" icon={<CalendarDays size={15} className="text-[#E8611A]" />}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {active.map(c => <ContestCard key={c.id} contest={c} meId={userId} onOpen={x => setDetail(x.id)} />)}
              </div>
            </Section>
          )}
          {upcoming.length > 0 && (
            <Section title="Coming up">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {upcoming.map(c => <ContestCard key={c.id} contest={c} meId={userId} onOpen={x => setDetail(x.id)} />)}
              </div>
            </Section>
          )}
          {ended.length > 0 && (
            <Section title="🏆 Hall of Fame" icon={<Medal size={15} className="text-amber-400" />}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {ended.map(c => <ContestCard key={c.id} contest={c} meId={userId} onOpen={x => setDetail(x.id)} />)}
              </div>
            </Section>
          )}
        </div>
      )}

      {/* Modals */}
      {form && <ContestForm contest={form === 'new' ? null : form}
        onSaved={() => { setForm(null); load() }} onClose={() => setForm(null)} />}
      {detail && <ContestDetail id={detail} canManage={isOwnerOrManager} meId={userId}
        onClose={() => setDetail(null)}
        onEdit={c => { setDetail(null); setForm(c) }}
        onScores={c => { setDetail(null); setScores(c) }}
        onEnded={load} onDeleted={load} />}
      {scores && <ScoresModal contest={scores}
        onSaved={() => { setScores(null); load() }} onClose={() => setScores(null)} />}
    </div>
  )
}

function Section({ title, icon, children }) {
  return (
    <div>
      <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">{icon}{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, hint, required, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">
        {label} {required && <span className="text-red-400">*</span>}
        {hint && <span className="text-gray-400 font-normal"> — {hint}</span>}
      </label>
      {children}
    </div>
  )
}

function ModeBtn({ active, onClick, title, desc }) {
  return (
    <button type="button" onClick={onClick}
      className={`text-left rounded-xl border p-3 transition-colors ${active ? 'border-[#E8611A] bg-orange-50' : 'border-gray-200 hover:border-gray-300'}`}>
      <p className={`text-sm font-bold ${active ? 'text-[#E8611A]' : 'text-gray-800'}`}>{title}</p>
      <p className="text-[11px] text-gray-500 mt-0.5">{desc}</p>
    </button>
  )
}
