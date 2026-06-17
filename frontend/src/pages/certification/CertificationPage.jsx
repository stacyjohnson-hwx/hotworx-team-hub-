import { useState, useEffect, useCallback, Fragment } from 'react'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import { useRole } from '@/hooks/useRole'
import {
  Award, Loader2, X, Play, CheckCircle2, Circle, Clock, AlertTriangle, RotateCcw,
  Video, Pencil, Plus, Trash2, ClipboardList, Grid3x3, BookOpen, MessageSquare, Save, ChevronRight,
} from 'lucide-react'

const ACCENT = 'var(--studio-accent)'

// ─── Status ladder ──────────────────────────────────────────────────────────
const STATUS = {
  not_started:   { label: 'Not Started',   cls: 'bg-gray-100 text-gray-500',   dot: 'bg-gray-300',   Icon: Circle },
  learning:      { label: 'Learning',      cls: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-500',   Icon: BookOpen },
  ready_to_test: { label: 'Ready to Test', cls: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500',  Icon: Clock },
  certified:     { label: 'Certified',     cls: 'bg-green-100 text-green-700', dot: 'bg-green-500',  Icon: CheckCircle2 },
  needs_recert:  { label: 'Needs Recert',  cls: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500', Icon: RotateCcw },
}
const smeta = (s) => STATUS[s] || STATUS.not_started

function StatusBadge({ status, sm }) {
  const m = sm || smeta(status)
  return <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${m.cls}`}><m.Icon size={11} /> {m.label}</span>
}

// Practice mode blanks any text wrapped in [[double brackets]] (the "key lines").
function renderScript(body, practice) {
  if (!body) return <p className="text-sm text-gray-400 italic">No script written yet.</p>
  return body.split('\n').map((line, i) => {
    const html = line.replace(/\[\[(.+?)\]\]/g, (_, inner) =>
      practice ? '<span style="background:#fde68a;color:transparent;border-radius:3px;">' + '_'.repeat(Math.max(inner.length, 6)) + '</span>'
               : '<strong>' + inner + '</strong>')
    return <p key={i} className="text-sm text-gray-700 leading-relaxed min-h-[1.2em]" dangerouslySetInnerHTML={{ __html: html || '&nbsp;' }} />
  })
}
function fmtDate(d) { return d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '' }

// ─── Quiz modal ───────────────────────────────────────────────────────────────
function QuizModal({ skill, questions, onClose, onResult }) {
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [saving, setSaving] = useState(false)
  const submit = async () => {
    setSaving(true)
    try { const r = await apiPost(`/api/certification/skills/${skill.id}/quiz`, { answers }); setResult(r); onResult?.() }
    catch (e) { alert(e.message) } finally { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-gray-900">Quiz — {skill.name}</h2>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        {result ? (
          <div className="p-8 text-center">
            {result.passed
              ? <CheckCircle2 size={42} className="mx-auto text-green-500 mb-3" />
              : <AlertTriangle size={42} className="mx-auto text-amber-500 mb-3" />}
            <p className="text-2xl font-bold text-gray-900">{result.score}%</p>
            <p className={`text-sm font-medium mt-1 ${result.passed ? 'text-green-600' : 'text-amber-600'}`}>
              {result.passed ? `Passed! You're now Ready to Test — your Lead will schedule the live demo.` : `Need ${result.threshold}% to pass. Review the script and try again.`}
            </p>
            <button onClick={onClose} className="mt-5 px-5 py-2 rounded-lg text-white text-sm font-semibold" style={{ backgroundColor: ACCENT }}>Done</button>
          </div>
        ) : (
          <>
            <div className="p-5 space-y-5">
              {questions.map((q, i) => (
                <div key={q.id}>
                  <p className="text-sm font-medium text-gray-800 mb-2">{i + 1}. {q.prompt}</p>
                  {q.type === 'multiple_choice' && Array.isArray(q.choices) ? (
                    <div className="space-y-1.5">
                      {q.choices.map((c, ci) => (
                        <label key={ci} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm ${answers[q.id] === c ? 'border-[var(--studio-accent)] bg-[var(--studio-accent-soft)]' : 'border-gray-200'}`}>
                          <input type="radio" name={q.id} checked={answers[q.id] === c} onChange={() => setAnswers(a => ({ ...a, [q.id]: c }))} />
                          {c}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <input type="text" value={answers[q.id] || ''} onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                      placeholder="Type the key line…" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--studio-accent)]/30" />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button onClick={submit} disabled={saving} className="px-5 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-2" style={{ backgroundColor: ACCENT }}>
                {saving && <Loader2 size={14} className="animate-spin" />} Submit Quiz
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Script study modal (TSA) ───────────────────────────────────────────────
function StudyModal({ skillId, status, onClose, onChanged }) {
  const [data, setData] = useState(null)
  const [practice, setPractice] = useState(false)
  const [quiz, setQuiz] = useState(false)
  useEffect(() => { apiGet(`/api/certification/skills/${skillId}`).then(setData).catch(() => {}) }, [skillId])

  const startLearning = async () => { await apiPost(`/api/certification/skills/${skillId}/start`, {}); onChanged?.() }

  if (!data) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-8" onClick={e => e.stopPropagation()}><Loader2 className="animate-spin text-gray-300" /></div>
    </div>
  )
  const { skill, script, questions } = data
  const canQuiz = questions.length > 0 && ['learning', 'ready_to_test', 'needs_recert'].includes(status)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-semibold text-gray-900">{skill.name}</h2>
            <div className="mt-1"><StatusBadge status={status} /></div>
          </div>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          {script?.video_url && (
            <a href={script.video_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg bg-gray-900 text-white">
              <Video size={15} /> Watch "what good looks like"
            </a>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">The Script {script?.version ? `· v${script.version}` : ''}</span>
            <button onClick={() => setPractice(p => !p)} className={`text-xs font-medium px-2.5 py-1 rounded-lg border ${practice ? 'text-white border-transparent' : 'text-gray-600 border-gray-300'}`} style={practice ? { backgroundColor: ACCENT } : {}}>
              {practice ? 'Show answers' : 'Practice mode'}
            </button>
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-100 p-4 space-y-1">{renderScript(script?.body, practice)}</div>
          {practice && <p className="text-[11px] text-gray-400">Key lines are hidden — recite them from memory, then reveal to check.</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
          {status === 'not_started' && (
            <button onClick={startLearning} className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 flex items-center gap-1.5"><Play size={14} /> Mark as practicing</button>
          )}
          {status === 'certified'
            ? <span className="text-sm text-green-600 font-medium flex items-center gap-1.5"><CheckCircle2 size={16} /> Certified{data.skill && ''}</span>
            : status === 'ready_to_test'
              ? <span className="text-sm text-amber-600 font-medium flex items-center gap-1.5"><Clock size={16} /> Live test pending with your Lead</span>
              : (
                <button onClick={() => canQuiz ? setQuiz(true) : null} disabled={!canQuiz}
                  className="px-5 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-40 flex items-center gap-2" style={{ backgroundColor: ACCENT }}
                  title={questions.length === 0 ? 'No quiz written for this skill yet' : ''}>
                  <ClipboardList size={15} /> {questions.length === 0 ? 'Quiz coming soon' : "I'm ready — take the quiz"}
                </button>
              )}
        </div>
      </div>
      {quiz && <QuizModal skill={skill} questions={questions} onClose={() => setQuiz(false)} onResult={onChanged} />}
    </div>
  )
}

// ─── TSA: my certification board ────────────────────────────────────────────
function TsaBoard() {
  const [board, setBoard] = useState(null)
  const [cats, setCats] = useState([])
  const [feed, setFeed] = useState([])
  const [open, setOpen] = useState(null) // {skill_id, status}
  const load = useCallback(async () => {
    const [b, lib, f] = await Promise.all([
      apiGet('/api/certification/my'),
      apiGet('/api/certification/library'),
      apiGet('/api/certification/feedback').catch(() => []),
    ])
    setBoard(b); setCats(lib); setFeed(f)
  }, [])
  useEffect(() => { load() }, [load])
  if (!board) return <Spinner />

  const statusBySkill = {}; for (const r of board.rows) statusBySkill[r.skill_id] = r
  const pct = board.total ? Math.round((board.certified / board.total) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">My Certifications</h2>
          <span className="text-sm font-semibold text-gray-700">{board.certified} of {board.total} certified</span>
        </div>
        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: ACCENT }} />
        </div>
      </div>

      {cats.map(cat => (
        <div key={cat.id}>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{cat.name}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {cat.skills.map(sk => {
              const st = statusBySkill[sk.id]?.status || 'not_started'
              const m = smeta(st)
              return (
                <button key={sk.id} onClick={() => setOpen({ skill_id: sk.id, status: st })}
                  className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 text-left hover:border-gray-300 transition-colors">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${m.dot}`} />
                  <span className="flex-1 min-w-0 text-sm font-medium text-gray-800 truncate">{sk.name}</span>
                  <StatusBadge status={st} sm={m} />
                  <ChevronRight size={15} className="text-gray-300 flex-shrink-0" />
                </button>
              )
            })}
          </div>
        </div>
      ))}

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-1.5"><MessageSquare size={13} /> Coaching Feedback</p>
        {feed.length === 0 ? <p className="text-sm text-gray-400">No feedback yet — it'll show here as you train.</p>
          : <div className="space-y-2">
              {feed.map(f => (
                <div key={f.id} className="bg-white border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    {f.skill_name && <span className="text-[10px] font-semibold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{f.skill_name}</span>}
                    <span className="text-[10px] text-gray-400">{fmtDate(f.created_at)}{f.lead_name ? ` · ${f.lead_name}` : ''}</span>
                  </div>
                  <p className="text-sm text-gray-700">{f.note}</p>
                </div>
              ))}
            </div>}
      </div>

      {open && <StudyModal skillId={open.skill_id} status={open.status} onClose={() => setOpen(null)} onChanged={() => { load(); setOpen(null) }} />}
    </div>
  )
}

// ─── Lead: demo modal ───────────────────────────────────────────────────────
function DemoModal({ item, onClose, onDone }) {
  const [result, setResult] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async () => {
    if (!result) return
    setSaving(true)
    try { await apiPost(`/api/certification/skills/${item.skill_id}/demo`, { tsa_user_id: item.tsa_user_id, result, feedback_note: note.trim() || null }); onDone() }
    catch (e) { alert(e.message); setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div><h2 className="font-semibold text-gray-900">Live Demo</h2><p className="text-xs text-gray-400">{item.tsa_name} · {item.skill_name}</p></div>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setResult('pass')} className={`py-3 rounded-lg text-sm font-semibold border ${result === 'pass' ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 text-gray-700'}`}>Pass → Certify</button>
            <button onClick={() => setResult('fail')} className={`py-3 rounded-lg text-sm font-semibold border ${result === 'fail' ? 'bg-red-600 text-white border-red-600' : 'border-gray-300 text-gray-700'}`}>Needs work</button>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Feedback {result === 'fail' ? '(what to work on)' : '(optional)'}</label>
            <textarea rows={3} value={note} onChange={e => setNote(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--studio-accent)]/30" placeholder="Coaching notes — shown to the TSA in their feed." />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
          <button onClick={submit} disabled={!result || saving} className="px-5 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-40 flex items-center gap-2" style={{ backgroundColor: ACCENT }}>
            {saving && <Loader2 size={14} className="animate-spin" />} Save Result
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Lead: live-test queue ──────────────────────────────────────────────────
function PendingQueue() {
  const [items, setItems] = useState(null)
  const [demo, setDemo] = useState(null)
  const load = useCallback(() => { apiGet('/api/certification/pending').then(setItems).catch(() => setItems([])) }, [])
  useEffect(() => { load() }, [load])
  if (!items) return <Spinner />
  if (!items.length) return <p className="text-sm text-gray-400">No TSAs waiting for a live test. They appear here after passing a skill's quiz.</p>
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
          <Clock size={16} className="text-amber-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">{it.tsa_name}</p>
            <p className="text-xs text-gray-500 truncate">{it.skill_name} · ready {fmtDate(it.since?.slice(0, 10))}</p>
          </div>
          <button onClick={() => setDemo(it)} className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold" style={{ backgroundColor: ACCENT }}>Record demo</button>
        </div>
      ))}
      {demo && <DemoModal item={demo} onClose={() => setDemo(null)} onDone={() => { setDemo(null); load() }} />}
    </div>
  )
}

