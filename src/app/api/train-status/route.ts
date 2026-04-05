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
    const message = err instanceof Error ? err.message : String(err)
    console.error('[/api/train-status]', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
