import { getUpcomingDepartures } from '@/server/timetable'
import type { TrainDeparture } from '@/types/timetable'
import { promisify } from 'util'
import alexaVerifier from 'alexa-verifier'

const verify = promisify(
  alexaVerifier as (
    certUrl: string,
    signature: string,
    body: string,
    cb: (err: Error | null) => void,
  ) => void,
)

const DEFAULT_STATION_ID = process.env.ALEXA_STATION_ID ?? ''
const DEFAULT_WALKING_MINUTES = Number(process.env.ALEXA_WALKING_MINUTES ?? '10')

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
  return Response.json({
    version: '1.0',
    response: {
      outputSpeech: { type: 'PlainText', text },
      shouldEndSession,
    },
  })
}

export async function POST(request: Request): Promise<Response> {
  const certUrl = request.headers.get('signaturecertchainurl') ?? ''
  const signature = request.headers.get('signature') ?? ''
  const rawBody = await request.text()

  // Alexa リクエスト署名検証（SKIP_ALEXA_VERIFICATION=true で無効化可能）
  if (process.env.SKIP_ALEXA_VERIFICATION !== 'true') {
    try {
      await verify(certUrl, signature, rawBody)
    } catch {
      return new Response('Forbidden', { status: 403 })
    }
  }

  if (!DEFAULT_STATION_ID) {
    return alexaResponse('駅の設定がされていません。管理者に環境変数の設定を依頼してください。')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const envelope = JSON.parse(rawBody) as any
  const requestType: string = envelope?.request?.type ?? ''
  const intentName: string = envelope?.request?.intent?.name ?? ''

  const now = new Date()
  const departures = await getUpcomingDepartures(DEFAULT_STATION_ID, DEFAULT_WALKING_MINUTES, now, 3)

  if (requestType === 'LaunchRequest' || intentName === 'GetNextTrainsIntent') {
    return alexaResponse(speechForNextTrains(departures))
  }

  if (intentName === 'GetNextSingleTrainIntent') {
    return alexaResponse(speechForNextSingle(departures))
  }

  if (intentName === 'GetTimeRemainingIntent') {
    return alexaResponse(speechForTimeRemaining(departures))
  }

  if (requestType === 'SessionEndedRequest') {
    return Response.json({ version: '1.0', response: {} })
  }

  return alexaResponse('すみません、よく聞き取れませんでした。もう一度お願いします。')
}