// ─── Lead/Owner: certification matrix ───────────────────────────────────────
function Matrix() {
  const [data, setData] = useState(null)
  const [cats, setCats] = useState([])
  useEffect(() => {
    Promise.all([apiGet('/api/certification/matrix'), apiGet('/api/certification/library').catch(() => [])])
      .then(([m, lib]) => { setData(m); setCats(lib) })
      .catch(() => {})
  }, [])
  if (!data) return <Spinner />
  if (!data.tsas.length) return <p className="text-sm text-gray-400">No active TSAs in this studio yet.</p>

  const colCount = data.tsas.length + 2
  const skillsByCat = {}
  for (const sk of data.skills) (skillsByCat[sk.category_id] = skillsByCat[sk.category_id] || []).push(sk)
  // Categories in library order; fall back to one untitled group if the library didn't load.
  const groups = cats.length
    ? cats.map(c => ({ name: c.name, skills: skillsByCat[c.id] || [] })).filter(g => g.skills.length)
    : [{ name: null, skills: data.skills }]

  const skillRow = (sk) => (
    <tr key={sk.id} className="border-b border-gray-100">
      <td className="sticky left-0 bg-white px-3 py-2 font-medium text-gray-800 whitespace-nowrap max-w-[220px] truncate">{sk.name}</td>
      {data.tsas.map(t => {
        const m = smeta(t.statuses[sk.id])
        return <td key={t.tsa_user_id} className="px-2 py-2 text-center"><span className={`inline-block w-2.5 h-2.5 rounded-full ${m.dot}`} title={`${t.name}: ${m.label}`} /></td>
      })}
      <td className="px-3 py-2 text-center font-semibold border-l border-gray-100 text-gray-700">{data.rollup[sk.id]?.pct ?? 0}%</td>
    </tr>
  )

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full text-xs border-collapse">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="sticky left-0 bg-gray-50 text-left px-3 py-2.5 font-semibold text-gray-600">Skill</th>
            {data.tsas.map(t => <th key={t.tsa_user_id} className="px-2 py-2.5 font-semibold text-gray-600 whitespace-nowrap">{t.name.split(' ')[0]}</th>)}
            <th className="px-3 py-2.5 font-semibold text-gray-600 whitespace-nowrap border-l border-gray-200">% Cert</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g, gi) => (
            <Fragment key={gi}>
              {g.name && (
                <tr className="bg-gray-100 border-b border-gray-200">
                  <td colSpan={colCount} className="sticky left-0 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">{g.name}</td>
                </tr>
              )}
              {g.skills.map(skillRow)}
            </Fragment>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-3 p-3 border-t border-gray-100">
        {Object.entries(STATUS).map(([k, m]) => <span key={k} className="inline-flex items-center gap-1 text-[11px] text-gray-500"><span className={`w-2.5 h-2.5 rounded-full ${m.dot}`} /> {m.label}</span>)}
      </div>
    </div>
  )
}

