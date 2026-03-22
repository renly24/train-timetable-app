import 'server-only'

import type { TrainDeparture } from '@/types/timetable'

type DayType = 'weekday' | 'holiday'

type CsvRow = {
  time: string
  destination: string
  dayType: DayType
}

const JST_OFFSET = 9 * 60 * 60 * 1000

/** UTC の Date を JST に変換して時・分・曜日を返す */
function toJST(utcDate: Date): { hours: number; minutes: number; dayOfWeek: number } {
  const jst = new Date(utcDate.getTime() + JST_OFFSET)
  return {
    hours: jst.getUTCHours(),
    minutes: jst.getUTCMinutes(),
    dayOfWeek: jst.getUTCDay(), // 0=日, 6=土
  }
}

/** "HH:MM"（JST）を当日の UTC エポック時刻（ms）に変換する */
function toDepartureEpochMs(hhMM: string, utcNow: Date): number {
  const jstNow = new Date(utcNow.getTime() + JST_OFFSET)
  const y = jstNow.getUTCFullYear()
  const mo = jstNow.getUTCMonth()
  const d = jstNow.getUTCDate()
  const [hh, mm] = hhMM.split(':').map(Number)
  const jstMidnightUTC = Date.UTC(y, mo, d) - JST_OFFSET
  return jstMidnightUTC + hh * 3_600_000 + mm * 60_000
}

/** 曜日判定（土日 → holiday、平日 → weekday） */
export function getDayType(utcDate: Date): DayType {
  const { dayOfWeek } = toJST(utcDate)
  return dayOfWeek === 0 || dayOfWeek === 6 ? 'holiday' : 'weekday'
}

/** Vercel Blob から CSV を取得してパースする */
async function loadCSV(stationId: string): Promise<CsvRow[]> {
  const baseUrl = process.env.BLOB_BASE_URL
  if (!baseUrl) throw new Error('BLOB_BASE_URL is not set')

  const url = `${baseUrl}/${stationId}.csv`
  const res = await fetch(url, { cache: 'no-store' })

  if (res.status === 404) {
    const err = new Error(`Station data not found: "${stationId}"`) as NodeJS.ErrnoException
    err.code = 'ENOENT'
    throw err
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch timetable: ${res.status} ${res.statusText}`)
  }

  const content = await res.text()
  const lines = content.split('\n').filter((l) => l.trim())
  const [, ...rows] = lines // ヘッダー行をスキップ

  return rows.map((line) => {
    const parts = line.split(',')
    return {
      time: parts[0].trim(),
      destination: parts[1].trim(),
      dayType: parts[2].trim() as DayType,
    }
  })
}

/**
 * 徒歩時間を考慮して乗れる直近の電車を返す
 *
 * @param stationId      CSV ファイル ID（Blob 上のファイル名）
 * @param walkingMinutes 自宅から駅までの徒歩時間（分）
 * @param utcNow         現在時刻（UTC）
 * @param limit          取得件数（デフォルト 3）
 */
export async function getUpcomingDepartures(
  stationId: string,
  walkingMinutes: number,
  utcNow: Date,
  limit = 3,
): Promise<TrainDeparture[]> {
  const dayType = getDayType(utcNow)
  const { hours, minutes } = toJST(utcNow)

  const nowTotalMinutes = hours * 60 + minutes
  const catchableFromMinutes = nowTotalMinutes + walkingMinutes

  const rows = await loadCSV(stationId)
  const results: TrainDeparture[] = []

  for (const row of rows) {
    if (row.dayType !== dayType) continue

    const [hh, mm] = row.time.split(':').map(Number)
    const trainTotalMinutes = hh * 60 + mm

    if (trainTotalMinutes < catchableFromMinutes) continue

    const departureEpochMs = toDepartureEpochMs(row.time, utcNow)
    results.push({
      departureTime: row.time,
      destination: row.destination,
      minutesUntilDeparture: trainTotalMinutes - nowTotalMinutes,
      minutesToLeaveHome: trainTotalMinutes - catchableFromMinutes,
      departureEpochMs,
      leaveHomeEpochMs: departureEpochMs - walkingMinutes * 60_000,
    })

    if (results.length >= limit) break
  }

  return results
}
