import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost, apiPut, apiDelete } from '@/hooks/useApi'
import { useStudio } from '@/contexts/StudioContext'
import { useRole } from '@/hooks/useRole'
import { Gift, Plus, X, Loader2, Search, Trash2, Phone, MessageSquare, Mail, AtSign, DollarSign, Clock, Store, Calendar, CalendarPlus, Users, Download } from 'lucide-react'

// ── Vocab ───────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { value: 'protein_bar', label: 'Protein bar' }, { value: 'electrolyte', label: 'Electrolyte' },
  { value: 'energy_drink', label: 'Energy drink' }, { value: 'protein_shake', label: 'Protein shake' },
  { value: 'snack', label: 'Snack' }, { value: 'recovery', label: 'Recovery' }, { value: 'other', label: 'Other' },
]
const STAGES = [
  { value: 'prospect', label: 'Prospect', cls: 'bg-gray-100 text-gray-600' },
  { value: 'contacted', label: 'Contacted', cls: 'bg-sky-100 text-sky-700' },
  { value: 'talking', label: 'Talking', cls: 'bg-indigo-100 text-indigo-700' },
  { value: 'committed', label: 'Committed', cls: 'bg-amber-100 text-amber-700' },
  { value: 'received', label: 'Received', cls: 'bg-emerald-100 text-emerald-700' },
  { value: 'partner', label: 'Partner', cls: 'bg-green-600 text-white' },
  { value: 'dormant', label: 'Dormant', cls: 'bg-stone-100 text-stone-500' },
  { value: 'passed', label: 'Passed', cls: 'bg-red-100 text-red-500' },
]
const ASK_LEVELS = [
  { value: 'none', label: 'No ask yet' }, { value: 'product', label: 'Product' },
  { value: 'attend', label: 'Attend event' }, { value: 'ongoing', label: 'Ongoing' }, { value: 'paid', label: 'Paid sponsor' },
]
const CONTACT_TYPES = [
  { value: 'unknown', label: 'Unknown' }, { value: 'corporate', label: 'Corporate' },
  { value: 'distributor', label: 'Distributor' }, { value: 'local_rep', label: 'Local rep' },
]
const CHANNELS = [
  { value: 'email', label: 'Email' }, { value: 'web_form', label: 'Web form' }, { value: 'instagram_dm', label: 'Instagram DM' },
  { value: 'phone', label: 'Phone' }, { value: 'in_person', label: 'In person' }, { value: 'linkedin', label: 'LinkedIn' },
]
const USED_FOR = [
  { value: '', label: '—' }, { value: 'event', label: 'Event' }, { value: 'member_swag', label: 'Member swag' },
  { value: 'retail_test', label: 'Retail test' }, { value: 'staff', label: 'Staff' }, { value: 'prize_bundle', label: 'Prize bundle' },
]
const ORDER_SOURCES = [
  { value: '', label: '—' }, { value: 'direct', label: 'Direct' }, { value: 'distributor', label: 'Distributor' },
  { value: 'retail', label: 'Retail' }, { value: 'club', label: 'Club' },
]
const EVENT_ROLES = [
  { value: 'hour_sponsor', label: 'Hour sponsor' }, { value: 'product_donation', label: 'Product donation' },
  { value: 'prize_bundle', label: 'Prize bundle' }, { value: 'giveaway', label: 'Giveaway' }, { value: 'paid_sponsor', label: 'Paid sponsor' },
]
const EB_STATUS = [
  { value: 'asked', label: 'Asked', cls: 'bg-gray-100 text-gray-600' },
  { value: 'confirmed', label: 'Confirmed', cls: 'bg-emerald-100 text-emerald-700' },
  { value: 'delivered', label: 'Delivered', cls: 'bg-green-600 text-white' },
  { value: 'no_show', label: 'No-show', cls: 'bg-red-100 text-red-600' },
  { value: 'declined', label: 'Declined', cls: 'bg-red-100 text-red-500' },
]
const labelOf = (arr, v) => arr.find(x => x.value === v)?.label || v || '—'
const stageMeta = (v) => STAGES.find(s => s.value === v) || STAGES[0]
const fmt$ = (n) => `$${(Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
const fmtDate = (s) => s ? new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const todayCA = () => new Date().toLocaleDateString('en-CA')
const daysSince = (s) => s ? Math.round((new Date(todayCA()) - new Date(s + 'T00:00:00')) / 86400000) : null
const plusDays = (n) => { const d = new Date(todayCA() + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const isOverdue = (b) => b.next_action_at && b.next_action_at < todayCA() && b.stage !== 'passed'

// CSV export (Phase 4) — client-side, no backend.
function downloadBrandsCsv(rows) {
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const cols = [
    ['Brand', b => b.name], ['Category', b => labelOf(CATEGORIES, b.category)], ['Stage', b => labelOf(STAGES, b.stage)],
    ['Ask level', b => labelOf(ASK_LEVELS, b.ask_level)], ['Decision-maker', b => labelOf(CONTACT_TYPES, b.contact_type)],
    ['Owner', b => b.owner_name || ''], ['Contact', b => b.contact_name || ''], ['Email', b => b.email || ''], ['Phone', b => b.phone || ''],
    ['Last touch', b => b.last_touch_on || ''], ['Last sample', b => b.last_sample_on || ''], ['Last order', b => b.last_order_on || ''],
    ['Total spend', b => b.total_spend || 0], ['Donated value', b => b.donated_value || 0], ['Orders', b => b.order_count || 0],
    ['Events', b => b.event_count || 0], ['Next action', b => b.next_action_at || ''], ['Notes', b => b.notes || ''],
  ]
  const csv = [cols.map(c => esc(c[0])).join(','), ...rows.map(r => cols.map(c => esc(c[1](r))).join(','))].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a'); a.href = url; a.download = `sponsor-brands-${todayCA()}.csv`
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}

const inp = 'w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400'
const lbl = 'block text-[11px] font-semibold text-gray-500 mb-1'

function BrandLogo({ domain, name, size = 40 }) {
  const [err, setErr] = useState(false)
  if (domain && !err) return <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=128`} alt="" onError={() => setErr(true)} style={{ width: size, height: size }} className="rounded-lg object-contain bg-white border border-gray-100 flex-shrink-0" />
  return <div style={{ width: size, height: size }} className="rounded-lg bg-gray-100 text-gray-400 font-black flex items-center justify-center flex-shrink-0">{(name || '?').trim().charAt(0).toUpperCase()}</div>
}

function Stat({ label, value, sub, accent }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex-1 min-w-[130px]">
      <div className={`text-2xl font-black ${accent || 'text-gray-900'}`}>{value}</div>
      <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mt-0.5">{label}</div>
      {sub ? <div className="text-[11px] text-gray-400">{sub}</div> : null}
    </div>
  )
}

