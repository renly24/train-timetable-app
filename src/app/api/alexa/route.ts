import { getUpcomingDepartures } from '@/server/timetable'
import { getRecentAlerts, buildDelayAlertSpeech } from '@/server/delayAlerts'
import type { TrainDeparture } from '@/types/timetable'

export const runtime = 'edge'

const DEFAULT_STATION_ID = process.env.ALEXA_STATION_ID ?? ''
const DEFAULT_WALKING_MINUTES = Number(process.env.ALEXA_WALKING_MINUTES ?? '10')

const REPROMPT_TEXT = '他に聞きたいことはありますか？'

/** "HH:MM" → "14時40分" のような読み上げ用テキストに変換 */
function formatTime(hhMM: string): string {
  const [hh, mm] = hhMM.split(':').map(Number)
  return mm === 0 ? `${hh}時` : `${hh}時${mm}分`
}

/** 出発余裕時間を読み上げ用テキストに変換 */
function formatUrgency(minutesToLeaveHome: number): string {
  return minutesToLeaveHome <= 0
    ? '今すぐ出発してください。'
    : `あと${minutesToLeaveHome}分以内に出発してください。`
}

/** 直近3本の読み上げテキストを生成 */
function speechForNextTrains(departures: TrainDeparture[]): string {
  if (departures.length === 0) {
    return '今から乗れる電車は見つかりませんでした。'
  }
  const parts = departures.map((d, i) => {
    const time = formatTime(d.departureTime)
    const urgency = formatUrgency(d.minutesToLeaveHome)
    if (i === 0) return `${time}発 ${d.destination}行き、${urgency}`
    if (i === 1) return `次は${time}発 ${d.destination}行き、${urgency}`
    return `もう1本は${time}発 ${d.destination}行き、${urgency}`
  })
  return `今から家を出ると乗れる電車を案内します。${parts.join('')}`
}

/** 次の1本の読み上げテキストを生成 */
function speechForNextSingle(departures: TrainDeparture[]): string {
  const next = departures[0]
  if (!next) return '今から乗れる電車は見つかりませんでした。'
  const time = formatTime(next.departureTime)
  return `今から家を出ると、次は${time}発 ${next.destination}行きです。${formatUrgency(next.minutesToLeaveHome)}`
}

/** 出発余裕時間の読み上げテキストを生成 */
function speechForTimeRemaining(departures: TrainDeparture[]): string {
  const next = departures[0]
  if (!next) return '今から乗れる電車は見つかりませんでした。'
  const time = formatTime(next.departureTime)
  return `次に乗れる電車は${time}発です。${formatUrgency(next.minutesToLeaveHome)}`
}

/** Alexa JSON レスポンスを生成 */
function alexaResponse(text: string, shouldEndSession = true): Response {
  const response: Record<string, unknown> = {
    outputSpeech: { type: 'PlainText', text },
    shouldEndSession,
  }
  if (!shouldEndSession) {
    response.reprompt = { outputSpeech: { type: 'PlainText', text: REPROMPT_TEXT } }
  }
  return Response.json({ version: '1.0', response })
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text()

  if (!DEFAULT_STATION_ID) {
    return alexaResponse('駅の設定がされていません。管理者に環境変数の設定を依頼してください。')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let envelope: any
  try {
    envelope = JSON.parse(rawBody)
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  const requestType: string = envelope?.request?.type ?? ''
  const intentName: string = envelope?.request?.intent?.name ?? ''

  if (requestType === 'SessionEndedRequest') {
    return Response.json({ version: '1.0', response: {} })
  }

  let departures: TrainDeparture[]
  try {
    departures = await getUpcomingDepartures(DEFAULT_STATION_ID, DEFAULT_WALKING_MINUTES, new Date(), 3)
  } catch (err) {
    console.error('[alexa] getUpcomingDepartures failed:', err)
    return alexaResponse('申し訳ありません、時刻表の取得に失敗しました。しばらくしてからもう一度お試しください。')
  }

  const alerts = await getRecentAlerts().catch(() => [])
  const delaySpeech = buildDelayAlertSpeech(alerts)

  if (requestType === 'LaunchRequest') {
    return alexaResponse(delaySpeech + speechForNextTrains(departures))
  }

  if (intentName === 'GetNextTrainsIntent') {
    return alexaResponse(delaySpeech + speechForNextTrains(departures), false)
  }

  if (intentName === 'GetNextSingleTrainIntent') {
    return alexaResponse(delaySpeech + speechForNextSingle(departures), false)
  }

  if (intentName === 'GetTimeRemainingIntent') {
    return alexaResponse(delaySpeech + speechForTimeRemaining(departures), false)
  }

  return alexaResponse('すみません、よく聞き取れませんでした。もう一度お願いします。', false)
}
