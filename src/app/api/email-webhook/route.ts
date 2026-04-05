import { addAlert, type DelayAlert } from '@/server/delayAlerts'

/**
 * Yahoo 乗り換え等からの遅延メールを受け取り、遅延アラートとして保存する。
 *
 * SendGrid Inbound Parse / Mailgun Inbound Routing 形式（multipart/form-data）に対応。
 * JSON 形式（{ subject, text }）も受け付ける。
 *
 * 認証: クエリパラメータ ?secret=EMAIL_WEBHOOK_SECRET でシークレット照合
 */
export async function POST(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')

  if (!process.env.EMAIL_WEBHOOK_SECRET || secret !== process.env.EMAIL_WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  let subject = ''
  let body = ''

  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
    const form = await request.formData()
    subject = form.get('subject')?.toString() ?? ''
    // SendGrid は "text" フィールド、Mailgun は "body-plain" フィールド
    const rawBody =
      form.get('text')?.toString() ??
      form.get('body-plain')?.toString() ??
      form.get('html')?.toString() ??
      ''
    // HTML タグを除去
    body = rawBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  } else {
    const json = await request.json().catch(() => null)
    if (json && typeof json === 'object') {
      subject = (json as Record<string, string>).subject ?? ''
      body = (json as Record<string, string>).text ?? (json as Record<string, string>).body ?? ''
    }
  }

  const alert = parseDelayEmail(subject, body)
  if (!alert) {
    // 路線名が読み取れなくても 200 を返す（SendGrid 等がリトライしないよう）
    return Response.json({ ok: false, message: '路線情報を解析できませんでした' })
  }

  await addAlert(alert)
  return Response.json({ ok: true, alert })
}

// ── メール解析 ────────────────────────────────────────────────────

/**
 * メールの件名・本文から遅延アラートを生成する。
 * 路線名が特定できない場合は null を返す。
 */
function parseDelayEmail(subject: string, body: string): DelayAlert | null {
  const text = `${subject} ${body}`

  // 路線名を抽出（「東海道線」「横須賀線」「京浜東北・根岸線」「湘南新宿ライン」など）
  const lineMatch = text.match(
    /[「【『\[]?([^\s「」【】『』\[\]、。・\n]{2,20}(?:線|ライン))[」】』\]]?/u,
  )
  if (!lineMatch) return null
  const lineName = lineMatch[1]

  // 運行状況の判定（優先度順）
  let status: string
  if (/平常運転/.test(text)) {
    status = '平常運転'
  } else if (/運転見合わせ/.test(text)) {
    status = '運転見合わせ'
  } else if (/運転再開/.test(text)) {
    status = '運転再開'
  } else if (/一部列車運休/.test(text)) {
    status = '一部列車運休'
  } else if (/遅延/.test(text)) {
    status = '遅延'
  } else {
    status = '運行情報あり'
  }

  // 遅延分数を抽出（"約20分の遅延" "20分程度遅延" など）
  const minuteMatch = text.match(/約?\s*(\d+)\s*分[程度の]*遅[延れ]/)
  const detail = buildDetail(status, minuteMatch?.[1])

  return { lineName, status, detail, receivedAt: new Date().toISOString() }
}

function buildDetail(status: string, delayMinutes: string | undefined): string {
  switch (status) {
    case '平常運転':
      return '平常通り運転しています'
    case '運転見合わせ':
      return '運転を見合わせています'
    case '運転再開':
      return '運転を再開しました'
    case '一部列車運休':
      return '一部列車が運休しています'
    case '遅延':
      return delayMinutes
        ? `約${delayMinutes}分の遅延が発生しています`
        : '遅延が発生しています'
    default:
      return '運行情報があります'
  }
}
