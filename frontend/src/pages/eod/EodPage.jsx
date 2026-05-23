import { useState, useEffect, useCallback } from 'react'
import { useRole } from '@/hooks/useRole'
import { apiGet } from '@/hooks/useApi'
import EodForm from './EodForm'
import EodHistory from './EodHistory'

function todayLocal() {
  return new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local time
}

export default function EodPage() {
  const { isOwnerOrManager } = useRole()
  const [tab, setTab] = useState('submit')
  const [submittedShifts, setSubmittedShifts] = useState([])
  const [selectedDate, setSelectedDate] = useState(todayLocal())

  const loadMyShifts = useCallback(async () => {
    try {
      const data = await apiGet(`/api/eod/mine?date=${todayLocal()}`)
      setSubmittedShifts(data)
    } catch {
      // non-critical — form will still show all options
    }
  }, [])

  useEffect(() => { loadMyShifts() }, [loadMyShifts])

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">EOD Checkout</h1>
        <p className="text-sm text-gray-500 mt-0.5">Submit your end-of-shift report for today.</p>
      </div>

      {isOwnerOrManager && (
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          <TabButton active={tab === 'submit'} onClick={() => setTab('submit')}>Submit EOD</TabButton>
          <TabButton active={tab === 'history'} onClick={() => setTab('history')}>View Submissions</TabButton>
        </div>
      )}

      {tab === 'submit' ? (
        <EodForm
          submittedShifts={submittedShifts}
          onSubmitted={loadMyShifts}
        />
      ) : (
        <EodHistory
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
        />
      )}
    </div>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? 'border-red-600 text-red-600'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  )
}
