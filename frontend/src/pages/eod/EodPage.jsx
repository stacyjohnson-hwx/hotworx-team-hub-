import { useState, useEffect, useCallback } from 'react'
import { useRole } from '@/hooks/useRole'
import { apiGet, apiPost } from '@/hooks/useApi'
import EodForm from './EodForm'
import EodHistory from './EodHistory'

function todayLocal() {
  return new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local time
}

export default function EodPage() {
  const { isOwnerOrManager } = useRole()
  const [tab, setTab] = useState('submit')
  const [submittedShifts, setSubmittedShifts] = useState([])
  const [emailTest, setEmailTest] = useState(null) // null | 'loading' | result

  const runEmailTest = async () => {
    setEmailTest('loading')
    try { setEmailTest(await apiPost('/api/eod/test-email', {})) }
    catch (e) { setEmailTest({ ok: false, message: e.message }) }
  }

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
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">EOD Checkout</h1>
          <p className="text-sm text-gray-500 mt-0.5">Submit your end-of-shift report for today.</p>
        </div>
        {isOwnerOrManager && (
          <button onClick={runEmailTest} disabled={emailTest === 'loading'}
            className="flex-shrink-0 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50 disabled:opacity-50">
            {emailTest === 'loading' ? 'Testing…' : '✉️ Send test email'}
          </button>
        )}
      </div>

      {isOwnerOrManager && emailTest && emailTest !== 'loading' && (
        <div className={`mb-5 rounded-lg px-4 py-3 text-sm border ${emailTest.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
          <p className="font-medium">{emailTest.ok ? '✅ ' : '⚠️ '}{emailTest.message}</p>
          <p className="text-[11px] text-gray-500 mt-1">
            Gmail set: {emailTest.transport === 'gmail' ? 'yes' : 'NO'} · login verified: {String(emailTest.verified)} · recipients: {emailTest.recipients?.join(', ') || 'none'}
          </p>
        </div>
      )}

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
        <EodHistory />
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
