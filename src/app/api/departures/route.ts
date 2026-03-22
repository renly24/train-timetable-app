import { getDayType, getUpcomingDepartures } from '@/server/timetable'
import type { DeparturesResponse } from '@/types/timetable'

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url)

  const stationId = searchParams.get('stationId')
  const walkingMinutes = Number(searchParams.get('walkingMinutes') ?? '10')
  const limit = Number(searchParams.get('limit') ?? '3')

  if (!stationId) {
    return Response.json({ error: 'stationId is required' }, { status: 400 })
  }

  const now = new Date()

  try {
    const departures = getUpcomingDepartures(stationId, walkingMinutes, now, limit)

    const body: DeparturesResponse = {
      stationId,
      walkingMinutes,
      fetchedAt: now.toISOString(),
      dayType: getDayType(now),
      departures,
    }

    return Response.json(body)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return Response.json(
        { error: `Station data not found: "${stationId}"` },
        { status: 404 },
      )
    }
    console.error('[/api/departures]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
