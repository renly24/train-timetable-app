import { fetchLineStatus } from '@/server/trainInfo'

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url)
  const lineid = searchParams.get('lineid')

  if (!lineid?.trim()) {
    return Response.json({ error: 'lineid is required' }, { status: 400 })
  }

  try {
    const status = await fetchLineStatus(lineid.trim())
    return Response.json(status)
  } catch (err) {
    console.error('[/api/train-status]', err)
    return Response.json({ error: 'Failed to fetch train status' }, { status: 500 })
  }
}
