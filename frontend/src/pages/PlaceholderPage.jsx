export default function PlaceholderPage({ title, description }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
        <span className="text-3xl">🔨</span>
      </div>
      <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
      <p className="text-gray-500 text-sm mt-2 max-w-xs">
        {description || 'This module is coming in an upcoming milestone.'}
      </p>
    </div>
  )
}
