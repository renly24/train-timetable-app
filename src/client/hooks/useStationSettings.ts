'use client'

import { useState, useEffect } from 'react'
import type { StationConfig } from '@/types/timetable'

const STORAGE_KEY = 'train-station-settings'

const DEFAULT_STATIONS: StationConfig[] = [
  {
    id: '1337020',
    label: '平塚 東海道線 上り',
    walkingMinutes: 10,
  },
]

export function useStationSettings() {
  const [stations, setStations] = useState<StationConfig[]>(DEFAULT_STATIONS)
  const [loaded, setLoaded] = useState(false)

  // localStorage からの初期読み込み（クライアントのみ）
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed: unknown = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setStations(parsed as StationConfig[])
        }
      }
    } catch {
      // 読み込み失敗時はデフォルトのまま
    }
    setLoaded(true)
  }, [])

  const persist = (next: StationConfig[]) => {
    setStations(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  const addStation = (station: StationConfig) => {
    persist([...stations, station])
  }

  const removeStation = (id: string) => {
    persist(stations.filter((s) => s.id !== id))
  }

  const updateStation = (id: string, updates: Partial<StationConfig>) => {
    persist(stations.map((s) => (s.id === id ? { ...s, ...updates } : s)))
  }

  return { stations, loaded, addStation, removeStation, updateStation }
}
