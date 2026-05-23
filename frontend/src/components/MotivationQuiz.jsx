import { useState } from 'react'
import { Save, Check, Loader2 } from 'lucide-react'

const inputCls  = 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500'
const labelCls  = 'block text-sm font-semibold text-gray-700 mb-1.5'
const textaCls  = `${inputCls} resize-none`

const MOTIVATION_TYPES = [
  { value: 'money',           label: 'Money 💰' },
  { value: 'recognition',     label: 'Recognition 🌟' },
  { value: 'career_growth',   label: 'Career growth 📈' },
  { value: 'flexibility',     label: 'Flexibility 🧘' },
  { value: 'competition',     label: 'Competition 🏆' },
  { value: 'helping_people',  label: 'Helping people ❤️' },
  { value: 'other',           label: 'Other' },
]

const MOTIVATION_STYLES = [
  { value: 'public_shoutouts',     label: 'Public shoutouts 📣' },
  { value: 'private_encouragement',label: 'Private encouragement 💬' },
  { value: 'team_competitions',    label: 'Team competitions 🏁' },
  { value: 'bonuses_gift_cards',   label: 'Bonuses/gift cards 💵' },
  { value: 'growth_opportunities', label: 'Growth opportunities 📚' },
  { value: 'flexible_schedule',    label: 'Flexible schedule ⏰' },
]

function MultiChip({ options, selected = [], onChange }) {
  const toggle = (v) => onChange(
    selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]
  )
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => toggle(o.value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
            selected.includes(o.value)
              ? 'bg-orange-500 border-orange-500 text-white'
              : 'bg-white border-gray-300 text-gray-600 hover:border-orange-400 hover:text-orange-600'
          }`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Section({ emoji, title, children }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
        <span className="text-lg">{emoji}</span>
        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  )
}

export function MotivationQuiz({ initialAnswers = {}, initialBirthday = '', onSave, compact = false }) {
  const [a, setA]       = useState({ ...initialAnswers })
  const [birthday, setBirthday] = useState(
    initialAnswers.birthday || initialBirthday || ''
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState('')

  const set = (k, v) => setA(prev => ({ ...prev, [k]: v }))

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      const answers = { ...a, birthday: birthday || null }
      await onSave(answers)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) { setError(err.message || 'Save failed') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-8">
      {/* Section 1: Dreaming Bigger */}
      <Section emoji="✨" title="Dreaming Bigger">
        <Field label="What are you currently saving for or working toward?">
          <textarea rows={2} className={textaCls} value={a.saving_for || ''}
            onChange={e => set('saving_for', e.target.value)}
            placeholder="A trip, a car, paying off debt, a house…" />
        </Field>

        <Field label="What motivates you most right now?">
          <MultiChip
            options={MOTIVATION_TYPES}
            selected={a.motivation_types || []}
            onChange={v => set('motivation_types', v)}
          />
          {(a.motivation_types || []).includes('other') && (
            <input className={`${inputCls} mt-2`} value={a.motivation_other || ''}
              onChange={e => set('motivation_other', e.target.value)}
              placeholder="Tell us more…" />
          )}
        </Field>

        <Field label="What would make you feel the most appreciated at work?">
          <textarea rows={2} className={textaCls} value={a.appreciation_style || ''}
            onChange={e => set('appreciation_style', e.target.value)}
            placeholder="Verbal praise, a gift card, extra time off…" />
        </Field>
      </Section>

      {/* Section 2: Favorites */}
      <Section emoji="🍓" title="Favorites">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Favorite snack or treat?">
            <input className={inputCls} value={a.fav_snack || ''} onChange={e => set('fav_snack', e.target.value)} placeholder="Chips, chocolate, fruit…" />
          </Field>
          <Field label="Favorite smoothie order?">
            <input className={inputCls} value={a.fav_smoothie || ''} onChange={e => set('fav_smoothie', e.target.value)} placeholder="Green detox, strawberry banana…" />
          </Field>
          <Field label="Favorite coffee or drink?">
            <input className={inputCls} value={a.fav_coffee || ''} onChange={e => set('fav_coffee', e.target.value)} placeholder="Iced latte, Diet Coke…" />
          </Field>
          <Field label="Favorite restaurant?">
            <input className={inputCls} value={a.fav_restaurant || ''} onChange={e => set('fav_restaurant', e.target.value)} placeholder="Chipotle, The Plaza…" />
          </Field>
          <Field label="Favorite store or place to shop?">
            <input className={inputCls} value={a.fav_shop || ''} onChange={e => set('fav_shop', e.target.value)} placeholder="Target, Amazon, TJ Maxx…" />
          </Field>
          <Field label="Favorite gift card to receive?">
            <input className={inputCls} value={a.fav_gift_card || ''} onChange={e => set('fav_gift_card', e.target.value)} placeholder="Starbucks, Amazon, Visa…" />
          </Field>
        </div>
      </Section>

      {/* Section 3: Fun Stuff */}
      <Section emoji="🎉" title="Fun Stuff">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="What's your birthday? 🎂">
            <input type="date" className={inputCls} value={birthday} onChange={e => setBirthday(e.target.value)} />
          </Field>
          <Field label="Favorite color?">
            <input className={inputCls} value={a.fav_color || ''} onChange={e => set('fav_color', e.target.value)} placeholder="Purple, coral, black…" />
          </Field>
          <Field label="Favorite music or artist?">
            <input className={inputCls} value={a.fav_music || ''} onChange={e => set('fav_music', e.target.value)} placeholder="Taylor Swift, country, hip-hop…" />
          </Field>
          <Field label="Favorite way to relax after a stressful day?">
            <input className={inputCls} value={a.fav_relax || ''} onChange={e => set('fav_relax', e.target.value)} placeholder="Bath, Netflix, workout…" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="What's one thing people may not know about you?">
              <textarea rows={2} className={textaCls} value={a.fun_fact || ''}
                onChange={e => set('fun_fact', e.target.value)}
                placeholder="A hidden talent, a surprising hobby…" />
            </Field>
          </div>
        </div>
      </Section>

      {/* Section 4: Motivation Style */}
      <Section emoji="🔥" title="Motivation Style">
        <Field label="Which motivates you MORE? (pick all that apply)">
          <MultiChip
            options={MOTIVATION_STYLES}
            selected={a.motivation_styles || []}
            onChange={v => set('motivation_styles', v)}
          />
        </Field>

        <Field label="What kind of contests or incentives would get you REALLY excited to sell?">
          <textarea rows={2} className={textaCls} value={a.contest_excitement || ''}
            onChange={e => set('contest_excitement', e.target.value)}
            placeholder="Cash prizes, gift cards, spa day, leaderboard…" />
        </Field>

        <Field label="What's a personal goal you want to accomplish this year?">
          <input className={inputCls} value={a.personal_goal || ''}
            onChange={e => set('personal_goal', e.target.value)}
            placeholder="Run a 5K, save $5,000, learn something new…" />
        </Field>

        <Field label="Anything else you want me to know so I can better support you? 😊">
          <textarea rows={3} className={textaCls} value={a.anything_else || ''}
            onChange={e => set('anything_else', e.target.value)}
            placeholder="Whatever's on your mind…" />
        </Field>
      </Section>

      {error && <div className="bg-red-50 border border-red-300 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}

      <div className="flex justify-end pt-2">
        <button type="button" onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50">
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
          {saving ? 'Saving…' : saved ? 'Saved! 🎉' : 'Save My Answers'}
        </button>
      </div>
    </div>
  )
}
