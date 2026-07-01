import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMonth } from '@/contexts/MonthContext'
import { formatMonthYear } from '@/lib/utils'

export function MonthNav() {
  const { selectedMonth, goToPrevMonth, goToNextMonth, goToCurrentMonth, isCurrentMonth, canGoNext } = useMonth()

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={goToPrevMonth}
        className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
        title="Previous month"
      >
        <ChevronLeft size={16} />
      </button>

      <button
        onClick={goToCurrentMonth}
        className="px-2 py-1 rounded text-sm font-medium text-gray-200 hover:bg-gray-700 hover:text-white transition-colors min-w-[130px] text-center"
        title={isCurrentMonth ? 'Current month' : 'Click to return to current month'}
      >
        {formatMonthYear(selectedMonth.month, selectedMonth.year)}
        {!isCurrentMonth && (
          <span className="ml-1 text-xs text-yellow-400">↩</span>
        )}
      </button>

      <button
        onClick={goToNextMonth}
        disabled={!canGoNext}
        className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Next month"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
