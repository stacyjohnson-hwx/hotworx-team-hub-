import { useState } from 'react'
import { CheckCircle, ExternalLink, AlertTriangle } from 'lucide-react'
import { apiPost } from '@/hooks/useApi'

const VARIANCE_THRESHOLD = 5
const ENG_GOAL = 3

const ENGAGEMENT_ITEMS = [
  { key: 'eng_testimonial',    label: 'Ask a member for a testimonial video' },
  { key: 'eng_google_review',  label: 'Google Review asked for' },
  { key: 'eng_photos_members', label: 'Photos/videos of members with foam boards or in workouts' },
  { key: 'eng_photos_rewards', label: 'Photos of members redeeming their rewards' },
  { key: 'eng_ambassador',     label: 'Tell a member about the ambassador program' },
  { key: 'eng_app_link',       label: 'Show a member how to send the link on their app' },
  { key: 'eng_biz_month',      label: 'Tell a member about Business of the Month and how to enter the raffle' },
  { key: 'eng_ig_tiktok',      label: 'Create an Instagram post / TikTok' },
  { key: 'eng_new_member',     label: 'Get to know a new member' },
  { key: 'eng_follow_up',      label: 'Follow up with members to see how things are going' },
  { key: 'eng_thank_you_cards',label: 'Write thank you cards to new members' },
]

function calcVariance(form) {
  const start = parseFloat(form.drawer_start) || 0
  const cash  = parseFloat(form.cash_collected) || 0
  const end   = parseFloat(form.drawer_end) || 0
  return end - start - cash
}

function MoneyInput({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
        <input
          type="number" min="0" step="0.01" value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600"
        />
      </div>
    </div>
  )
}

