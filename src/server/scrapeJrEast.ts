import 'server-only'

import { writeFile } from 'fs/promises'
import path from 'path'
import type { TimetableOption, StationSearchResult } from '@/types/timetable'

const BASE_URL = 'https://timetables.jreast.co.jp'
const DATA_DIR = path.join(process.cwd(), 'data')

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; TimetableImporter/1.0)',
  'Accept-Language': 'ja,en;q=0.9',
}

export type { TimetableOption, StationSearchResult }

// ── 内部ユーティリティ ───────────────────────────────────────────

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: FETCH_HEADERS })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  // JR東日本サイトは Shift-JIS のページもあるが、最近は UTF-8
  const buf = await res.arrayBuffer()
  // Content-Type charset を確認
  const ct = res.headers.get('content-type') ?? ''
  if (/charset=shift.jis/i.test(ct) || /charset=sjis/i.test(ct)) {
    return new TextDecoder('shift-jis').decode(buf)
  }
  const text = new TextDecoder('utf-8').decode(buf)
  // meta charset が shift-jis を宣言していれば再デコード
  if (/<meta[^>]+charset=["']?shift.jis/i.test(text)) {
    return new TextDecoder('shift-jis').decode(buf)
  }
  return text
}

/** href 属性の相対 URL を絶対 URL に変換する */
function resolveUrl(href: string, baseUrl: string): string {
  if (href.startsWith('http')) return href
  return new URL(href, baseUrl).href
}

// ── 駅検索 ──────────────────────────────────────────────────────

/**
 * 駅名で検索し、各駅の時刻表オプション一覧を返す。
 * @param name 駅名（例: "平塚"）
 */
export async function searchStations(name: string): Promise<StationSearchResult[]> {
  const searchUrl =
    `${BASE_URL}/cgi-bin/st_search.cgi?mode=0&ekimei=` +
    encodeURIComponent(name)

  const html = await fetchHtml(searchUrl)

  // 検索結果テーブルのリンク: /timetable/listXXXX.html
  const listPattern = /href="((?:\.\.)?\/timetable\/list(\d+)\.html[^"]*)"/gi
  const stations: StationSearchResult[] = []
  const seen = new Set<string>()

  let m: RegExpExecArray | null
  while ((m = listPattern.exec(html)) !== null) {
    const href = m[1]
    const code = m[2]
    if (seen.has(code)) continue
    seen.add(code)

    const listUrl = resolveUrl(href, searchUrl)

    // 駅名は href の前のテキストから取得
    // <a href="...">駅名</a> パターンを探す
    const namePattern = new RegExp(
      `href="${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>([^<]+)<`,
      'i',
    )
    const nm = namePattern.exec(html)
    // "平塚(ひらつか)" → "平塚"
    const rawName = nm ? nm[1].trim() : code
    const stationName = rawName.replace(/\(.*\)$/, '').trim() || rawName

    // 路線一覧ページを取得
    let timetableOptions: TimetableOption[] = []
    try {
      timetableOptions = await fetchTimetableOptions(listUrl)
    } catch {
      // 取得失敗でも結果は返す
    }

    stations.push({ stationName, stationCode: code, listPageUrl: listUrl, timetableOptions })
  }

  return stations
}

/**
 * /timetable/listXXXX.html から時刻表オプション（路線・方面・URL）を抽出する。
 *
 * 実際のHTML構造（result_02 テーブル）:
 *   <tr>
 *     <th>東海道線</th>
 *     <td>小田原・熱海方面 (下り)</td>
 *     <td><a href="../2604/timetable/tt1337/1337010.html">平日</a></td>
 *     <td><a href="../2604/timetable/tt1337/1337011.html">土曜・休日</a></td>
 *     <td><a href="../2604/timetable-v/...">平日（デジタル）</a></td>
 *     <td><a href="../2604/timetable-v/...">土曜・休日（デジタル）</a></td>
 *   </tr>
 * timetable-v はデジタル版なので除外し、timetable/tt のみを使用する。
 */
