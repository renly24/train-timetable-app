'use client'

import { useState, useEffect, useCallback } from 'react'
import type { DeparturesResponse, StationConfig, TrainStatus } from '@/types/timetable'
import DepartureCard from './DepartureCard'

interface Props {
  station: StationConfig
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  // JST に変換して表示
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  const hh = String(jst.getUTCHours()).padStart(2, '0')
  const mm = String(jst.getUTCMinutes()).padStart(2, '0')
  const ss = String(jst.getUTCSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

export default function DepartureBoard({ station }: Props) {
  const [data, setData] = useState<DeparturesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [trainStatus, setTrainStatus] = useState<TrainStatus | null>(null)

  const fetchDepartures = useCallback(async () => {
    setError(null)
    try {
      const params = new URLSearchParams({
        stationId: station.id,
        walkingMinutes: String(station.walkingMinutes),
      })
      const res = await fetch(`/api/departures?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      setData(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データを取得できませんでした')
    } finally {
      setLoading(false)
    }
  }, [station.id, station.walkingMinutes])

  useEffect(() => {
    setLoading(true)
    fetchDepartures()
    const interval = setInterval(fetchDepartures, 60_000)
    return () => clearInterval(interval)
  }, [fetchDepartures])

  // 1秒ごとに現在時刻を更新（秒刻みカウントダウン用）
  useEffect(() => {
    const ticker = setInterval(() => setNow(new Date()), 1_000)
    return () => clearInterval(ticker)
  }, [])

  // 運行状況を5分ごとに取得
  useEffect(() => {
    if (!station.lineId) return
    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/train-status?lineid=${encodeURIComponent(station.lineId!)}`)
        if (res.ok) setTrainStatus(await res.json())
      } catch {
        // 取得失敗は無視（表示しないだけ）
      }
    }
    fetchStatus()
    const interval = setInterval(fetchStatus, 5 * 60_000)
    return () => clearInterval(interval)
  }, [station.lineId])

  return (
    <div className="space-y-3">
      {/* 運行状況バッジ */}
      {trainStatus && (
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
          trainStatus.isNormal
            ? 'bg-green-50 text-green-700'
            : 'bg-red-50 text-red-700'
        }`}>
          <span className="font-semibold">{trainStatus.status}</span>
          {trainStatus.updatedAt && (
            <span className="ml-auto text-xs opacity-60">{trainStatus.updatedAt}</span>
          )}
        </div>
      )}

      {/* サブヘッダー：徒歩時間・最終更新 */}
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>徒歩 {station.walkingMinutes} 分</span>
        <div className="flex items-center gap-2">
          {data && <span>最終更新 {formatTime(data.fetchedAt)}</span>}
          <button
            onClick={() => { setLoading(true); fetchDepartures() }}
            disabled={loading}
            className="rounded-md border border-slate-200 px-2 py-0.5 text-xs hover:bg-slate-100 disabled:opacity-40"
          >
            {loading ? '更新中…' : '更新'}
          </button>
        </div>
      </div>

      {/* 本体 */}
      {loading && !data ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border-2 border-red-200 bg-red-50 px-5 py-6 text-center">
          <p className="text-red-600">{error}</p>
          <button
            onClick={() => { setLoading(true); fetchDepartures() }}
            className="mt-3 rounded-md bg-red-500 px-4 py-1.5 text-sm text-white hover:bg-red-600"
          >
            再試行
          </button>
        </div>
      ) : data && data.departures.length === 0 ? (
        <div className="rounded-xl border-2 border-slate-200 bg-slate-50 px-5 py-8 text-center text-slate-500">
          乗れる電車はありません
        </div>
      ) : (
        data?.departures.map((dep) => (
          <DepartureCard
            key={dep.departureTime + dep.destination}
            departure={dep}
            now={now}
          />
        ))
      )}
    </div>
  )
}