// ─── Owner/Lead: library authoring ──────────────────────────────────────────
function Library() {
  const [cats, setCats] = useState(null)
  const [editing, setEditing] = useState(null) // skill id being edited
  const load = useCallback(() => { apiGet('/api/certification/library').then(setCats).catch(() => setCats([])) }, [])
  useEffect(() => { load() }, [load])

  const addCategory = async () => { const name = prompt('New category name:'); if (name) { await apiPost('/api/certification/categories', { name, sort_order: (cats?.length || 0) + 1 }); load() } }
  const addSkill = async (categoryId) => { const name = prompt('New skill name:'); if (name) { await apiPost('/api/certification/skills', { category_id: categoryId, name }); load() } }

  if (!cats) return <Spinner />
  if (editing) return <SkillEditor skillId={editing} onBack={() => { setEditing(null); load() }} />
  return (
    <div className="space-y-5">
      <div className="flex justify-end"><button onClick={addCategory} className="text-xs font-semibold flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700"><Plus size={13} /> Add category</button></div>
      {cats.map(cat => (
        <div key={cat.id}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{cat.name}</p>
            <button onClick={() => addSkill(cat.id)} className="text-[11px] text-gray-500 hover:text-gray-700 flex items-center gap-1"><Plus size={11} /> Add skill</button>
          </div>
          <div className="space-y-1.5">
            {cat.skills.map(sk => (
              <button key={sk.id} onClick={() => setEditing(sk.id)} className="w-full flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-left hover:border-gray-300">
                <span className="flex-1 text-sm font-medium text-gray-800">{sk.name}</span>
                <span className="text-[10px] text-gray-400">{sk.current_version ? `Script v${sk.current_version}` : 'No script'} · {sk.quiz_count} Qs{sk.has_video ? ' · 🎥' : ''}</span>
                <Pencil size={13} className="text-gray-400" />
              </button>
            ))}
            {cat.skills.length === 0 && <p className="text-xs text-gray-400 px-1">No skills yet.</p>}
          </div>
        </div>
      ))}
    </div>
  )
}