async function fetchTimetableOptions(listUrl: string): Promise<TimetableOption[]> {
  const html = await fetchHtml(listUrl)
  const options: TimetableOption[] = []

  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch: RegExpExecArray | null
  while ((rowMatch = rowRe.exec(html)) !== null) {
    const row = rowMatch[1]

    // 路線名は <th> から
    const thMatch = /<th[^>]*>([\s\S]*?)<\/th>/i.exec(row)
    if (!thMatch) continue
    const line = thMatch[1].replace(/<[^>]*>/g, '').trim()

    // 方面は最初の <td> から
    const tdMatch = /<td[^>]*>([\s\S]*?)<\/td>/i.exec(row)
    if (!tdMatch) continue
    const direction = tdMatch[1].replace(/<[^>]*>/g, '').trim()

    if (!line || !direction) continue

    // timetable/tt のリンクのみ（timetable-v は除外）
    const links = [...row.matchAll(/href="([^"]*\/timetable\/tt[^"]*)"/gi)].map((lm) =>
      resolveUrl(lm[1], listUrl),
    )

    if (links.length < 2) continue

    options.push({
      line,
      direction,
      weekdayUrl: links[0],
      holidayUrl: links[1],
    })
  }

  return options
}

// ── 時刻表スクレイピング ─────────────────────────────────────────

export type TimetableRow = {
  time: string        // "HH:MM"
  destination: string // 行き先ラベル
  dayType: 'weekday' | 'holiday'
}

/**
 * ページの凡例 <dl class="timetable2_dl"> から行き先の略語→正式名マッピングを取得する。
 *
 * 例（下り）: { "無印": "小田原", "熱": "熱海", "国": "国府津", "沼": "沼津", "伊": "伊東" }
 * 例（上り）: { "高": "高崎", "宇": "宇都宮", "東": "東京", ... }
 */
function parseDestLegend(html: string): Map<string, string> {
  const legend = new Map<string, string>()

  // <dl class="timetable2_dl"> の <dt>行き先・経由</dt> ブロックを探す
  const dlRe = /<dl[^>]+class="timetable2_dl"[^>]*>([\s\S]*?)<\/dl>/gi
  let dlMatch: RegExpExecArray | null
  while ((dlMatch = dlRe.exec(html)) !== null) {
    const dlHtml = dlMatch[1]
    // <dt>行き先・経由</dt> を含むブロックのみ対象
    if (!/<dt[^>]*>[^<]*行き先[^<]*<\/dt>/i.test(dlHtml)) continue

    // <span>略語=正式名</span> を全抽出
    const spanRe = /<span[^>]*>([^<]+)<\/span>/gi
    let spanMatch: RegExpExecArray | null
    while ((spanMatch = spanRe.exec(dlHtml)) !== null) {
      const parts = spanMatch[1].split('=')
      if (parts.length === 2) {
        const abbr = parts[0].trim()
        const full = parts[1].trim()
        legend.set(abbr, full)
      }
    }
  }

  return legend
}

/**
 * JR東日本時刻表ページをスクレイピングして時刻データを返す。
 *
 * ページ内の凡例 <dl class="timetable2_dl"> を解析して略語→正式駅名に変換する。
 *
 * HTML 構造:
 *   <tr id="time_4">
 *     <td>4時</td>
 *     <td>
 *       <div class="timetable_time" data-dest="高,(東京)" ...>
 *         <span class="minute">51</span>
 *       </div>
 *     </td>
 *   </tr>
 */
