import { searchStations } from '@/server/scrapeJrEast'
import type { StationSearchResult } from '@/types/timetable'

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url)
  const name = searchParams.get('name')?.trim()

  if (!name) {
    return Response.json({ error: '駅名を指定してください（name クエリパラメータ）' }, { status: 400 })
  }

  try {
    const results: StationSearchResult[] = await searchStations(name)
    return Response.json({ results })
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラーが発生しました'
    return Response.json({ error: message }, { status: 500 })
  }
}
