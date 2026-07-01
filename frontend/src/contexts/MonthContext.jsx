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

  // Owners/managers can plan one month ahead (e.g. next month's goals), so the
  // furthest-forward month allowed is current + 1.
  const maxMonth = now.month === 12
    ? { month: 1, year: now.year + 1 }
    : { month: now.month + 1, year: now.year }
  const isMaxMonth = selectedMonth.month === maxMonth.month && selectedMonth.year === maxMonth.year
  const canGoNext = !isMaxMonth
  const isFutureMonth = isMaxMonth

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
