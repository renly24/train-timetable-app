import { scrapeAndSaveCsv } from '@/server/scrapeJrEast'

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null)
  if (!body) {
    return Response.json({ error: 'リクエストボディが不正です' }, { status: 400 })
  }

  const { stationId, weekdayUrl, holidayUrl } = body as {
    stationId?: string
    weekdayUrl?: string
    holidayUrl?: string
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
    const { weekdayCount, holidayCount } = await scrapeAndSaveCsv(
      weekdayUrl.trim(),
      holidayUrl.trim(),
      stationId.trim(),
    )
    return Response.json({ success: true, stationId: stationId.trim(), weekdayCount, holidayCount })
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラーが発生しました'
    return Response.json({ error: message }, { status: 500 })
  }
}