function ContactIcons({ b }) {
  return (
    <span className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
      {b.phone && <a href={`tel:${b.phone}`} title={`Call ${b.phone}`} className="text-gray-400 hover:text-red-600"><Phone size={14} /></a>}
      {b.phone && <a href={`sms:${b.phone}`} title={`Text ${b.phone}`} className="text-gray-400 hover:text-red-600"><MessageSquare size={14} /></a>}
      {b.email && <a href={`mailto:${b.email}`} title={b.email} className="text-gray-400 hover:text-red-600"><Mail size={14} /></a>}
      {b.social_handle && <a href={`https://instagram.com/${String(b.social_handle).replace(/^@/, '')}`} target="_blank" rel="noreferrer" title={b.social_handle} className="text-gray-400 hover:text-red-600"><AtSign size={14} /></a>}
    </span>
  )
}

function BrandCard({ b, onOpen }) {
  const overdue = isOverdue(b)
  const st = stageMeta(b.stage)
  const buys = Number(b.total_spend) > 0
  return (
    <button onClick={() => onOpen(b)}
      className={`text-left bg-white rounded-xl border p-4 hover:shadow-md transition-shadow ${overdue ? 'border-red-300 ring-1 ring-red-200' : 'border-gray-200'}`}>
      <div className="flex items-start gap-3">
        <BrandLogo domain={b.domain} name={b.name} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-gray-900 truncate">{b.name}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">{labelOf(CATEGORIES, b.category)} · {labelOf(CONTACT_TYPES, b.contact_type)}</div>
        </div>
        <ContactIcons b={b} />
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3 text-[11px]">
        <div><div className="text-gray-400">Last sample</div><div className="font-semibold text-gray-700">{fmtDate(b.last_sample_on)}</div></div>
        <div><div className="text-gray-400">Last order</div><div className="font-semibold text-gray-700">{fmtDate(b.last_order_on)}</div></div>
        <div><div className="text-gray-400">Last touch</div><div className="font-semibold text-gray-700">{b.last_touch_on ? `${daysSince(b.last_touch_on)}d ago` : '—'}</div></div>
      </div>
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100 text-[11px]">
        <span className="text-gray-400">{b.owner_name ? `👤 ${b.owner_name}` : 'Unassigned'}</span>
        <span className={overdue ? 'font-bold text-red-600' : 'text-gray-500'}>
          {b.stage === 'dormant' ? 'Re-ask' : 'Next'}: {fmtDate(b.next_action_at)}
        </span>
      </div>
      {buys && (
        <div className="mt-2 text-[11px] font-semibold text-amber-700 bg-amber-50 rounded-lg px-2 py-1">
          💰 We've spent {fmt$(b.total_spend)} here · they've given {fmt$(b.donated_value)}
        </div>
      )}
    </button>
  )
}

// ── Detail slide-over ─────────────────────────────────────────────────────────
function TimelineRow({ children, onDelete }) {
  return (
    <div className="flex items-start gap-2 py-2 border-b border-gray-50 last:border-0">
      <div className="flex-1 min-w-0 text-sm">{children}</div>
      {onDelete && <button onClick={onDelete} className="text-gray-300 hover:text-red-500 p-0.5 flex-shrink-0"><Trash2 size={13} /></button>}
    </div>
  )
}

function BrandDrawer({ brandId, users, onClose, onChanged }) {
  const [d, setD] = useState(null)
  const [tab, setTab] = useState('details')
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const load = useCallback(() => {
    apiGet(`/api/sponsors/brands/${brandId}`).then(res => { setD(res); setForm(res.brand) }).catch(() => setD(null))
  }, [brandId])
  useEffect(() => { load() }, [load])
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const saveDetails = async () => {
    setSaving(true)
    try { await apiPut(`/api/sponsors/brands/${brandId}`, form); onChanged(); load() } catch { /* ignore */ }
    setSaving(false)
  }
  const addChild = async (seg, body, reset) => {
    try { await apiPost(`/api/sponsors/brands/${brandId}/${seg}`, body); reset(); onChanged(); load() } catch { /* ignore */ }
  }
  const delChild = async (seg, id) => { try { await apiDelete(`/api/sponsors/${seg}/${id}`); onChanged(); load() } catch { /* ignore */ } }

  const b = d?.brand
  const buys = b && Number(b.total_spend) > 0

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg bg-gray-50 h-full overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
        {!d ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-red-500" /></div> : (<>
          <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center gap-3 z-10">
            <BrandLogo domain={b.domain} name={b.name} size={36} />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-gray-900 truncate">{b.name}</div>
              <div className="text-[11px] text-gray-400">{labelOf(CATEGORIES, b.category)} · {labelOf(STAGES, b.stage)}</div>
            </div>
            <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
          </div>

          {buys && (
            <div className="mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-[13px] text-amber-800">
              <b>You're a customer here</b> — {fmt$(b.total_spend)} across {b.order_count} order{b.order_count === 1 ? '' : 's'}. Lead the ask with that, not a cold intro.
            </div>
          )}

          <div className="flex gap-1 px-4 pt-4 border-b border-gray-200 bg-gray-50 sticky top-[65px] z-10">
            {[['details', 'Details'], ['samples', `Samples${d.samples.length ? ` (${d.samples.length})` : ''}`], ['orders', `Orders${d.orders.length ? ` (${d.orders.length})` : ''}`], ['outreach', `Outreach${d.touches.length ? ` (${d.touches.length})` : ''}`]].map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px ${tab === k ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500'}`}>{label}</button>
            ))}
          </div>

          <div className="p-4">
            {tab === 'details' && form && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className={lbl}>Name</label><input className={inp} value={form.name || ''} onChange={e => set('name', e.target.value)} /></div>
                  <div><label className={lbl}>Website domain</label><input className={inp} value={form.domain || ''} onChange={e => set('domain', e.target.value)} placeholder="barebells.com" /></div>
                  <div><label className={lbl}>Category</label><select className={inp} value={form.category} onChange={e => set('category', e.target.value)}>{CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
                  <div><label className={lbl}>Decision-maker</label><select className={inp} value={form.contact_type} onChange={e => set('contact_type', e.target.value)}>{CONTACT_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
                  <div><label className={lbl}>Stage</label><select className={inp} value={form.stage} onChange={e => set('stage', e.target.value)}>{STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
                  <div><label className={lbl}>Biggest yes</label><select className={inp} value={form.ask_level} onChange={e => set('ask_level', e.target.value)}>{ASK_LEVELS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}</select></div>
                  <div><label className={lbl}>Owner</label><select className={inp} value={form.owner_user_id || ''} onChange={e => set('owner_user_id', e.target.value)}><option value="">Unassigned</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
                  <div><label className={lbl}>{form.stage === 'dormant' ? 'Re-ask date' : 'Next action'}</label><input type="date" className={inp} value={form.next_action_at || ''} onChange={e => set('next_action_at', e.target.value)} /></div>
                  <div><label className={lbl}>Contact name</label><input className={inp} value={form.contact_name || ''} onChange={e => set('contact_name', e.target.value)} /></div>
                  <div><label className={lbl}>Contact title</label><input className={inp} value={form.contact_title || ''} onChange={e => set('contact_title', e.target.value)} /></div>
                  <div><label className={lbl}>Email</label><input className={inp} value={form.email || ''} onChange={e => set('email', e.target.value)} /></div>
                  <div><label className={lbl}>Phone</label><input className={inp} value={form.phone || ''} onChange={e => set('phone', e.target.value)} /></div>
                  <div className="col-span-2"><label className={lbl}>Social handle</label><input className={inp} value={form.social_handle || ''} onChange={e => set('social_handle', e.target.value)} placeholder="@brand" /></div>
                </div>
                <div><label className={lbl}>Notes</label><textarea className={inp} rows={3} value={form.notes || ''} onChange={e => set('notes', e.target.value)} /></div>
                <button onClick={saveDetails} disabled={saving} className="w-full bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg py-2 disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving && <Loader2 size={14} className="animate-spin" />} Save changes
                </button>
                {d.events.length > 0 && (
                  <div className="pt-2">
                    <div className={lbl}>Events supported</div>
                    {d.events.map(e => <div key={e.id} className="text-[13px] text-gray-600 py-1 border-b border-gray-50 last:border-0">{e.name} · {fmtDate(e.event_date)} · {e.role} · {e.status}</div>)}
                  </div>
                )}
              </div>
            )}

            {tab === 'samples' && <SampleTab d={d} onAdd={(body, reset) => addChild('samples', body, reset)} onDel={(id) => delChild('samples', id)} />}
            {tab === 'orders' && <OrderTab d={d} onAdd={(body, reset) => addChild('orders', body, reset)} onDel={(id) => delChild('orders', id)} />}
            {tab === 'outreach' && <OutreachTab d={d} onAdd={(body, reset) => addChild('touches', body, reset)} onDel={(id) => delChild('touches', id)} />}
          </div>
        </>)}
      </div>
    </div>
  )
}

