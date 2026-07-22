import { createContext, useContext, useState } from 'react'
import { currentMonthYear } from '@/lib/utils'

const MonthContext = createContext(null)

export function MonthProvider({ children }) {
  const [selectedMonth, setSelectedMonth] = useState(currentMonthYear)

  const goToPrevMonth = () => {
    setSelectedMonth(prev => {
      if (prev.month === 1) return { month: 12, year: prev.year - 1 }
      return { month: prev.month - 1, year: prev.year }
    })
  }

  const goToNextMonth = () => {
    setSelectedMonth(prev => {
      if (prev.month === 12) return { month: 1, year: prev.year + 1 }
      return { month: prev.month + 1, year: prev.year }
    })
  }

  const goToCurrentMonth = () => setSelectedMonth(currentMonthYear())

  const now = currentMonthYear()
  const isCurrentMonth = selectedMonth.month === now.month && selectedMonth.year === now.year

  // Planning runs ahead of the current month (monthly plans, goals, events), so
  // allow navigating up to a year forward — not just next month.
  const MAX_MONTHS_AHEAD = 12
  const idx = (y, m) => y * 12 + (m - 1)
  const monthsAhead = idx(selectedMonth.year, selectedMonth.month) - idx(now.year, now.month)
  const canGoNext = monthsAhead < MAX_MONTHS_AHEAD
  const isFutureMonth = monthsAhead > 0

  return (
    <MonthContext.Provider value={{ selectedMonth, goToPrevMonth, goToNextMonth, goToCurrentMonth, isCurrentMonth, canGoNext, isFutureMonth }}>
      {children}
    </MonthContext.Provider>
  )
}

export function useMonth() {
  const ctx = useContext(MonthContext)
  if (!ctx) throw new Error('useMonth must be used inside MonthProvider')
  return ctx
}
