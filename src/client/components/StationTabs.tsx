import type { StationConfig } from '@/types/timetable'

interface Props {
  stations: StationConfig[]
  activeIndex: number
  onChange: (index: number) => void
}

export default function StationTabs({ stations, activeIndex, onChange }: Props) {
  if (stations.length <= 1) return null

  return (
    <div className="flex gap-1 overflow-x-auto border-b border-slate-200 pb-0">
      {stations.map((station, i) => (
        <button
          key={station.id}
          onClick={() => onChange(i)}
          className={`shrink-0 rounded-t-md px-4 py-2 text-sm font-medium transition-colors ${
            i === activeIndex
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {station.label}
        </button>
      ))}
    </div>
  )
}