export async function scrapePage(pageUrl: string, dayType: 'weekday' | 'holiday'): Promise<TimetableRow[]> {
  const html = await fetchHtml(pageUrl)
  const rows: TimetableRow[] = []

  // 凡例から略語→正式名マッピングを構築
  const destLegend = parseDestLegend(html)

  // <tr id="time_X"> ブロックを抽出
  const trRe = /<tr[^>]+id="time_(\d+)"[^>]*>([\s\S]*?)<\/tr>/gi
  let trMatch: RegExpExecArray | null

  while ((trMatch = trRe.exec(html)) !== null) {
    const hour = parseInt(trMatch[1], 10)
    const rowHtml = trMatch[2]

    // timetable_time div ごとに処理
    const divRe = /<div[^>]+class="timetable_time"[^>]+data-dest="([^"]*)"[^>]*>([\s\S]*?)<\/div>/gi
    let divMatch: RegExpExecArray | null

    while ((divMatch = divRe.exec(rowHtml)) !== null) {
      const rawDest = divMatch[1]
      const divHtml = divMatch[2]

      // <span class="minute">XX</span> から分を取得
      const minuteMatch = /<span[^>]+class="minute"[^>]*>(\d+)<\/span>/i.exec(divHtml)
      if (!minuteMatch) continue

      const minute = parseInt(minuteMatch[1], 10)
      const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
      const destination = parseDest(rawDest, destLegend)

      rows.push({ time, destination, dayType })
    }
  }

  return rows
}

/**
 * data-dest 属性値から行き先ラベルを抽出する。
 * 凡例マップを使って略語を正式駅名に変換する。
 *
 * パターン例:
 *   "高,(東京)"  → 括弧内 "(東京)" → 凡例で "東京経由" → 終着 "高崎" + 経由 "東京" → "東京経由"
 *                  ただし駅名として "(東京)" は経由表記なので終着の "高" → "高崎" を優先
 *   "熱"         → 凡例で "熱海"
 *   "無印"        → 凡例で "小田原"（または凡例なければ空文字）
 *   "高,(東京)"  → 終着: legend["高"]="高崎", 経由: legend["(東京)"]="東京経由"
 *                  → "高崎" を表示（ユーザーが乗る電車の最終目的地）
 */
function parseDest(raw: string, legend: Map<string, string>): string {
  // 括弧付きパターン "高,(東京)" や "(東京)" の処理
  const parenMatch = /\(([^)]+)\)/.exec(raw)
  if (parenMatch) {
    const viaKey = `(${parenMatch[1]})`
    const viaFull = legend.get(viaKey) ?? parenMatch[1]

    // 括弧前のトークン（終着駅の略語）を取得
    const terminus = raw.split(',')[0].trim()
    if (terminus && terminus !== raw) {
      // "高,(東京)" → "高崎(東京経由)"
      const terminusFull = legend.get(terminus) ?? terminus
      return `${terminusFull}(${viaFull})`
    }
    // 括弧のみ（例: "(東京)"）→ "東京経由"
    return viaFull
  }

  // 括弧なし: 凡例から正式名を取得
  const abbr = raw.trim()
  return legend.get(abbr) ?? ''
}

// ── CSV 出力 ────────────────────────────────────────────────────

/**
 * 平日・休日の時刻表ページをスクレイピングして CSV ファイルを保存する。
 * 保存先: data/{stationId}.csv
 */
export async function scrapeAndSaveCsv(
  weekdayPageUrl: string,
  holidayPageUrl: string,
  stationId: string,
): Promise<{ weekdayCount: number; holidayCount: number }> {
  const [weekdayRows, holidayRows] = await Promise.all([
    scrapePage(weekdayPageUrl, 'weekday'),
    scrapePage(holidayPageUrl, 'holiday'),
  ])

  if (weekdayRows.length === 0) throw new Error('平日時刻表からデータを取得できませんでした')
  if (holidayRows.length === 0) throw new Error('休日時刻表からデータを取得できませんでした')

  const allRows = [...weekdayRows.sort((a, b) => a.time.localeCompare(b.time)),
                   ...holidayRows.sort((a, b) => a.time.localeCompare(b.time))]

  const csvLines = ['time,destination,day_type']
  for (const { time, destination, dayType } of allRows) {
    csvLines.push(`${time},${destination},${dayType}`)
  }

  const outPath = path.join(DATA_DIR, `${stationId}.csv`)
  await writeFile(outPath, csvLines.join('\n') + '\n', 'utf-8')

  return { weekdayCount: weekdayRows.length, holidayCount: holidayRows.length }
}
