import 'server-only'

const TRAIN_INFO_BASE = 'https://traininfo.jreast.co.jp/train_info'
const GID = 1 // 関東エリア固定

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ja,en;q=0.9',
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: FETCH_HEADERS })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  const buf = await res.arrayBuffer()
  const ct = res.headers.get('content-type') ?? ''
  if (/charset=shift.jis/i.test(ct)) {
    return new TextDecoder('shift-jis').decode(buf)
  }
  return new TextDecoder('utf-8').decode(buf)
}

// ── 路線名 → lineid 解決 ─────────────────────────────────────────

/**
 * kanto.aspx をスクレイピングして 路線名 → lineid マップを構築する。
 *
 * HTML パターン（各路線ブロック）:
 *   <img src="...ico_rosen_XX.svg"> 東海道線
 *   <a href="line.aspx?gid=1&amp;lineid=tokaidoline">詳細</a>
 *
 * line.aspx リンクを起点に直前300文字から路線名テキストを抽出する。
 */
function parseKantoMap(html: string): Map<string, string> {
  const map = new Map<string, string>()
  const linkRe = /gid=\d+&(?:amp;)?lineid=([^"&\s]+)/g
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(html)) !== null) {
    const lineid = m[1]
    const before = html.slice(Math.max(0, m.index - 300), m.index)
    const text = before.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    // 末尾の路線名トークン: 〜線、〜ライン、〜ＢＲＴ/BRT、〜停車（各駅停車など）
    const nameMatch = /([^\s]{2,25}(?:線|ライン|ＢＲＴ|BRT|停車)[^\s]*)[\s]*$/u.exec(text)
    if (nameMatch) {
      const name = nameMatch[1]
      if (!map.has(name)) map.set(name, lineid)
    }
  }
  return map
}

// プロセス内キャッシュ
let _kantoMap: Map<string, string> | null = null
let _kantoMapBuiltAt = 0
const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6時間

async function getKantoMap(): Promise<Map<string, string>> {
  if (_kantoMap && Date.now() - _kantoMapBuiltAt < CACHE_TTL_MS) return _kantoMap
  const html = await fetchHtml(`${TRAIN_INFO_BASE}/kanto.aspx`)
  _kantoMap = parseKantoMap(html)
  _kantoMapBuiltAt = Date.now()
  return _kantoMap
}

/**
 * 路線名（例: "東海道線"）から lineid（例: "tokaidoline"）を解決する。
 * 完全一致 → 部分一致の順で試みる。
 * 見つからない場合は null を返す。
 */
export async function resolveLineid(lineName: string): Promise<string | null> {
  const map = await getKantoMap()

  if (map.has(lineName)) return map.get(lineName)!

  for (const [key, lineid] of map) {
    if (lineName.includes(key) || key.includes(lineName)) return lineid
  }

  return null
}

// ── 運行状況取得 ──────────────────────────────────────────────────

export type TrainStatus = {
  /** 運行状況テキスト（例: "平常運転", "遅延", "運転見合わせ"） */
  status: string
  /** 平常運転かどうか */
  isNormal: boolean
  /** 更新時刻（例: "2026年3月25日9時20分現在"）、取得できない場合は null */
  updatedAt: string | null
}

/**
 * lineid で指定した路線の現在の運行状況を取得する。
 */
export async function fetchLineStatus(lineid: string): Promise<TrainStatus> {
  const url = `${TRAIN_INFO_BASE}/line.aspx?gid=${GID}&lineid=${encodeURIComponent(lineid)}`
  const html = await fetchHtml(url)

  // <img src="...ico_info_XXXX.svg" alt="平常運転"> から状態テキストを取得
  let status = '不明'
  const imgMatch = /<img\b[^>]*\bsrc="[^"]*ico_info_[^"]*\.svg"[^>]*>/i.exec(html)
  if (imgMatch) {
    const altMatch = /\balt="([^"]+)"/.exec(imgMatch[0])
    if (altMatch) status = altMatch[1]
  }

  // フォールバック: 既知の状態テキストを直接探す
  if (status === '不明') {
    for (const s of ['平常運転', '遅延', '運転見合わせ', '運転情報あり', '一部列車運休']) {
      if (html.includes(s)) { status = s; break }
    }
  }

  // 更新時刻 "2026年3月25日 9時20分 現在" → スペース除去
  const timeMatch = /(\d{4}年\d{1,2}月\d{1,2}日\s*\d{1,2}時\d{2}分\s*現在)/.exec(html)
  const updatedAt = timeMatch ? timeMatch[1].replace(/\s+/g, '') : null

  return { status, isNormal: status === '平常運転', updatedAt }
}
