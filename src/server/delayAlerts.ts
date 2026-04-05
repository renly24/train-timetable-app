import 'server-only'

import { put } from '@vercel/blob'

const BLOB_FILENAME = 'delay-alerts.json'
/** 有効期限: 3時間 */
const ALERT_TTL_MS = 3 * 60 * 60 * 1000

export type DelayAlert = {
  /** 路線名（例: "東海道線"） */
  lineName: string
  /** 運行状況（例: "遅延", "運転見合わせ", "平常運転"） */
  status: string
  /** 読み上げ用の詳細テキスト */
  detail: string
  /** メール受信日時（ISO 8601） */
  receivedAt: string
}

/** Blob から遅延アラート一覧を取得し、有効期限内のものだけを返す */
export async function getRecentAlerts(): Promise<DelayAlert[]> {
  const baseUrl = process.env.BLOB_BASE_URL
  if (!baseUrl) return []

  try {
    const res = await fetch(`${baseUrl}/${BLOB_FILENAME}?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return []
    const alerts: unknown = await res.json()
    if (!Array.isArray(alerts)) return []
    const cutoff = Date.now() - ALERT_TTL_MS
    return (alerts as DelayAlert[]).filter(
      a => typeof a.receivedAt === 'string' && new Date(a.receivedAt).getTime() > cutoff,
    )
  } catch {
    return []
  }
}

/** 新しい遅延アラートを追加して Blob に保存する。同一路線の古いアラートは上書きされる */
export async function addAlert(alert: DelayAlert): Promise<void> {
  const existing = await getRecentAlerts()
  // 同じ路線の既存アラートを除去して最新を先頭に
  const filtered = existing.filter(a => a.lineName !== alert.lineName)
  const updated = [alert, ...filtered].slice(0, 10)
  await put(BLOB_FILENAME, JSON.stringify(updated), {
    access: 'public',
    contentType: 'application/json',
    allowOverwrite: true,
  })
}

/** メール受信からの経過時間を読み上げ用テキストに変換する（例: "約20分前", "約1時間前"） */
function formatElapsed(receivedAt: string): string {
  const elapsedMs = Date.now() - new Date(receivedAt).getTime()
  const minutes = Math.floor(elapsedMs / 60_000)
  if (minutes < 1) return 'たった今'
  if (minutes < 60) return `約${minutes}分前`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  return rem === 0 ? `約${hours}時間前` : `約${hours}時間${rem}分前`
}

/** 遅延中の路線をアレクサ向け読み上げテキストに変換する。正常時は空文字を返す */
export function buildDelayAlertSpeech(alerts: DelayAlert[]): string {
  const abnormal = alerts.filter(a => a.status !== '平常運転')
  if (abnormal.length === 0) return ''
  const lines = abnormal
    .map(a => `${a.lineName}は${formatElapsed(a.receivedAt)}に通知がありました。${a.detail}。`)
    .join('')
  return `運行情報をお伝えします。${lines}`
}
