'use client'

import { useState } from 'react'
import { useStationSettings } from '@/client/hooks/useStationSettings'
import DepartureBoard from './DepartureBoard'
import StationTabs from './StationTabs'
import SettingsPanel from './SettingsPanel'

export default function TimetableApp() {
  const { stations, loaded, addStation, removeStation, updateStation } = useStationSettings()
  const [activeIndex, setActiveIndex] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // localStorage の読み込み完了前は何も表示しない（ハイドレーション不整合を防ぐ）
  if (!loaded) {
    return (
      <div className="space-y-3 p-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    )
  }

  const safeIndex = Math.min(activeIndex, Math.max(0, stations.length - 1))
  const activeStation = stations[safeIndex]

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      {/* ヘッダー */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xl">🚃</span>
          <h1 className="text-base font-bold text-slate-800">近場の電車案内</h1>
        </div>
        <button
          onClick={() => setSettingsOpen(true)}
          className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
          aria-label="設定を開く"
        >
          ⚙️
        </button>
      </header>

      {/* タブ（複数駅があるときのみ表示） */}
      {stations.length > 1 && (
        <div className="bg-white px-4 pt-2">
          <StationTabs
            stations={stations}
            activeIndex={safeIndex}
            onChange={(i) => setActiveIndex(i)}
          />
        </div>
      )}

      {/* メイン */}
      <main className="flex-1 px-4 py-5">
        {stations.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16 text-center text-slate-400">
            <p>駅が登録されていません</p>
            <button
              onClick={() => setSettingsOpen(true)}
              className="rounded-lg bg-blue-500 px-5 py-2 text-sm font-medium text-white hover:bg-blue-600"
            >
              駅を追加する
            </button>
          </div>
        ) : (
          <>
            {/* 駅名（タブが1つのときはここに表示） */}
            {stations.length === 1 && (
              <p className="mb-3 font-semibold text-slate-700">{activeStation.label}</p>
            )}
            <DepartureBoard key={activeStation.id} station={activeStation} />
          </>
        )}
      </main>

      {/* 設定パネル */}
      {settingsOpen && (
        <SettingsPanel
          stations={stations}
          onAdd={addStation}
          onRemove={(id) => {
            removeStation(id)
            setActiveIndex(0)
          }}
          onUpdate={updateStation}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
