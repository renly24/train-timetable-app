/** 駅名検索の1件の結果 */
export type TimetableOption = {
  line: string
  direction: string
  weekdayUrl: string
  holidayUrl: string
}

export type StationSearchResult = {
  stationName: string
  stationCode: string
  listPageUrl: string
  timetableOptions: TimetableOption[]
}

/** 駅・路線設定（UI で管理・localStorage に保存） */
export type StationConfig = {
  id: string             // CSV ファイル ID（data/{id}.csv）
  label: string          // 表示名（例: "平塚 東海道線 上り"）
  walkingMinutes: number // 自宅から駅までの徒歩時間（分）
}

/** GET /api/departures のレスポンス */
export type DeparturesResponse = {
  stationId: string
  walkingMinutes: number
  fetchedAt: string                   // ISO8601
  dayType: 'weekday' | 'holiday'
  departures: TrainDeparture[]
}

/** 1本の電車情報 */
export type TrainDeparture = {
  departureTime: string          // "HH:MM"
  destination: string            // "東京" | "新宿" | ...
  minutesUntilDeparture: number  // 発車まで残り分数
  minutesToLeaveHome: number     // 出発余裕（0以下 → 今すぐ出発）
  departureEpochMs: number       // 発車時刻の Unix タイムスタンプ（ms）
  leaveHomeEpochMs: number       // 家を出るべき時刻の Unix タイムスタンプ（ms）
}