function NumberInput({ label, value, onChange, goal }) {
  const num = parseInt(value) || 0
  const hitGoal = goal && num >= goal
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label}
        {goal && <span className="ml-1 text-gray-400 font-normal">Goal: {goal}</span>}
      </label>
      <input
        type="number" min="0" value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600 ${hitGoal ? 'border-green-400 bg-green-50' : 'border-gray-300'}`}
      />
    </div>
  )
}

function Section({ title, children, badge }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</h3>
        {badge}
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  )
}

function CheckRow({ label, checked, onChange, href }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-600/40 flex-shrink-0"
      />
      <span className="text-sm text-gray-700 flex-1 leading-snug">{label}</span>
      {href && (
        <a href={href} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
          className="text-gray-400 hover:text-red-600 flex-shrink-0 mt-0.5" title="Open link">
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </label>
  )
}

const INITIAL_FORM = {
  shift_type: '',
  drawer_start: '', cash_collected: '', credit_collected: '', drawer_end: '',
  sweat_basic: '', sweat_elite: '', cancellations_count: '', cancellations_notes: '',
  retail_amount: '', sales_notes: '',
  phone_calls: '', sms_sent: '', red_appt_scheduled: '',
  notes_added_missed: false, followed_up_missed: false, survey_sent_red_appts: false,
  leads_notes: '',
  eng_testimonial: false, eng_google_review: false, eng_photos_members: false,
  eng_photos_rewards: false, eng_ambassador: false, eng_app_link: false,
  eng_biz_month: false, eng_ig_tiktok: false, eng_new_member: false,
  eng_follow_up: false, eng_thank_you_cards: false,
  watched_training_video: false, used_sales_gpt: false, role_played_script: false,
  orders_needed: '', general_notes: '',
}

export default function EodForm({ submittedShifts, onSubmitted }) {
  const [form, setForm] = useState(INITIAL_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const variance = calcVariance(form)
  const hasVarianceAlert = form.drawer_end !== '' && Math.abs(variance) > VARIANCE_THRESHOLD

  const alreadySubmitted = submittedShifts.map(s => s.shift_type)
  const availableShifts = ['mid', 'closing'].filter(s => !alreadySubmitted.includes(s))

  const engCount = ENGAGEMENT_ITEMS.filter(i => form[i.key]).length
  const engGoalMet = engCount >= ENG_GOAL

  async function submit(e) {
    e.preventDefault()
    if (!form.shift_type) return setError('Please select a shift type.')
    setSaving(true)
    setError(null)
    try {
      const payload = {
        ...form,
        drawer_start: parseFloat(form.drawer_start) || 0,
        cash_collected: parseFloat(form.cash_collected) || 0,
        credit_collected: parseFloat(form.credit_collected) || 0,
        drawer_end: parseFloat(form.drawer_end) || 0,
        sweat_basic: parseInt(form.sweat_basic) || 0,
        sweat_elite: parseInt(form.sweat_elite) || 0,
        cancellations_count: parseInt(form.cancellations_count) || 0,
        retail_amount: parseFloat(form.retail_amount) || 0,
        phone_calls: parseInt(form.phone_calls) || 0,
        sms_sent: parseInt(form.sms_sent) || 0,
        red_appt_scheduled: parseInt(form.red_appt_scheduled) || 0,
      }
      await apiPost('/api/eod', payload)
      setSuccess(true)
      onSubmitted()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
          <CheckCircle className="w-9 h-9 text-green-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Shift submitted!</h2>
        <p className="text-gray-500 text-sm">
          {form.shift_type === 'closing'
            ? 'The EOD email digest has been sent to the owner and manager.'
            : 'Your EOD report has been recorded.'}
        </p>
        <button onClick={() => { setSuccess(false); setForm(INITIAL_FORM) }}
          className="mt-6 text-sm text-red-600 hover:underline">
          Submit another shift
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>
      )}

      {/* Shift type */}
      <Section title="Shift Info">
        {availableShifts.length === 0 ? (
          <p className="text-sm text-gray-500">All shifts have been submitted for today.</p>
        ) : (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">Shift Type *</label>
            <div className="flex gap-2">
              {availableShifts.map(type => (
                <button key={type} type="button" onClick={() => set('shift_type', type)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border capitalize transition-colors ${
                    form.shift_type === type
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                  }`}>
                  {type}
                </button>
              ))}
            </div>
            {alreadySubmitted.length > 0 && (
              <p className="text-xs text-gray-400 mt-2">Already submitted: {alreadySubmitted.join(', ')}</p>
            )}
          </div>
        )}
      </Section>

      {form.shift_type && availableShifts.length > 0 && (
        <>
          {/* Drawer */}
          <Section title="Drawer Count">
            <div className="grid grid-cols-2 gap-3">
              <MoneyInput label="Starting Drawer" value={form.drawer_start} onChange={v => set('drawer_start', v)} />
              <MoneyInput label="Cash Collected" value={form.cash_collected} onChange={v => set('cash_collected', v)} />
              <MoneyInput label="Credit / Check Collected" value={form.credit_collected} onChange={v => set('credit_collected', v)} />
              <MoneyInput label="Ending Drawer (counted)" value={form.drawer_end} onChange={v => set('drawer_end', v)} />
            </div>
            {form.drawer_end !== '' && (
              <div className={`flex items-center gap-2 p-3 rounded-lg text-sm font-medium ${hasVarianceAlert ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                {hasVarianceAlert && <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
                Variance: {variance >= 0 ? '+' : ''}${variance.toFixed(2)}
                {hasVarianceAlert ? ' — over threshold, double-check your count.' : ' ✓'}
              </div>
            )}
          </Section>

          {/* Lead Generation */}
          <Section title="Lead Generation">
            <div className="grid grid-cols-3 gap-3">
              <NumberInput label="Phone Calls" value={form.phone_calls} onChange={v => set('phone_calls', v)} goal={50} />
              <NumberInput label="SMS Sent" value={form.sms_sent} onChange={v => set('sms_sent', v)} goal={50} />
              <NumberInput label="Red Appt Scheduled" value={form.red_appt_scheduled} onChange={v => set('red_appt_scheduled', v)} goal={5} />
            </div>
            <div className="pt-1 space-y-2.5">
              <CheckRow label="Notes added to all missed guests" checked={form.notes_added_missed} onChange={v => set('notes_added_missed', v)} />
              <CheckRow label="Followed up with all missed guests from yesterday" checked={form.followed_up_missed} onChange={v => set('followed_up_missed', v)} />
              <CheckRow label="Survey sent to tomorrow's red appointments" checked={form.survey_sent_red_appts} onChange={v => set('survey_sent_red_appts', v)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea rows={2} value={form.leads_notes} onChange={e => set('leads_notes', e.target.value)}
                placeholder="Any lead follow-up context…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600 resize-none" />
            </div>
          </Section>

          {/* Sales */}
          <Section title="Sales">
            <div className="grid grid-cols-3 gap-3">
              <NumberInput label="Sweat Basic" value={form.sweat_basic} onChange={v => set('sweat_basic', v)} />
              <NumberInput label="Sweat Elite" value={form.sweat_elite} onChange={v => set('sweat_elite', v)} />
              <NumberInput label="Cancellations" value={form.cancellations_count} onChange={v => set('cancellations_count', v)} />
            </div>
            {(parseInt(form.cancellations_count) > 0) && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Cancellation names / reasons</label>
                <textarea rows={2} value={form.cancellations_notes} onChange={e => set('cancellations_notes', e.target.value)}
                  placeholder="Who cancelled and why?"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600 resize-none" />
              </div>
            )}
            <MoneyInput label="Retail Sales" value={form.retail_amount} onChange={v => set('retail_amount', v)} />
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea rows={2} value={form.sales_notes} onChange={e => set('sales_notes', e.target.value)}
                placeholder="Any sales context?"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600 resize-none" />
            </div>
          </Section>

          {/* Membership Engagement */}
          <Section
            title="Membership Engagement"
            badge={
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${engGoalMet ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {engCount} / {ENGAGEMENT_ITEMS.length} — Goal: {ENG_GOAL}
              </span>
            }
          >
            <div className="space-y-2.5">
              {ENGAGEMENT_ITEMS.map(item => (
                <CheckRow key={item.key} label={item.label} checked={form[item.key]} onChange={v => set(item.key, v)} />
              ))}
            </div>
          </Section>

          {/* Sales Training */}
          <Section title="Sales Training">
            <CheckRow label="Watched sales training video" checked={form.watched_training_video} onChange={v => set('watched_training_video', v)} href={import.meta.env.VITE_SALES_VIDEO_URL} />
            <CheckRow label="Role played / practiced script" checked={form.role_played_script} onChange={v => set('role_played_script', v)} />
            <CheckRow label="Practiced with Sales GPT" checked={form.used_sales_gpt} onChange={v => set('used_sales_gpt', v)} href={import.meta.env.VITE_SALES_GPT_URL} />
          </Section>

          {/* Orders & Notes */}
          <Section title="Orders & Notes">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Items to Order <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea rows={2} value={form.orders_needed} onChange={e => set('orders_needed', e.target.value)}
                placeholder="List anything that needs to be ordered or restocked…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600 resize-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">General Notes <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea rows={3} value={form.general_notes} onChange={e => set('general_notes', e.target.value)}
                placeholder="Anything the manager or owner should know…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600 resize-none" />
            </div>
          </Section>

          <button type="submit" disabled={saving}
            className="w-full bg-red-600 text-white font-semibold py-3 rounded-xl hover:bg-red-600-hover transition-colors disabled:opacity-60 text-sm">
            {saving ? 'Submitting…' : `Submit ${form.shift_type === 'mid' ? 'Mid' : 'Closing'} Shift EOD`}
          </button>
        </>
      )}
    </form>
  )
}
