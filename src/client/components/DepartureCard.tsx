import type { TrainDeparture } from '@/types/timetable'

interface Props {
  departure: TrainDeparture
  now: Date
}

/** 残り秒数を "X分Y秒" / "Y秒" 形式にフォーマット */
function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0秒'
  const m = Math.floor(totalSeconds / 60)
  const s = Math.floor(totalSeconds % 60)
  if (m === 0) return `${s}秒`
  return `${m}分${s}秒`
}

function urgencyStyle(secondsToLeaveHome: number): {
  border: string
  badge: string
  label: string
} {
  if (secondsToLeaveHome <= 0) {
    return {
      border: 'border-red-400',
      badge: 'bg-red-500 text-white',
      label: '今すぐ出発！',
    }
  }
  if (secondsToLeaveHome <= 5 * 60) {
    return {
      border: 'border-amber-400',
      badge: 'bg-amber-400 text-white',
      label: `あと ${formatCountdown(secondsToLeaveHome)} で出発`,
    }
  }
  return {
    border: 'border-slate-200',
    badge: 'bg-slate-100 text-slate-600',
    label: `あと ${formatCountdown(secondsToLeaveHome)} で出発`,
  }
}

export default function DepartureCard({ departure, now }: Props) {
  const nowMs = now.getTime()
  const secondsUntilDeparture = Math.max(0, (departure.departureEpochMs - nowMs) / 1_000)
  const secondsUntilLeaveHome = (departure.leaveHomeEpochMs - nowMs) / 1_000

  const { border, badge, label } = urgencyStyle(secondsUntilLeaveHome)

  return (
    <div className={`flex items-center justify-between rounded-xl border-2 ${border} bg-white px-5 py-4 shadow-sm`}>
      {/* 発車時刻 + 行き先 */}
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-bold tabular-nums text-slate-800">
          {departure.departureTime}
        </span>
        {departure.destination && (() => {
          // "高崎(東京経由)" → terminus="高崎", via="東京経由"
          const viaMatch = /^(.+?)\(([^)]+)\)$/.exec(departure.destination)
          return (
            <span className="flex flex-col leading-tight">
              <span className="text-lg font-medium text-slate-600">
                {viaMatch ? viaMatch[1] : departure.destination}行き
              </span>
              {viaMatch && (
                <span className="text-xs text-slate-400">{viaMatch[2]}</span>
              )}
            </span>
          )
        })()}
      </div>

      {/* 時間表示 */}
      <div className="flex flex-col items-end gap-1">
        {/* 発車まで */}
        <span className="text-xs tabular-nums text-slate-400">
          発車まで {formatCountdown(secondsUntilDeparture)}
        </span>
        {/* 家を出るまで（緊急度バッジ） */}
        <span className={`rounded-full px-3 py-1 text-sm font-semibold tabular-nums ${badge}`}>
          {label}
        </span>
      </div>
    </div>
  )
}