function SampleTab({ d, onAdd, onDel }) {
  const blank = { item: '', quantity: '', retail_value: '', used_for: '', received_on: todayCA(), note: '' }
  const [f, setF] = useState(blank)
  return (<div className="space-y-3">
    <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input className={inp} placeholder="Item *" value={f.item} onChange={e => setF({ ...f, item: e.target.value })} />
        <input type="date" className={inp} value={f.received_on} onChange={e => setF({ ...f, received_on: e.target.value })} />
        <input type="number" className={inp} placeholder="Qty" value={f.quantity} onChange={e => setF({ ...f, quantity: e.target.value })} />
        <input type="number" className={inp} placeholder="Retail value $" value={f.retail_value} onChange={e => setF({ ...f, retail_value: e.target.value })} />
        <select className={inp} value={f.used_for} onChange={e => setF({ ...f, used_for: e.target.value })}>{USED_FOR.map(u => <option key={u.value} value={u.value}>{u.label || 'Used for…'}</option>)}</select>
      </div>
      <input className={inp} placeholder="Note (optional)" value={f.note} onChange={e => setF({ ...f, note: e.target.value })} />
      <button disabled={!f.item} onClick={() => onAdd(f, () => setF(blank))} className="w-full bg-gray-800 hover:bg-black text-white text-sm font-semibold rounded-lg py-2 disabled:opacity-40 flex items-center justify-center gap-1.5"><Plus size={14} /> Log sample received</button>
    </div>
    {d.samples.map(s => (
      <TimelineRow key={s.id} onDelete={() => onDel(s.id)}>
        <div className="font-semibold text-gray-800">{s.item} {s.quantity ? <span className="text-gray-400 font-normal">×{s.quantity}</span> : null} {s.retail_value ? <span className="text-emerald-600 font-normal">· {fmt$(s.retail_value)}</span> : null}</div>
        <div className="text-[11px] text-gray-400">{fmtDate(s.received_on)}{s.used_for ? ` · ${labelOf(USED_FOR, s.used_for)}` : ''}{s.note ? ` · ${s.note}` : ''}</div>
      </TimelineRow>
    ))}
  </div>)
}

function OrderTab({ d, onAdd, onDel }) {
  const blank = { item: '', quantity: '', cost: '', source: '', ordered_on: todayCA(), external_ref: '', note: '' }
  const [f, setF] = useState(blank)
  return (<div className="space-y-3">
    <div className="flex gap-2 text-[11px]">
      <div className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2"><div className="text-gray-400">Total spend</div><div className="font-black text-gray-900 text-base">{fmt$(d.brand.total_spend)}</div></div>
      <div className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2"><div className="text-gray-400">Orders</div><div className="font-black text-gray-900 text-base">{d.brand.order_count}</div></div>
      <div className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2"><div className="text-gray-400">Avg gap</div><div className="font-black text-gray-900 text-base">{d.reorder_cadence_days != null ? `${d.reorder_cadence_days}d` : '—'}</div></div>
    </div>
    <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input className={inp} placeholder="Item *" value={f.item} onChange={e => setF({ ...f, item: e.target.value })} />
        <input type="date" className={inp} value={f.ordered_on} onChange={e => setF({ ...f, ordered_on: e.target.value })} />
        <input type="number" className={inp} placeholder="Qty" value={f.quantity} onChange={e => setF({ ...f, quantity: e.target.value })} />
        <input type="number" className={inp} placeholder="Cost $" value={f.cost} onChange={e => setF({ ...f, cost: e.target.value })} />
        <select className={inp} value={f.source} onChange={e => setF({ ...f, source: e.target.value })}>{ORDER_SOURCES.map(u => <option key={u.value} value={u.value}>{u.label || 'Source…'}</option>)}</select>
      </div>
      <input className={inp} placeholder="Note (optional)" value={f.note} onChange={e => setF({ ...f, note: e.target.value })} />
      <button disabled={!f.item} onClick={() => onAdd(f, () => setF(blank))} className="w-full bg-gray-800 hover:bg-black text-white text-sm font-semibold rounded-lg py-2 disabled:opacity-40 flex items-center justify-center gap-1.5"><Plus size={14} /> Log a purchase</button>
    </div>
    {d.orders.map(o => (
      <TimelineRow key={o.id} onDelete={() => onDel(o.id)}>
        <div className="font-semibold text-gray-800">{o.item} {o.quantity ? <span className="text-gray-400 font-normal">×{o.quantity}</span> : null} {o.cost ? <span className="text-amber-600 font-normal">· {fmt$(o.cost)}</span> : null}</div>
        <div className="text-[11px] text-gray-400">{fmtDate(o.ordered_on)}{o.studio_name ? ` · ${o.studio_name}` : ''}{o.source ? ` · ${labelOf(ORDER_SOURCES, o.source)}` : ''}{o.note ? ` · ${o.note}` : ''}</div>
      </TimelineRow>
    ))}
    {(d.ops_orders || []).length > 0 && (<>
      <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide pt-3 pb-1">From the Orders module <span className="font-normal normal-case text-gray-300">· matched by vendor name</span></div>
      {d.ops_orders.map(o => (
        <div key={o.id} className="flex items-start gap-2 py-2 border-b border-gray-50 last:border-0 text-sm">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-800">{o.item_name}{o.quantity ? <span className="text-gray-400 font-normal"> ×{o.quantity}</span> : null}{o.est_cost ? <span className="text-amber-600 font-normal"> · {fmt$(o.est_cost)}</span> : null}</div>
            <div className="text-[11px] text-gray-400">{fmtDate(o.ordered_on)}{o.studio_name ? ` · ${o.studio_name}` : ''}{o.status ? ` · ${o.status}` : ''}{o.category ? ` · ${o.category}` : ''}</div>
          </div>
          <span className="text-[10px] font-bold text-sky-600 bg-sky-50 rounded px-1.5 py-0.5 flex-shrink-0">Orders</span>
        </div>
      ))}
      <p className="text-[11px] text-gray-400 pt-1">Pulled from your Orders module. Only ordered/received count toward spend.</p>
    </>)}
  </div>)
}

