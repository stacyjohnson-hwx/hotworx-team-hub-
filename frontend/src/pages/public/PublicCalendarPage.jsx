import { useParams, useSearchParams } from 'react-router-dom'
import CalendarView from '@/components/CalendarView'

// PUBLIC, no auth. Standalone full-page calendar that QR codes / social
// links point at. Renders the shared CalendarView in print-optimized mode.
export default function PublicCalendarPage() {
  const { studioId } = useParams()
  const [params] = useSearchParams()
  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <CalendarView
        studioId={studioId}
        initialMonth={Number(params.get('month')) || undefined}
        initialYear={Number(params.get('year')) || undefined}
      />
    </div>
  )
}
