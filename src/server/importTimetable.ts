import 'server-only'

import { existsSync } from 'fs'
import { writeFile } from 'fs/promises'
import { spawn } from 'child_process'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data')

export type PdfLinks = {
  weekdayUrl: string | null
  holidayUrl: string | null
}

/**
 * JR東日本の時刻表HTMLページから平日・休日の PDF URL を抽出する。
 * ファイル名末尾の H = 平日 / K = 休日 の命名規則と
 * リンク周辺テキストの「平日」「休日」キーワードで判別する。
 */
export async function fetchPdfLinks(pageUrl: string): Promise<PdfLinks> {
  const res = await fetch(pageUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TimetableImporter/1.0)' },
  })
  if (!res.ok) throw new Error(`ページ取得失敗: HTTP ${res.status} (${pageUrl})`)
  const html = await res.text()
  const base = new URL(pageUrl)

  // <a href="...pdf">テキスト</a> とその前後60文字を収集
  const found: { url: string; context: string }[] = []
  const re = /(.{0,60})<a[^>]+href="([^"]*\.pdf[^"]*)"[^>]*>([\s\S]*?)<\/a>(.{0,60})/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const href = m[2]
    const context = (m[1] + m[3] + m[4]).replace(/<[^>]*>/g, ' ')
    const url = href.startsWith('http') ? href : new URL(href, base).href
    found.push({ url, context })
  }

  let weekdayUrl: string | null = null
  let holidayUrl: string | null = null

  for (const { url, context } of found) {
    const filename = url.split('/').pop() ?? ''
    const isWeekday = /H\.pdf$/i.test(filename) || /平日/.test(context)
    const isHoliday = /K\.pdf$/i.test(filename) || /休日|土休|土曜|日曜/.test(context)
    if (isWeekday && !weekdayUrl) weekdayUrl = url
    else if (isHoliday && !holidayUrl) holidayUrl = url
  }

  // キーワードで分類できなかった場合は出現順で割り当て（平日が先のケースが多い）
  if (!weekdayUrl && !holidayUrl) {
    if (found.length >= 2) {
      weekdayUrl = found[0].url
      holidayUrl = found[1].url
    } else if (found.length === 1) {
      weekdayUrl = found[0].url
    }
  }

  return { weekdayUrl, holidayUrl }
}

/** URL からファイルをダウンロードして保存する */
export async function downloadFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TimetableImporter/1.0)' },
  })
  if (!res.ok) throw new Error(`ダウンロード失敗: ${url} (HTTP ${res.status})`)
  await writeFile(destPath, Buffer.from(await res.arrayBuffer()))
}

/** Python スクリプトを呼び出して PDF を CSV に変換する */
export async function runPdfToCSV(
  weekdayPdfPath: string,
  holidayPdfPath: string,
  outputCsvPath: string,
): Promise<void> {
  const scriptPath = path.join(process.cwd(), 'scripts', 'pdf_to_csv.py')

  return new Promise<void>((resolve, reject) => {
    const proc = spawn('python', [
      scriptPath,
      '--weekday', weekdayPdfPath,
      '--holiday', holidayPdfPath,
      '--output',  outputCsvPath,
    ])

    let stderr = ''
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    proc.on('error', (err) => {
      reject(new Error(
        `Python の起動に失敗しました。python と pdfplumber がインストールされているか確認してください。\n${err.message}`,
      ))
    })

    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`PDF→CSV 変換に失敗しました (exit ${code}):\n${stderr}`))
    })
  })
}

export type ImportStationInput = {
  /** data/{stationId}.csv として保存される CSV ファイル ID */
  stationId: string
  /** JR東日本の時刻表 HTML ページ URL。省略時はローカル PDF を使用 */
  pageUrl?: string
}

/**
 * 時刻表のインポートメイン処理。
 *
 * 1. data/{stationId}_weekday.pdf / _holiday.pdf が存在しない場合、pageUrl から DL
 * 2. Python スクリプトで PDF → CSV 変換
 * 3. data/{stationId}.csv を出力
 */
export async function importStation(input: ImportStationInput): Promise<void> {
  const { stationId, pageUrl } = input
  const weekdayPdf = path.join(DATA_DIR, `${stationId}_weekday.pdf`)
  const holidayPdf = path.join(DATA_DIR, `${stationId}_holiday.pdf`)
  const outputCsv = path.join(DATA_DIR, `${stationId}.csv`)

  const weekdayExists = existsSync(weekdayPdf)
  const holidayExists = existsSync(holidayPdf)

  // PDF が揃っていなければダウンロード
  if (!weekdayExists || !holidayExists) {
    if (!pageUrl) {
      throw new Error(
        `PDF ファイルが見つかりません。pageUrl を指定するか ` +
        `"${weekdayPdf}" と "${holidayPdf}" を配置してください。`,
      )
    }

    const { weekdayUrl, holidayUrl } = await fetchPdfLinks(pageUrl)
    if (!weekdayUrl) throw new Error('ページから平日 PDF のリンクを見つけられませんでした')
    if (!holidayUrl) throw new Error('ページから休日 PDF のリンクを見つけられませんでした')

    await Promise.all([
      weekdayExists ? Promise.resolve() : downloadFile(weekdayUrl, weekdayPdf),
      holidayExists ? Promise.resolve() : downloadFile(holidayUrl, holidayPdf),
    ])
  }

  await runPdfToCSV(weekdayPdf, holidayPdf, outputCsv)
}
