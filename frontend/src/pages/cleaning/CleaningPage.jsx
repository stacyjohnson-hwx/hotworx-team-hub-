import { useState } from 'react'
import { useRole } from '@/hooks/useRole'
import TaskList from './TaskList'
import TaskLibrary from './TaskLibrary'
import CleaningAnalytics from './CleaningAnalytics'

export default function CleaningPage() {
  const { isOwnerOrManager } = useRole()
  const [tab, setTab] = useState('today')

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track cleaning and operations tasks for the studio.</p>
        </div>
      </div>

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <TabButton active={tab === 'today'} onClick={() => setTab('today')}>
          Today's Tasks
        </TabButton>
        <TabButton active={tab === 'analytics'} onClick={() => setTab('analytics')}>
          Analytics
        </TabButton>
        {isOwnerOrManager && (
          <TabButton active={tab === 'library'} onClick={() => setTab('library')}>
            Task Library
          </TabButton>
        )}
      </div>

      {tab === 'today'     && <TaskList />}
      {tab === 'analytics' && <CleaningAnalytics />}
      {tab === 'library'   && <TaskLibrary />}
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
