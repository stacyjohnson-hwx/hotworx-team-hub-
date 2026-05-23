import LeadGenHQ from './hq/LeadGenHQ'

// header = 48px, main padding top+bottom = 48px → available height = 100vh - 96px
export default function LeadsPage() {
  return (
    <div style={{ height: 'calc(100vh - 96px)' }} className="flex flex-col">
      <LeadGenHQ />
    </div>
  )
}
