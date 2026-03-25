import { scrapeAndSaveCsv } from '@/server/scrapeJrEast'
import { resolveLineid } from '@/server/trainInfo'

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null)
  if (!body) {
    return Response.json({ error: 'リクエストボディが不正です' }, { status: 400 })
  }

  const { stationId, weekdayUrl, holidayUrl, line } = body as {
    stationId?: string
    weekdayUrl?: string
    holidayUrl?: string
    line?: string
  }

  if (!stationId?.trim()) {
    return Response.json({ error: 'stationId は必須です' }, { status: 400 })
  }
  if (!weekdayUrl?.trim()) {
    return Response.json({ error: 'weekdayUrl は必須です' }, { status: 400 })
  }
  if (!holidayUrl?.trim()) {
    return Response.json({ error: 'holidayUrl は必須です' }, { status: 400 })
  }

  try {
    const [{ weekdayCount, holidayCount }, lineId] = await Promise.all([
      scrapeAndSaveCsv(weekdayUrl.trim(), holidayUrl.trim(), stationId.trim()),
      line?.trim() ? resolveLineid(line.trim()).catch(() => null) : Promise.resolve(null),
    ])
    return Response.json({
      success: true,
      stationId: stationId.trim(),
      weekdayCount,
      holidayCount,
      lineId: lineId ?? undefined,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラーが発生しました'
    return Response.json({ error: message }, { status: 500 })
  }
}
