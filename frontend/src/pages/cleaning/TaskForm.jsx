import { useState } from 'react'
import { X } from 'lucide-react'
import { apiPost, apiPut } from '@/hooks/useApi'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const CATEGORIES = ['Open', 'Close', 'Saunas', 'FX Zone']

const TASK_TYPES = ['Cleaning', 'Operations']

export default function TaskForm({ task, onSaved, onClose }) {
  const isEdit = !!task
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    area: task?.area || '',
    task_type: task?.task_type === 'Marketing' ? 'Cleaning' : (task?.task_type || 'Cleaning'),
    frequency: task?.frequency || 'daily',
    day_of_week: task?.day_of_week ?? 1,
    days_of_week: task?.days_of_week ?? [1, 3, 5],
    day_of_month: task?.day_of_month ?? 1,
    quarterly_dates: task?.quarterly_dates?.join('\n') || '',
    one_off_date: task?.one_off_date || '',
    sort_order: task?.sort_order ?? 0,
  })

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function toggleDay(dayIndex) {
    setForm(prev => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(dayIndex)
        ? prev.days_of_week.filter(d => d !== dayIndex)
        : [...prev.days_of_week, dayIndex],
    }))
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.title.trim()) return setError('Title is required.')
    if (form.frequency === 'specific_days' && form.days_of_week.length === 0) {
      return setError('Pick at least one day of the week.')
    }

    setSaving(true)
    setError(null)

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      area: form.area || null,
      task_type: form.task_type,
      frequency: form.frequency,
      day_of_week: form.frequency === 'weekly' ? Number(form.day_of_week) : null,
      days_of_week: form.frequency === 'specific_days'
        ? [...form.days_of_week].sort((a, b) => a - b)
        : null,
      day_of_month: form.frequency === 'monthly' ? Number(form.day_of_month) : null,
      quarterly_dates: form.frequency === 'quarterly'
        ? form.quarterly_dates.split('\n').map(d => d.trim()).filter(Boolean)
        : null,
      one_off_date: form.frequency === 'one_off' ? form.one_off_date || null : null,
      sort_order: Number(form.sort_order) || 0,
    }

    try {
      let saved
      if (isEdit) {
        saved = await apiPut(`/api/cleaning/tasks/${task.id}`, payload)
      } else {
        saved = await apiPost('/api/cleaning/tasks', payload)
      }
      onSaved(saved, !isEdit)
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {isEdit ? 'Edit Task' : 'Add Task'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Task Name *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. Wipe down sauna benches"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={3}
              placeholder="Add any details, instructions, or notes for this task…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600 resize-none"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Type *</label>
            <div className="flex gap-2">
              {TASK_TYPES.map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => set('task_type', type)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    form.task_type === type
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
            <select
              value={form.area}
              onChange={e => set('area', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600 bg-white"
            >
              <option value="">General (no specific category)</option>
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Frequency */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Frequency *</label>
            <select
              value={form.frequency}
              onChange={e => set('frequency', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600 bg-white"
            >
              <option value="daily">Daily — appears every day</option>
              <option value="specific_days">Specific Days — pick weekdays (e.g. Mon / Wed / Fri)</option>
              <option value="weekly">Weekly — appears on a specific day of the week</option>
              <option value="monthly">Monthly — appears on a specific day of the month</option>
              <option value="quarterly">Quarterly — appears on 4 specific dates per year</option>
              <option value="one_off">One-Off — appears once on a specific date</option>
            </select>
          </div>

          {/* Frequency-specific fields */}
          {form.frequency === 'specific_days' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Days of Week</label>
              <div className="flex gap-1.5">
                {DAYS.map((d, i) => {
                  const on = form.days_of_week.includes(i)
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDay(i)}
                      title={d}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                        on
                          ? 'bg-red-600 text-white border-red-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {d.slice(0, 3)}
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">Appears on the selected days and resets each day.</p>
            </div>
          )}

          {form.frequency === 'weekly' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Day of Week</label>
              <select
                value={form.day_of_week}
                onChange={e => set('day_of_week', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600 bg-white"
              >
                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </div>
          )}

          {form.frequency === 'monthly' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Day of Month</label>
              <input
                type="number"
                min="1"
                max="31"
                value={form.day_of_month}
                onChange={e => set('day_of_month', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600"
              />
            </div>
          )}

          {form.frequency === 'quarterly' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Quarterly Dates (one per line, YYYY-MM-DD)
              </label>
              <textarea
                value={form.quarterly_dates}
                onChange={e => set('quarterly_dates', e.target.value)}
                rows={4}
                placeholder={'2026-03-01\n2026-06-01\n2026-09-01\n2026-12-01'}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600"
              />
            </div>
          )}

          {form.frequency === 'one_off' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={form.one_off_date}
                onChange={e => set('one_off_date', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600"
              />
            </div>
          )}

          {/* Sort order */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Sort Order <span className="text-gray-400 font-normal">(lower = appears first)</span>
            </label>
            <input
              type="number"
              min="0"
              value={form.sort_order}
              onChange={e => set('sort_order', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/40 focus:border-red-600"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-red-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-red-600-hover transition-colors disabled:opacity-60"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
