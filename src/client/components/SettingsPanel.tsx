'use client'

import { useState } from 'react'
import type { StationConfig, StationSearchResult, TimetableOption } from '@/types/timetable'

interface Props {
  stations: StationConfig[]
  onAdd: (station: StationConfig) => void
  onRemove: (id: string) => void
  onUpdate: (id: string, updates: Partial<StationConfig>) => void
  onClose: () => void
}

const EMPTY_MANUAL_FORM = { id: '', label: '', walkingMinutes: '10' }

type SearchStatus = 'idle' | 'loading' | 'done' | 'error'
type ImportStatus = 'idle' | 'loading' | 'success' | 'error'

type SelectedOption = {
  result: StationSearchResult
  option: TimetableOption
}

export default function SettingsPanel({ stations, onAdd, onRemove, onUpdate, onClose }: Props) {
  // ── 手動追加フォーム ─────────────────────────────────────────
  const [manualForm, setManualForm] = useState(EMPTY_MANUAL_FORM)
  const [manualError, setManualError] = useState('')

  // ── 駅名検索フォーム ─────────────────────────────────────────
  const [searchName, setSearchName] = useState('')
  const [searchStatus, setSearchStatus] = useState<SearchStatus>('idle')
  const [searchError, setSearchError] = useState('')
  const [searchResults, setSearchResults] = useState<StationSearchResult[]>([])

  // ── 選択された時刻表オプション ────────────────────────────────
  const [selected, setSelected] = useState<SelectedOption | null>(null)
  const [importLabel, setImportLabel] = useState('')
  const [importWalking, setImportWalking] = useState('10')
  const [importId, setImportId] = useState('')
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle')
  const [importError, setImportError] = useState('')

  // ── 手動追加 ─────────────────────────────────────────────────
  const handleManualAdd = () => {
    if (!manualForm.id.trim())    { setManualError('ファイルIDを入力してください'); return }
    if (!manualForm.label.trim()) { setManualError('表示名を入力してください'); return }
    const minutes = Number(manualForm.walkingMinutes)
    if (isNaN(minutes) || minutes < 0) { setManualError('徒歩時間は0以上の数値を入力してください'); return }
    if (stations.some((s) => s.id === manualForm.id.trim())) {
      setManualError('同じファイルIDの駅がすでに登録されています')
      return
    }
    onAdd({ id: manualForm.id.trim(), label: manualForm.label.trim(), walkingMinutes: minutes })
    setManualForm(EMPTY_MANUAL_FORM)
    setManualError('')
  }

  // ── 駅名検索 ─────────────────────────────────────────────────
  const handleSearch = async () => {
    if (!searchName.trim()) { setSearchError('駅名を入力してください'); return }
    setSearchStatus('loading')
    setSearchError('')
    setSearchResults([])
    setSelected(null)

    try {
      const res = await fetch(`/api/admin/search?name=${encodeURIComponent(searchName.trim())}`)
      const data = await res.json() as { results?: StationSearchResult[]; error?: string }
      if (!res.ok || !data.results) throw new Error(data.error ?? `HTTP ${res.status}`)
      setSearchResults(data.results)
      setSearchStatus('done')
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : '不明なエラーが発生しました')
      setSearchStatus('error')
    }
  }

  // ── 時刻表オプション選択 ──────────────────────────────────────
  const handleSelectOption = (result: StationSearchResult, option: TimetableOption) => {
    setSelected({ result, option })
    // ID と表示名を自動補完（駅コード＋路線番号ベースで英数字のみ）
    // 例: "1337010" から "1337010" / 末尾 0=平日下り、1=休日下り、0=上りなど
    // weekdayUrl 末尾ファイル名（例: 1337010.html）から数字部分を取る
    const urlFile = option.weekdayUrl.split('/').pop()?.replace('.html', '') ?? ''
    const autoId = urlFile || `${result.stationCode}-${Date.now()}`
    setImportId(autoId)
    setImportLabel(`${result.stationName} ${option.line} ${option.direction}`)
    setImportStatus('idle')
    setImportError('')
  }

  // ── インポート実行 ────────────────────────────────────────────
  const handleImport = async () => {
    if (!selected) return
    if (!importId.trim())    { setImportError('ファイルIDを入力してください'); return }
    if (!importLabel.trim()) { setImportError('表示名を入力してください'); return }
    const minutes = Number(importWalking)
    if (isNaN(minutes) || minutes < 0) { setImportError('徒歩時間は0以上の数値を入力してください'); return }
    if (stations.some((s) => s.id === importId.trim())) {
      setImportError('同じファイルIDの駅がすでに登録されています')
      return
    }

    setImportStatus('loading')
    setImportError('')

    try {
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId: importId.trim(),
          weekdayUrl: selected.option.weekdayUrl,
          holidayUrl: selected.option.holidayUrl,
          line: selected.option.line,
        }),
      })
      const data = await res.json() as { success?: boolean; error?: string; lineId?: string }
      if (!res.ok || !data.success) throw new Error(data.error ?? `HTTP ${res.status}`)

      onAdd({
        id: importId.trim(),
        label: importLabel.trim(),
        walkingMinutes: minutes,
        lineId: data.lineId,
      })
      setImportStatus('success')
      setSelected(null)
      setSearchResults([])
      setSearchName('')
      setSearchStatus('idle')
    } catch (err) {
      setImportError(err instanceof Error ? err.message : '不明なエラーが発生しました')
      setImportStatus('error')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl max-h-[90dvh] overflow-y-auto">
        {/* ヘッダー */}
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-800">設定</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 p-6">
          {/* ── 登録済みの駅 ── */}
          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              登録済みの駅
            </h3>
            {stations.length === 0 ? (
              <p className="text-sm text-slate-400">登録された駅はありません</p>
            ) : (
              <ul className="space-y-2">
                {stations.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-800">{s.label}</p>
                      <p className="text-xs text-slate-400">{s.id}</p>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-slate-600">
                      <span>徒歩</span>
                      <input
                        type="number"
                        min={0}
                        value={s.walkingMinutes}
                        onChange={(e) => onUpdate(s.id, { walkingMinutes: Number(e.target.value) })}
                        className="w-12 rounded border border-slate-200 px-1 py-0.5 text-center text-sm"
                      />
                      <span>分</span>
                    </div>
                    <button
                      onClick={() => onRemove(s.id)}
                      className="shrink-0 rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                    >
                      削除
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <hr className="border-slate-100" />

          {/* ── 駅名から時刻表を追加 ── */}
          <section>
            <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
              駅名から時刻表を追加
            </h3>
            <p className="mb-3 text-xs text-slate-400">
              JR東日本の駅名を入力して検索し、路線・方面を選択してください。
            </p>

            {/* 検索フォーム */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="例: 平塚"
                value={searchName}
                onChange={(e) => { setSearchName(e.target.value); setSearchStatus('idle') }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
              />
              <button
                onClick={handleSearch}
                disabled={searchStatus === 'loading'}
                className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
              >
                {searchStatus === 'loading' ? '検索中…' : '検索'}
              </button>
            </div>

            {searchStatus === 'error' && (
              <p className="mt-2 text-xs text-red-500">{searchError}</p>
            )}

            {/* 検索結果 */}
            {searchStatus === 'done' && searchResults.length === 0 && (
              <p className="mt-2 text-sm text-slate-400">該当する駅が見つかりませんでした</p>
            )}

            {searchResults.length > 0 && (
              <div className="mt-3 space-y-3">
                {searchResults.map((result) => (
                  <div key={result.stationCode}>
                    <p className="mb-1 text-xs font-semibold text-slate-600">{result.stationName}駅</p>
                    <ul className="space-y-1">
                      {result.timetableOptions.map((opt, i) => (
                        <li key={i}>
                          <button
                            onClick={() => handleSelectOption(result, opt)}
                            className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                              selected?.option === opt
                                ? 'border-blue-400 bg-blue-50 text-blue-700'
                                : 'border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-blue-50/50'
                            }`}
                          >
                            <span className="font-medium">{opt.line}</span>
                            <span className="ml-2 text-slate-500">{opt.direction}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {/* 選択後の登録フォーム */}
            {selected && (
              <div className="mt-4 space-y-2 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                <p className="text-xs font-semibold text-blue-700">
                  {selected.result.stationName}駅 / {selected.option.line} {selected.option.direction}
                </p>
                <div>
                  <label className="mb-1 block text-xs text-slate-500">
                    ファイルID（data/ 内の CSV 名になります）
                  </label>
                  <input
                    type="text"
                    value={importId}
                    onChange={(e) => { setImportId(e.target.value); setImportStatus('idle') }}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-500">表示名</label>
                  <input
                    type="text"
                    value={importLabel}
                    onChange={(e) => { setImportLabel(e.target.value); setImportStatus('idle') }}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-500">自宅からの徒歩時間（分）</label>
                  <input
                    type="number"
                    min={0}
                    value={importWalking}
                    onChange={(e) => setImportWalking(e.target.value)}
                    className="w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                  />
                </div>

                {importStatus === 'error' && importError && (
                  <p className="whitespace-pre-wrap text-xs text-red-500">{importError}</p>
                )}
                {importStatus === 'success' && (
                  <p className="text-xs text-green-600">取得・登録が完了しました</p>
                )}

                <button
                  onClick={handleImport}
                  disabled={importStatus === 'loading'}
                  className="w-full rounded-lg bg-blue-500 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                >
                  {importStatus === 'loading' ? '時刻表を取得中…' : '時刻表を取得して追加'}
                </button>
              </div>
            )}
          </section>

          <hr className="border-slate-100" />

          {/* ── 手動でCSVを追加 ── */}
          <section>
            <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
              手動で追加
            </h3>
            <p className="mb-3 text-xs text-slate-400">
              すでに <code className="rounded bg-slate-100 px-1">data/</code> にCSVがある場合はIDを直接入力してください。
            </p>
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-xs text-slate-500">
                  ファイルID（data/ フォルダ内のCSV名）
                </label>
                <input
                  type="text"
                  placeholder="例: hiratsuka-tokaido-inbound"
                  value={manualForm.id}
                  onChange={(e) => setManualForm({ ...manualForm, id: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">表示名</label>
                <input
                  type="text"
                  placeholder="例: 平塚 東海道線 上り"
                  value={manualForm.label}
                  onChange={(e) => setManualForm({ ...manualForm, label: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">自宅からの徒歩時間（分）</label>
                <input
                  type="number"
                  min={0}
                  value={manualForm.walkingMinutes}
                  onChange={(e) => setManualForm({ ...manualForm, walkingMinutes: e.target.value })}
                  className="w-24 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                />
              </div>

              {manualError && (
                <p className="text-xs text-red-500">{manualError}</p>
              )}

              <button
                onClick={handleManualAdd}
                className="w-full rounded-lg bg-slate-700 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                追加
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