function OutreachTab({ d, onAdd, onDel }) {
  const blank = { channel: 'email', occurred_on: todayCA(), note: '' }
  const [f, setF] = useState(blank)
  return (<div className="space-y-3">
    <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <select className={inp} value={f.channel} onChange={e => setF({ ...f, channel: e.target.value })}>{CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
        <input type="date" className={inp} value={f.occurred_on} onChange={e => setF({ ...f, occurred_on: e.target.value })} />
      </div>
      <input className={inp} placeholder="What did you say / ask? (optional)" value={f.note} onChange={e => setF({ ...f, note: e.target.value })} />
      <button onClick={() => onAdd(f, () => setF(blank))} className="w-full bg-gray-800 hover:bg-black text-white text-sm font-semibold rounded-lg py-2 flex items-center justify-center gap-1.5"><Plus size={14} /> Log outreach</button>
    </div>
    {d.touches.map(t => (
      <TimelineRow key={t.id} onDelete={() => onDel(t.id)}>
        <div className="font-semibold text-gray-800">{labelOf(CHANNELS, t.channel)}{t.by_name ? <span className="text-gray-400 font-normal"> · {t.by_name}</span> : null}</div>
        <div className="text-[11px] text-gray-400">{fmtDate(t.occurred_on)}{t.note ? ` · ${t.note}` : ''}</div>
      </TimelineRow>
    ))}
  </div>)
}

function NewBrandModal({ users, onClose, onCreated }) {
  const [f, setF] = useState({ name: '', domain: '', category: 'other', contact_type: 'unknown', owner_user_id: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const save = async () => {
    if (!f.name.trim()) return
    setSaving(true); setErr('')
    try { const b = await apiPost('/api/sponsors/brands', f); onCreated(b) } catch (e) { setErr(e?.message || 'Could not add brand'); setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100"><h3 className="font-bold text-gray-900">Add a brand</h3><button onClick={onClose}><X size={18} className="text-gray-400" /></button></div>
        <div className="p-4 space-y-3">
          <div><label className={lbl}>Brand name *</label><input className={inp} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Barebells" autoFocus /></div>
          <div><label className={lbl}>Website domain</label><input className={inp} value={f.domain} onChange={e => setF({ ...f, domain: e.target.value })} placeholder="barebells.com" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>Category</label><select className={inp} value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>{CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
            <div><label className={lbl}>Decision-maker</label><select className={inp} value={f.contact_type} onChange={e => setF({ ...f, contact_type: e.target.value })}>{CONTACT_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
          </div>
          <div><label className={lbl}>Owner</label><select className={inp} value={f.owner_user_id} onChange={e => setF({ ...f, owner_user_id: e.target.value })}><option value="">Unassigned</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="text-sm font-semibold text-gray-500 px-3 py-2">Cancel</button>
          <button onClick={save} disabled={!f.name.trim() || saving} className="bg-red-600 text-white text-sm font-bold rounded-lg px-4 py-2 disabled:opacity-40 flex items-center gap-1.5">{saving && <Loader2 size={14} className="animate-spin" />} Add brand</button>
        </div>
      </div>
    </div>
  )
}

// ── Events (Phase 2) ──────────────────────────────────────────────────────────
function EventBrandPicker({ brands, existing, onClose, onAdd }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState('')
  const [role, setRole] = useState('product_donation')
  const [slot, setSlot] = useState('')
  const [item, setItem] = useState('')
  const [saving, setSaving] = useState(false)
  const taken = new Set(existing.map(e => `${e.brand_id}:${e.role}`))
  const list = brands.filter(b => !q || b.name.toLowerCase().includes(q.toLowerCase()))
  const submit = async () => { if (!sel) return; setSaving(true); await onAdd({ brand_id: sel, role, slot, item }); setSaving(false); onClose() }
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100"><h3 className="font-bold text-gray-900">Attach a brand</h3><button onClick={onClose}><X size={18} className="text-gray-400" /></button></div>
        <div className="p-4 space-y-3">
          <div className="relative"><Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search brands…" className={`${inp} pl-8`} /></div>
          <select className={inp} value={sel} onChange={e => setSel(e.target.value)} size={1}>
            <option value="">Choose a brand…</option>
            {list.map(b => <option key={b.id} value={b.id} disabled={taken.has(`${b.id}:${role}`)}>{b.name}{taken.has(`${b.id}:${role}`) ? ' (already added)' : ''}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={lbl}>Role</label><select className={inp} value={role} onChange={e => setRole(e.target.value)}>{EVENT_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
            <div><label className={lbl}>Slot</label><input className={inp} value={slot} onChange={e => setSlot(e.target.value)} placeholder="10–11am" /></div>
          </div>
          <div><label className={lbl}>Item / commitment</label><input className={inp} value={item} onChange={e => setItem(e.target.value)} placeholder="2 cases + prize" /></div>
        </div>
        <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="text-sm font-semibold text-gray-500 px-3 py-2">Cancel</button>
          <button onClick={submit} disabled={!sel || saving} className="bg-red-600 text-white text-sm font-bold rounded-lg px-4 py-2 disabled:opacity-40 flex items-center gap-1.5">{saving && <Loader2 size={14} className="animate-spin" />} Attach</button>
        </div>
      </div>
    </div>
  )
}

function EventDrawer({ eventId, brands, onClose, onChanged }) {
  const [d, setD] = useState(null)
  const [tab, setTab] = useState('brands')
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [picking, setPicking] = useState(false)
  const load = useCallback(() => { apiGet(`/api/sponsors/events/${eventId}`).then(res => { setD(res); setForm(res.event) }).catch(() => setD(null)) }, [eventId])
  useEffect(() => { load() }, [load])
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const saveDetails = async () => { setSaving(true); try { await apiPut(`/api/sponsors/events/${eventId}`, form); onChanged(); load() } catch { /* ignore */ } setSaving(false) }
  const addBrand = async (body) => { try { await apiPost(`/api/sponsors/events/${eventId}/brands`, body); onChanged(); load() } catch { /* ignore */ } }
  const setStatus = async (rowId, status) => { try { await apiPut(`/api/sponsors/event-brands/${rowId}`, { status }); onChanged(); load() } catch { /* ignore */ } }
  const removeBrand = async (rowId) => { try { await apiDelete(`/api/sponsors/event-brands/${rowId}`); onChanged(); load() } catch { /* ignore */ } }
  const unlink = async () => { if (!window.confirm('Unlink from the calendar event? It becomes a standalone sponsor event (brands stay attached).')) return; try { await apiPut(`/api/sponsors/events/${eventId}`, { event_id: null }); onChanged(); load() } catch { /* ignore */ } }
  const e = d?.event
  const linked = e?.linked
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg bg-gray-50 h-full overflow-y-auto shadow-xl" onClick={ev => ev.stopPropagation()}>
        {!d ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-red-500" /></div> : (<>
          <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center gap-3 z-10">
            <div className="flex-1 min-w-0"><div className="font-bold text-gray-900 truncate">{e.name}</div><div className="text-[11px] text-gray-400">{fmtDate(e.event_date)}{e.location ? ` · ${e.location}` : ''}</div></div>
            <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
          </div>
          <div className="flex gap-1 px-4 pt-4 border-b border-gray-200 bg-gray-50">
            {[['brands', `Brands${d.brands.length ? ` (${d.brands.length})` : ''}`], ['details', 'Details']].map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px ${tab === k ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500'}`}>{label}</button>
            ))}
          </div>
          <div className="p-4">
            {tab === 'brands' && (
              <div className="space-y-2">
                <button onClick={() => setPicking(true)} className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-red-600 border border-red-200 rounded-lg py-2 hover:bg-red-50"><Plus size={14} /> Attach a brand</button>
                {d.brands.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">No brands on this event yet.</p>
                  : d.brands.map(r => {
                    const st = EB_STATUS.find(s => s.value === r.status) || EB_STATUS[0]
                    return (
                      <div key={r.id} className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 flex items-center gap-2.5">
                        <BrandLogo domain={r.domain} name={r.name} size={30} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-800 truncate">{r.name}</div>
                          <div className="text-[11px] text-gray-400">{labelOf(EVENT_ROLES, r.role)}{r.slot ? ` · ${r.slot}` : ''}{r.item ? ` · ${r.item}` : ''}</div>
                        </div>
                        <select value={r.status} onChange={ev => setStatus(r.id, ev.target.value)} className={`text-[11px] font-bold rounded-full px-2 py-1 border-0 ${st.cls}`}>
                          {EB_STATUS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                        <button onClick={() => removeBrand(r.id)} className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={14} /></button>
                      </div>
                    )
                  })}
              </div>
            )}
            {tab === 'details' && form && (
              <div className="space-y-3">
                {linked && (
                  <div className="flex items-center gap-2 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2 text-[13px] text-sky-800">
                    <Calendar size={14} /> <span className="flex-1">Linked to calendar event <b>{e.linked_title}</b> — name &amp; date sync from Events &amp; Promos.</span>
                    <button onClick={unlink} className="font-semibold text-sky-700 hover:text-sky-900 whitespace-nowrap">Unlink</button>
                  </div>
                )}
                <div><label className={lbl}>Event name</label><input className={`${inp} ${linked ? 'bg-gray-100 text-gray-500' : ''}`} value={form.name || ''} onChange={ev => set('name', ev.target.value)} disabled={linked} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={lbl}>Date</label><input type="date" className={`${inp} ${linked ? 'bg-gray-100 text-gray-500' : ''}`} value={form.event_date || ''} onChange={ev => set('event_date', ev.target.value)} disabled={linked} /></div>
                  <div><label className={lbl}>Location</label><input className={`${inp} ${linked ? 'bg-gray-100 text-gray-500' : ''}`} value={form.location || ''} onChange={ev => set('location', ev.target.value)} disabled={linked} /></div>
                  <div><label className={lbl}>Type</label><input className={inp} value={form.event_type || ''} onChange={ev => set('event_type', ev.target.value)} placeholder="Pop-up, launch…" /></div>
                  <div><label className={lbl}>Attendance</label><input type="number" className={inp} value={form.attendance ?? ''} onChange={ev => set('attendance', ev.target.value)} /></div>
                  <div><label className={lbl}>Leads collected</label><input type="number" className={inp} value={form.leads_collected ?? ''} onChange={ev => set('leads_collected', ev.target.value)} /></div>
                </div>
                <div><label className={lbl}>Notes</label><textarea className={inp} rows={3} value={form.notes || ''} onChange={ev => set('notes', ev.target.value)} /></div>
                <button onClick={saveDetails} disabled={saving} className="w-full bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg py-2 disabled:opacity-50 flex items-center justify-center gap-2">{saving && <Loader2 size={14} className="animate-spin" />} Save changes</button>
              </div>
            )}
          </div>
          {picking && <EventBrandPicker brands={brands} existing={d.brands} onClose={() => setPicking(false)} onAdd={addBrand} />}
        </>)}
      </div>
    </div>
  )
}

function NewEventModal({ onClose, onCreated }) {
  const [mode, setMode] = useState('link') // 'link' existing calendar event | 'standalone'
  const [f, setF] = useState({ name: '', event_date: '', location: '' })
  const [linkable, setLinkable] = useState(null)
  const [eventId, setEventId] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { apiGet('/api/sponsors/linkable-events').then(setLinkable).catch(() => setLinkable([])) }, [])
  const canSave = mode === 'link' ? !!eventId : (f.name.trim() && f.event_date)
  const save = async () => {
    if (!canSave) return
    setSaving(true)
    try { const e = await apiPost('/api/sponsors/events', mode === 'link' ? { event_id: eventId } : f); onCreated(e) } catch { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100"><h3 className="font-bold text-gray-900">New event</h3><button onClick={onClose}><X size={18} className="text-gray-400" /></button></div>
        <div className="p-4 space-y-3">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-semibold">
            <button onClick={() => setMode('link')} className={`flex-1 py-1.5 ${mode === 'link' ? 'bg-red-600 text-white' : 'text-gray-500'}`}>Link a calendar event</button>
            <button onClick={() => setMode('standalone')} className={`flex-1 py-1.5 ${mode === 'standalone' ? 'bg-red-600 text-white' : 'text-gray-500'}`}>Standalone</button>
          </div>
          {mode === 'link' ? (
            <div>
              <label className={lbl}>Studio calendar event</label>
              {linkable === null ? <div className="py-3 text-center"><Loader2 size={16} className="animate-spin mx-auto text-gray-300" /></div>
                : linkable.length === 0 ? <p className="text-[13px] text-gray-400 py-2">No unlinked calendar events for this studio. Create one in Events &amp; Promos, or use Standalone.</p>
                  : (<select className={inp} value={eventId} onChange={e => setEventId(e.target.value)} autoFocus>
                      <option value="">Choose an event…</option>
                      {linkable.map(e => <option key={e.id} value={e.id}>{e.title}{e.start_date ? ` — ${fmtDate(e.start_date)}` : ''}</option>)}
                    </select>)}
              <p className="text-[11px] text-gray-400 mt-1">Name &amp; date stay in sync with the calendar event. Brands attach here.</p>
            </div>
          ) : (<>
            <div><label className={lbl}>Event name *</label><input className={inp} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Brand demo day" autoFocus /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lbl}>Date *</label><input type="date" className={inp} value={f.event_date} onChange={e => setF({ ...f, event_date: e.target.value })} /></div>
              <div><label className={lbl}>Location</label><input className={inp} value={f.location} onChange={e => setF({ ...f, location: e.target.value })} /></div>
            </div>
          </>)}
        </div>
        <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="text-sm font-semibold text-gray-500 px-3 py-2">Cancel</button>
          <button onClick={save} disabled={!canSave || saving} className="bg-red-600 text-white text-sm font-bold rounded-lg px-4 py-2 disabled:opacity-40 flex items-center gap-1.5">{saving && <Loader2 size={14} className="animate-spin" />} {mode === 'link' ? 'Link event' : 'Create'}</button>
        </div>
      </div>
    </div>
  )
}

function EventCard({ e, onOpen }) {
  const past = e.event_date < todayCA()
  return (
    <button onClick={() => onOpen(e)} className="text-left bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-gray-900 truncate flex items-center gap-1.5">{e.name}{e.linked && <Calendar size={12} className="text-sky-500 flex-shrink-0" title="Linked to calendar event" />}</span>
        <span className="text-[11px] font-semibold text-gray-500 flex-shrink-0">{fmtDate(e.event_date)}</span>
      </div>
      {e.location ? <div className="text-[11px] text-gray-400 mt-0.5">{e.location}</div> : null}
      <div className="flex items-center gap-3 mt-3 text-[11px]">
        <span className="text-gray-500"><Users size={12} className="inline align-[-2px] mr-1" />{e.brands_locked}/{e.brands_total} locked</span>
        {e.givebacks_owed > 0 && <span className="font-semibold text-red-600">{e.givebacks_owed} give-back{e.givebacks_owed === 1 ? '' : 's'} owed</span>}
        {past && e.attendance != null && <span className="text-gray-500">· {e.attendance} attended</span>}
        {past && e.leads_collected != null && <span className="text-gray-500">· {e.leads_collected} leads</span>}
      </div>
    </button>
  )
}

function EventsView({ brands }) {
  const [events, setEvents] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [adding, setAdding] = useState(false)
  const load = useCallback(() => { apiGet('/api/sponsors/events').then(e => setEvents(Array.isArray(e) ? e : [])).catch(() => setEvents([])) }, [])
  useEffect(() => { load() }, [load])
  if (!events) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-red-500" size={26} /></div>
  const upcoming = events.filter(e => e.event_date >= todayCA())
  const past = events.filter(e => e.event_date < todayCA()).reverse()
  const nextUp = upcoming[0]
  const daysOut = nextUp ? Math.round((new Date(nextUp.event_date + 'T00:00:00') - new Date(todayCA())) / 86400000) : null
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">Events are studio-specific · brands come from the shared pool.</p>
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-sm font-semibold text-red-600 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50"><CalendarPlus size={15} /> New event</button>
      </div>
      {nextUp && (
        <button onClick={() => setOpenId(nextUp.id)} className="w-full text-left bg-gradient-to-br from-red-50 to-orange-50 border border-red-200 rounded-xl p-5 mb-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-red-500">Next up · {daysOut === 0 ? 'today' : `${daysOut} day${daysOut === 1 ? '' : 's'} out`}</div>
          <div className="text-xl font-black text-gray-900 mt-0.5">{nextUp.name}</div>
          <div className="text-sm text-gray-500">{fmtDate(nextUp.event_date)}{nextUp.location ? ` · ${nextUp.location}` : ''}</div>
          <div className="mt-2 text-[13px] font-semibold text-gray-700">{nextUp.brands_locked}/{nextUp.brands_total} brands locked{nextUp.givebacks_owed > 0 ? ` · ${nextUp.givebacks_owed} give-backs owed` : ''}</div>
        </button>
      )}
      {events.length === 0 ? (
        <div className="text-center py-16"><Calendar className="mx-auto text-gray-300 mb-3" size={30} /><p className="text-sm font-semibold text-gray-700">No events yet.</p><p className="text-xs text-gray-400 mt-1">Create a pop-up or launch day, then attach the brands sponsoring it.</p></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {upcoming.map(e => <EventCard key={e.id} e={e} onOpen={() => setOpenId(e.id)} />)}
          {past.length > 0 && <div className="col-span-full text-[11px] font-bold text-gray-400 uppercase tracking-wide mt-2">Past</div>}
          {past.map(e => <EventCard key={e.id} e={e} onOpen={() => setOpenId(e.id)} />)}
        </div>
      )}
      {openId && <EventDrawer eventId={openId} brands={brands} onClose={() => setOpenId(null)} onChanged={load} />}
      {adding && <NewEventModal onClose={() => setAdding(false)} onCreated={(e) => { setAdding(false); load(); setOpenId(e.id) }} />}
    </div>
  )
}

// ── Mini-CRM: quick "log a follow-up" (records outreach + schedules the next) ──
function QuickTouchModal({ brand, onClose, onSaved }) {
  const [channel, setChannel] = useState('email')
  const [note, setNote] = useState('')
  const [next, setNext] = useState('')
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    try {
      await apiPost(`/api/sponsors/brands/${brand.id}/touches`, { channel, note })
      if (next) await apiPut(`/api/sponsors/brands/${brand.id}`, { next_action_at: next })
      onSaved()
    } catch { setSaving(false) }
  }
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100"><h3 className="font-bold text-gray-900 truncate">Log follow-up · {brand.name}</h3><button onClick={onClose}><X size={18} className="text-gray-400" /></button></div>
        <div className="p-4 space-y-3">
          <div><label className={lbl}>Channel</label><select className={inp} value={channel} onChange={e => setChannel(e.target.value)}>{CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
          <div><label className={lbl}>Note (optional)</label><input className={inp} value={note} onChange={e => setNote(e.target.value)} placeholder="Left a DM about launch day…" autoFocus /></div>
          <div>
            <label className={lbl}>Follow up again</label>
            <div className="flex gap-1.5 flex-wrap mb-1.5">
              {[['+1w', 7], ['+2w', 14], ['+1mo', 30], ['+3mo', 90]].map(([lab, n]) => (
                <button key={lab} onClick={() => setNext(plusDays(n))} className={`text-xs font-semibold rounded-lg px-2 py-1 border ${next === plusDays(n) ? 'bg-red-600 text-white border-red-600' : 'border-gray-300 text-gray-600'}`}>{lab}</button>
              ))}
            </div>
            <input type="date" className={inp} value={next} onChange={e => setNext(e.target.value)} />
          </div>
        </div>
        <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="text-sm font-semibold text-gray-500 px-3 py-2">Cancel</button>
          <button onClick={save} disabled={saving} className="bg-red-600 text-white text-sm font-bold rounded-lg px-4 py-2 disabled:opacity-40 flex items-center gap-1.5">{saving && <Loader2 size={14} className="animate-spin" />} Log it</button>
        </div>
      </div>
    </div>
  )
}

// Who to follow up with, when. Overdue + due-today brands, quick-actionable.
function FollowupsPanel({ brands, onQuick, onSnooze }) {
  const [open, setOpen] = useState(true)
  const today = todayCA()
  const due = brands
    .filter(b => b.next_action_at && b.next_action_at <= today && b.stage !== 'passed')
    .sort((a, b) => (a.next_action_at || '').localeCompare(b.next_action_at || ''))
  if (!due.length) return null
  return (
    <div className="mb-4 bg-amber-50 border border-amber-300 rounded-xl p-4">
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 w-full text-left">
        <Clock size={16} className="text-amber-700" />
        <h3 className="text-sm font-bold text-amber-900 flex-1">{due.length} follow-up{due.length === 1 ? '' : 's'} due</h3>
        <span className="text-xs text-amber-700">{open ? 'hide' : 'show'}</span>
      </button>
      {open && (
        <div className="space-y-1.5 mt-3 max-h-[24rem] overflow-y-auto">
          {due.map(b => {
            const over = b.next_action_at < today
            const od = over ? Math.round((new Date(today) - new Date(b.next_action_at + 'T00:00:00')) / 86400000) : 0
            return (
              <div key={b.id} className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2 flex-wrap">
                <BrandLogo domain={b.domain} name={b.name} size={26} />
                <div className="flex-1 min-w-[120px]">
                  <div className="text-sm font-semibold text-gray-800">{b.name}</div>
                  <div className="text-[11px] text-gray-400">
                    {labelOf(STAGES, b.stage)}{b.last_touch_on ? ` · last touch ${daysSince(b.last_touch_on)}d ago` : ' · never touched'}
                    <span className={`ml-1 font-semibold ${over ? 'text-red-600' : 'text-amber-700'}`}>· {over ? `${od}d overdue` : 'due today'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => onQuick(b)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg"><Phone size={12} /> Log follow-up</button>
                  <button onClick={() => onSnooze(b.id, plusDays(7))} title="Snooze 1 week" className="px-2 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg">+1w</button>
                  <button onClick={() => onSnooze(b.id, plusDays(30))} title="Snooze 1 month" className="px-2 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg">+1mo</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Kanban by stage — drag a card to a new column to change its stage.
function BrandBoard({ brands, onOpen, onStage, onQuick }) {
  const [dragId, setDragId] = useState(null)
  const [overCol, setOverCol] = useState(null)
  const today = todayCA()
  const drop = (stage) => { const id = dragId; setOverCol(null); setDragId(null); if (!id) return; const b = brands.find(x => x.id === id); if (b && b.stage !== stage) onStage(id, stage) }
  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {STAGES.map(s => {
        const items = brands.filter(b => b.stage === s.value)
        const active = overCol === s.value
        return (
          <div key={s.value}
            onDragOver={e => { e.preventDefault(); if (!active) setOverCol(s.value) }}
            onDragLeave={e => { if (e.currentTarget === e.target) setOverCol(c => c === s.value ? null : c) }}
            onDrop={() => drop(s.value)}
            className={`flex-shrink-0 w-64 rounded-xl border flex flex-col max-h-[72vh] ${active ? 'border-red-400 bg-red-50/60' : 'border-gray-200 bg-gray-50'}`}>
            <div className={`flex items-center justify-between px-3 py-2 rounded-t-xl ${s.cls}`}>
              <span className="text-xs font-bold">{s.label}</span>
              <span className="text-xs font-semibold bg-white/70 text-gray-600 rounded-full px-1.5">{items.length}</span>
            </div>
            <div className="p-2 space-y-2 overflow-y-auto">
              {items.map(b => {
                const over = isOverdue(b)
                return (
                  <div key={b.id} draggable onDragStart={() => setDragId(b.id)} onDragEnd={() => { setDragId(null); setOverCol(null) }}
                    onClick={() => onOpen(b.id)}
                    className={`bg-white rounded-lg border p-2.5 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${over ? 'border-red-300' : 'border-gray-200'} ${dragId === b.id ? 'opacity-40' : ''}`}>
                    <div className="flex items-center gap-2">
                      <BrandLogo domain={b.domain} name={b.name} size={26} />
                      <p className="text-sm font-semibold text-gray-900 truncate flex-1">{b.name}</p>
                      <button onClick={e => { e.stopPropagation(); onQuick(b) }} title="Log follow-up" className="flex-shrink-0 p-1 text-gray-300 hover:text-amber-600"><Phone size={13} /></button>
                    </div>
                    <div className="flex items-center justify-between mt-1.5 text-[11px]">
                      <span className="text-gray-400">{b.last_touch_on ? `${daysSince(b.last_touch_on)}d ago` : 'never'}</span>
                      <span className={over ? 'font-bold text-red-600' : 'text-gray-400'}>{b.next_action_at ? fmtDate(b.next_action_at) : '—'}</span>
                    </div>
                    {Number(b.total_spend) > 0 && <div className="text-[10px] font-semibold text-amber-700 mt-1">💰 {fmt$(b.total_spend)} spent</div>}
                  </div>
                )
              })}
              {items.length === 0 && <p className="text-xs text-gray-300 text-center py-6 select-none">Drop here</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function BrandListView({ brands, onOpen, onQuick }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wide">
          <tr>
            <th className="text-left px-4 py-2.5 font-semibold">Brand</th>
            <th className="text-left px-3 py-2.5 font-semibold">Stage</th>
            <th className="text-left px-3 py-2.5 font-semibold">Owner</th>
            <th className="text-left px-3 py-2.5 font-semibold">Last touch</th>
            <th className="text-left px-3 py-2.5 font-semibold">Next action</th>
            <th className="text-right px-3 py-2.5 font-semibold">Spent</th>
            <th className="text-right px-3 py-2.5 font-semibold">Donated</th>
            <th className="px-3 py-2.5"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {brands.map(b => {
            const st = stageMeta(b.stage); const over = isOverdue(b)
            return (
              <tr key={b.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => onOpen(b.id)}>
                <td className="px-4 py-2.5"><div className="flex items-center gap-2"><BrandLogo domain={b.domain} name={b.name} size={26} /><div><div className="font-semibold text-gray-900">{b.name}</div><div className="text-[11px] text-gray-400">{labelOf(CATEGORIES, b.category)}</div></div></div></td>
                <td className="px-3 py-2.5"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span></td>
                <td className="px-3 py-2.5 text-gray-600 text-xs">{b.owner_name || '—'}</td>
                <td className="px-3 py-2.5 text-gray-600 text-xs">{b.last_touch_on ? `${daysSince(b.last_touch_on)}d ago` : '—'}</td>
                <td className={`px-3 py-2.5 text-xs ${over ? 'font-bold text-red-600' : 'text-gray-600'}`}>{fmtDate(b.next_action_at)}</td>
                <td className="px-3 py-2.5 text-right text-gray-700 text-xs">{Number(b.total_spend) > 0 ? fmt$(b.total_spend) : '—'}</td>
                <td className="px-3 py-2.5 text-right text-emerald-700 text-xs">{Number(b.donated_value) > 0 ? fmt$(b.donated_value) : '—'}</td>
                <td className="px-3 py-2.5 text-right" onClick={e => e.stopPropagation()}><button onClick={() => onQuick(b)} title="Log follow-up" className="p-1.5 text-gray-300 hover:text-amber-600"><Phone size={14} /></button></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function SponsorDeskPage() {
  const { currentStudio } = useStudio()
  const { role } = useRole()
  const [brands, setBrands] = useState([])
  const [metrics, setMetrics] = useState(null)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [buysOnly, setBuysOnly] = useState(false)
  const [dueOnly, setDueOnly] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [adding, setAdding] = useState(false)
  const [tab, setTab] = useState('brands')
  const [view, setView] = useState('cards') // 'cards' | 'list' | 'board'
  const [quickFor, setQuickFor] = useState(null)

  const setStage = async (id, stage) => { try { await apiPut(`/api/sponsors/brands/${id}`, { stage }); load() } catch { /* ignore */ } }
  const snooze = async (id, next_action_at) => { try { await apiPut(`/api/sponsors/brands/${id}`, { next_action_at }); load() } catch { /* ignore */ } }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [res, ud] = await Promise.all([apiGet('/api/sponsors/brands'), apiGet('/api/users').catch(() => [])])
      setBrands(res.brands || []); setMetrics(res.metrics || null)
      setUsers((ud || []).filter(u => u.is_active !== false).map(u => ({ id: u.id, name: u.full_name || u.email })))
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [currentStudio?.id])
  useEffect(() => { load() }, [load])

  const today = todayCA()
  const filtered = brands.filter(b =>
    (!cat || b.category === cat) &&
    (!buysOnly || Number(b.total_spend) > 0) &&
    (!dueOnly || (b.next_action_at && b.next_action_at <= today && b.stage !== 'passed')) &&
    (!q || [b.name, b.contact_name, b.category].some(v => String(v || '').toLowerCase().includes(q.toLowerCase()))))
  // Overdue first, then by name.
  const sorted = [...filtered].sort((a, b) => (isOverdue(b) ? 1 : 0) - (isOverdue(a) ? 1 : 0) || (a.name || '').localeCompare(b.name || ''))

  return (
    <div className="max-w-6xl mx-auto pb-10">
      <div className="flex items-center justify-between mb-4 gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5"><Gift size={24} className="text-red-600" /> Sample &amp; Sponsor Desk</h1>
          <p className="text-sm text-gray-500 mt-0.5">Source free product from brands · {currentStudio?.name}</p>
        </div>
        {tab === 'brands' && <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-lg shadow-sm"><Plus size={16} /> Add Brand</button>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {[{ k: 'brands', label: 'Brands', Icon: Store }, { k: 'events', label: 'Events', Icon: Calendar }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px ${tab === t.k ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            <t.Icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'events' ? <EventsView brands={brands} /> : (<>

      {/* Stat strip */}
      {metrics && (
        <div className="flex gap-2 flex-wrap mb-4">
          <Stat label="Success rate" value={`${metrics.success_rate}%`} sub={`${metrics.success_num}/${metrics.success_denom} engaged`} accent="text-green-600" />
          <Stat label="Product in" value={fmt$(metrics.product_in)} accent="text-emerald-600" />
          <Stat label="We've spent" value={fmt$(metrics.we_spent)} accent="text-amber-600" />
          <Stat label="Follow-ups due" value={metrics.followups_due} accent={metrics.followups_due ? 'text-red-600' : 'text-gray-900'} />
          <Stat label="Give-backs owed" value={metrics.givebacks_owed} accent={metrics.givebacks_owed ? 'text-red-600' : 'text-gray-900'} />
        </div>
      )}

      {/* Mini-CRM: who to follow up with, when */}
      <FollowupsPanel brands={brands} onQuick={setQuickFor} onSnooze={snooze} />

      {/* Search + filters */}
      <div className="flex gap-2 flex-wrap items-center mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search brands…" className="text-sm border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 w-52" />
        </div>
        <select className="text-sm border border-gray-300 rounded-lg px-2.5 py-1.5" value={cat} onChange={e => setCat(e.target.value)}>
          <option value="">All categories</option>{CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <button onClick={() => setBuysOnly(v => !v)} className={`flex items-center gap-1.5 text-sm rounded-lg px-2.5 py-1.5 border font-medium ${buysOnly ? 'bg-amber-600 text-white border-amber-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}><DollarSign size={14} /> We buy from them</button>
        <button onClick={() => setDueOnly(v => !v)} className={`flex items-center gap-1.5 text-sm rounded-lg px-2.5 py-1.5 border font-medium ${dueOnly ? 'bg-red-600 text-white border-red-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}><Clock size={14} /> Due now</button>
        {(q || cat || buysOnly || dueOnly) && <span className="text-xs text-gray-400">{filtered.length} of {brands.length}</span>}
        <button onClick={() => downloadBrandsCsv(sorted)} disabled={!sorted.length} title="Export the current list to CSV"
          className="ml-auto flex items-center gap-1.5 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 disabled:opacity-40"><Download size={14} /> CSV</button>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {[['cards', 'Cards'], ['list', 'List'], ['board', 'Board']].map(([v, label]) => (
            <button key={v} onClick={() => setView(v)} className={`px-2.5 py-1.5 text-xs font-semibold ${view === v ? 'bg-red-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>{label}</button>
          ))}
        </div>
      </div>

      {loading ? <div className="flex justify-center py-20"><Loader2 className="animate-spin text-red-500" size={26} /></div>
        : brands.length === 0 ? (
          <div className="text-center py-20">
            <Store className="mx-auto text-gray-300 mb-3" size={30} />
            <p className="text-sm font-semibold text-gray-700">No brands yet.</p>
            <p className="text-xs text-gray-400 mt-1">Add the consumer brands you want free product from — protein bars, drinks, snacks.</p>
          </div>
        ) : sorted.length === 0 ? <p className="text-center text-gray-400 py-16 text-sm">No brands match.</p>
          : view === 'board' ? <BrandBoard brands={sorted} onOpen={setOpenId} onStage={setStage} onQuick={setQuickFor} />
          : view === 'list' ? <BrandListView brands={sorted} onOpen={setOpenId} onQuick={setQuickFor} />
          : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sorted.map(b => <BrandCard key={b.id} b={b} onOpen={() => setOpenId(b.id)} />)}
            </div>
          )}
      </>)}

      {openId && <BrandDrawer brandId={openId} users={users} onClose={() => setOpenId(null)} onChanged={load} />}
      {adding && <NewBrandModal users={users} onClose={() => setAdding(false)} onCreated={(b) => { setAdding(false); load(); setOpenId(b.id) }} />}
      {quickFor && <QuickTouchModal brand={quickFor} onClose={() => setQuickFor(null)} onSaved={() => { setQuickFor(null); load() }} />}
    </div>
  )
}