function SkillEditor({ skillId, onBack }) {
  const [data, setData] = useState(null)
  const [body, setBody] = useState('')
  const [video, setVideo] = useState('')
  const [savingScript, setSavingScript] = useState(false)
  const load = useCallback(() => apiGet(`/api/certification/skills/${skillId}`).then(d => { setData(d); setBody(d.script?.body || ''); setVideo(d.script?.video_url || '') }), [skillId])
  useEffect(() => { load() }, [load])

  const saveScript = async () => {
    if (!confirm('Save a new version? Anyone currently Certified on this skill will move to "Needs Recert" and must re-quiz + re-demo.')) return
    setSavingScript(true)
    try { await apiPut(`/api/certification/skills/${skillId}/script`, { body, video_url: video.trim() || null }); await load() }
    finally { setSavingScript(false) }
  }
  const addQuestion = async () => {
    const type = confirm('OK = Multiple choice, Cancel = short recall (type the line)') ? 'multiple_choice' : 'short_recall'
    const prompt_ = prompt('Question prompt:'); if (!prompt_) return
    let choices = null, correct
    if (type === 'multiple_choice') {
      const raw = prompt('Answer choices, comma-separated:'); if (!raw) return
      choices = raw.split(',').map(s => s.trim()).filter(Boolean)
      correct = prompt(`Which is correct? Type it exactly:\n${choices.join(' | ')}`)
    } else { correct = prompt('Correct answer (the key line):') }
    if (!correct) return
    await apiPost(`/api/certification/skills/${skillId}/questions`, { type, prompt: prompt_, choices, correct_answer: correct })
    load()
  }
  const delQuestion = async (qid) => { if (confirm('Delete this question?')) { await apiDelete(`/api/certification/questions/${qid}`); load() } }

  if (!data) return <Spinner />
  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--studio-accent)]/30'
  return (
    <div className="space-y-5 max-w-2xl">
      <button onClick={onBack} className="text-sm text-gray-500 hover:text-gray-700">← Back to library</button>
      <h2 className="text-lg font-bold text-gray-900">{data.skill.name}</h2>

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-gray-700">Script {data.script?.version ? `(v${data.script.version})` : ''}</h3></div>
        <p className="text-[11px] text-gray-400">Wrap key lines in <code>[[double brackets]]</code> — those get hidden in the TSA's practice mode.</p>
        <textarea rows={10} value={body} onChange={e => setBody(e.target.value)} className={`${inputCls} font-mono`} placeholder={'Setup line…\nKey line: [[We guarantee results in 30 days]]\nThe ask: [[Which start date works — today or tomorrow?]]'} />
        <input value={video} onChange={e => setVideo(e.target.value)} className={inputCls} placeholder="Video link (what good looks like) — optional" />
        <div className="flex justify-end"><button onClick={saveScript} disabled={savingScript} className="px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-2" style={{ backgroundColor: ACCENT }}>{savingScript ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save new version</button></div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Quiz ({data.questions.length}) · pass {data.skill.pass_threshold}%</h3>
          <button onClick={addQuestion} className="text-xs font-semibold flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700"><Plus size={13} /> Add question</button>
        </div>
        {data.questions.length === 0 ? <p className="text-xs text-gray-400">No quiz questions yet — TSAs can't certify until at least one exists.</p>
          : data.questions.map((q, i) => (
            <div key={q.id} className="flex items-start gap-2 border-b border-gray-50 pb-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800">{i + 1}. {q.prompt}</p>
                <p className="text-[11px] text-gray-400">{q.type === 'multiple_choice' ? `Choices: ${(q.choices || []).join(', ')} · ` : 'Recall · '}Answer: <span className="text-green-600 font-medium">{q.correct_answer}</span></p>
              </div>
              <button onClick={() => delQuestion(q.id)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
            </div>
          ))}
      </div>
    </div>
  )
}

function Spinner() { return <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-gray-300" size={22} /></div> }

// ─── Page shell ──────────────────────────────────────────────────────────────
const LEAD_TABS = [
  { id: 'matrix',  label: 'Matrix',     Icon: Grid3x3 },
  { id: 'tests',   label: 'Live Tests', Icon: ClipboardList },
  { id: 'library', label: 'Library',    Icon: BookOpen },
]

export default function CertificationPage() {
  const { isOwnerOrManager } = useRole()
  const [tab, setTab] = useState('matrix')

  return (
    <div className="max-w-5xl mx-auto pb-12">
      <div className="flex items-center gap-2 mb-1">
        <Award size={20} style={{ color: ACCENT }} />
        <h1 className="text-2xl font-bold text-gray-900">Sales Certification</h1>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        {isOwnerOrManager ? 'Track who has mastered each sales skill — quiz, then live demo to certify.' : 'Your sales skill ladder. Study the scripts, pass the quiz, then earn your live-demo certification.'}
      </p>

      {isOwnerOrManager ? (
        <>
          <div className="flex gap-1 mb-5 bg-gray-100 rounded-lg p-0.5 w-fit">
            {LEAD_TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                <t.Icon size={13} /> {t.label}
              </button>
            ))}
          </div>
          {tab === 'matrix' && <Matrix />}
          {tab === 'tests' && <PendingQueue />}
          {tab === 'library' && <Library />}
        </>
      ) : <TsaBoard />}
    </div>
  )
}
