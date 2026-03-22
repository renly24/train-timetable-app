# 近場の駅 直近電車案内アプリ — 仕様書

## 1. プロジェクト概要

自宅から最寄り駅までの徒歩時間を考慮し、「今から家を出れば乗れる電車」を直近3本案内するアプリ。
最終的には Amazon Alexa スキルとして音声インターフェースで提供することを目標とし、まず Web MVP を構築する。

---

## 2. ロードマップ

| フェーズ | 内容 |
|---------|------|
| Phase 1 (MVP) | CSVベースの時刻表からブラウザで乗れる次の3本を一覧表示 |
| Phase 2 | Amazon Alexa スキル化 |

---

## 3. 技術スタック

### 3.1 フロントエンド

| 項目 | 選定 | 備考 |
|------|------|------|
| フレームワーク | Next.js 16 (App Router) | 既存環境。Turbopack がデフォルトバンドラー |
| 言語 | TypeScript | 型安全。API レスポンス型をフロント/バック共有 |
| スタイリング | Tailwind CSS v4 | 既存環境 |
| コンポーネント方針 | Server Components デフォルト、`'use client'` で最小限の Client 化 | JS バンドル最小化 |
| 状態管理 | React `useState` / `useEffect` | 外部ライブラリなし。アプリ規模に十分 |
| 設定の永続化 | `localStorage`（カスタムフック） | サーバー不要。駅設定・徒歩時間を保存 |
| データ取得 | `fetch` API + `setInterval`（60秒更新） | 追加ライブラリなし |

### 3.2 バックエンド (API)

| 項目 | 選定 | 備考 |
|------|------|------|
| API フレームワーク | Next.js 16 Route Handlers (`app/api/`) | フロントと同一リポジトリ管理。Alexa からも直接呼出し可能 |
| 言語 | TypeScript | フロントと型共有 |
| CSV 読み込み | Node.js `fs` モジュール（自作パーサー） | 外部ライブラリなし |
| 曜日・時刻処理 | `Date` / `Intl` API | 外部ライブラリなし。JST 固定 |
| サーバーコード保護 | `server-only` パッケージ | `lib/` の CSV 読み込みロジックをクライアントバンドルから除外 |

### 3.3 フロント / バック 分離方針

```
┌──────────────────────────────────────────────────┐
│  フロントエンド (Client / Server Components)      │
│  src/components/  src/hooks/                      │
│       │                                           │
│       │  HTTP GET /api/departures                 │
│       ▼                                           │
│  バックエンド (Route Handlers)                    │
│  src/app/api/departures/route.ts                  │
│       │                                           │
│       │  import                                   │
│       ▼                                           │
│  ビジネスロジック (server-only)                   │
│  src/lib/timetable.ts                             │
│       │                                           │
│       ▼                                           │
│  data/hiratsuka-tokaido-inbound.csv               │
└──────────────────────────────────────────────────┘
         ↑ 同じ API を Alexa (Phase 2) も呼び出す
```

- **フロントエンド** は `/api/departures` エンドポイントのみを参照し、CSV や fs には触れない
- **ビジネスロジック** は `src/lib/` に集約し、`server-only` でクライアントバンドルへの混入を防ぐ
- **型定義** は `src/types/` に置きフロント・バック双方で共有する
- **Alexa (Phase 2)** は同じ `/api/departures` を呼び出すだけで動作する設計とし、バックエンドの変更は不要にする
- 将来的に独立したバックエンドサーバーへ分離する場合も `src/lib/` をそのまま移植できる構造を保つ

### 3.4 型定義（共有）

```typescript
// src/types/timetable.ts

/** 駅・路線設定（localStorage で管理） */
export type StationConfig = {
  id: string;             // CSV ファイル ID
  label: string;          // 表示名
  walkingMinutes: number; // 自宅からの徒歩時間（分）
}

/** GET /api/departures のレスポンス */
export type DeparturesResponse = {
  stationId: string;
  walkingMinutes: number;
  fetchedAt: string;       // ISO8601
  dayType: 'weekday' | 'holiday';
  departures: TrainDeparture[];
}

/** 1本の電車情報 */
export type TrainDeparture = {
  departureTime: string;         // "HH:MM"
  destination: string;           // "東京" | "新宿" | ...
  minutesUntilDeparture: number; // 発車まで残り分数
  minutesToLeaveHome: number;    // 出発余裕（0以下 → 「今すぐ」）
}
```

### 3.5 ディレクトリ構成

```
/
├── data/
│   └── hiratsuka-tokaido-inbound.csv
├── scripts/
│   └── pdf_to_csv.py              # PDF → CSV 変換スクリプト
└── src/
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx               # Server Component（シェル）
    │   └── api/
    │       └── departures/
    │           └── route.ts       # GET /api/departures
    ├── components/
    │   ├── DepartureBoard.tsx     # 発車案内ボード（Client Component・自動更新）
    │   ├── DepartureCard.tsx      # 1件分のカード
    │   ├── StationTabs.tsx        # 駅切り替えタブ
    │   └── SettingsPanel.tsx      # 設定モーダル
    ├── hooks/
    │   └── useStationSettings.ts  # 駅設定の localStorage 読み書き
    ├── lib/
    │   └── timetable.ts           # CSV パース・曜日判定・徒歩フィルタ（server-only）
    └── types/
        └── timetable.ts           # 共有型定義
```

---

## 3. Phase 1 — MVP 仕様

### 3.1 機能要件

| ID | 機能 | 説明 |
|----|------|------|
| F-01 | UI での設定変更 | 画面上の設定パネルから「駅名（表示用）」「路線名（表示用）」「方向（上り/下り）」「徒歩時間（分）」を変更できる。設定は `localStorage` に保存し次回起動時に復元される |
| F-02 | 徒歩時間を考慮した電車絞り込み | 「現在時刻 ＋ 徒歩時間」以降に発車する電車のみを対象とする |
| F-03 | 直近3本の表示 | 乗車可能な電車を発車時刻が近い順に最大3本表示する |
| F-04 | 表示項目 | 発車時刻、行き先（終着駅）、種別（普通/特急など）、「今すぐ出れば間に合う/あと○分で出発」 |
| F-05 | 自動更新 | 60秒ごとに自動的に情報を再取得・再表示する |
| F-06 | 複数駅対応 | UI から複数の駅設定を追加・削除でき、タブで切り替えて表示できる（各駅に対応するCSVファイルが必要） |
| F-07 | 曜日自動判定 | 現在の日付から平日/土休日を自動判定し、対応する時刻表データを使用する |

### 3.2 徒歩時間の考慮ロジック

```
乗車可能条件: 発車時刻 >= 現在時刻 + 徒歩時間（分）

例）現在 14:30、徒歩10分の場合
  → 14:40 以降に発車する電車が対象
  → 14:39 発の電車は「間に合わない」として除外

余裕時間の表示:
  「あと N 分で出発すれば乗れます」
  N = 発車時刻 - 現在時刻 - 徒歩時間
  N = 0 以下 → 「今すぐ出発！」
```

### 3.3 非機能要件

- **レスポンスタイム**: 初回表示 2秒以内
- **モバイル対応**: スマートフォン画面（375px 以上）でも見やすいレイアウト
- **エラー表示**: CSV 読み込み失敗時に「データを取得できませんでした」を表示しリトライボタンを表示する

### 3.4 画面仕様

#### トップページ（`/`）

```
┌─────────────────────────────────┐
│  近場の電車案内          [設定⚙] │
│  最終更新: 14:32:05  [更新]      │
├─────────────────────────────────┤
│  [○○駅 △△線 上り] [□□駅 ▽▽線 下り]  ← タブ
│  徒歩 N分                        │
├─────────────────────────────────┤
│  ┌─────────────────────────────┐ │
│  │  14:40  ○○ 行き             │ │
│  │         普通  今すぐ出発!    │ │  ← 徒歩N分でギリギリ間に合う
│  └─────────────────────────────┘ │
│  ┌─────────────────────────────┐ │
│  │  14:52  ○○ 行き             │ │
│  │         普通  あと12分以内に出発│ │
│  └─────────────────────────────┘ │
│  ┌─────────────────────────────┐ │
│  │  15:01  ○○ 行き             │ │
│  │         特急  あと21分以内に出発│ │
│  └─────────────────────────────┘ │
└─────────────────────────────────┘
```

#### 設定パネル（モーダル）

```
┌─────────────────────────────────┐
│  設定                      [×]  │
├─────────────────────────────────┤
│  駅の追加                        │
│  駅名（表示用）: [________]      │
│  路線名（表示用）:[________]     │
│  方向:           [上り ▼]        │
│  徒歩時間:       [__] 分         │
│  CSVファイルID:  [________]      │  ← data/ 以下のファイル名（拡張子なし）
│                        [追加]    │
├─────────────────────────────────┤
│  登録済みの駅                    │
│  ○○駅 △△線 上り  徒歩N分  [削除] │
│  □□駅 ▽▽線 下り  徒歩M分  [削除] │
└─────────────────────────────────┘
```

### 3.5 データ構造

```typescript
// 駅・路線設定（UIで管理・localsStorageに保存）
type StationConfig = {
  id: string;             // CSV ファイル ID（data/ 以下のファイル名）
  label: string;          // 表示名（例: "○○駅 △△線 上り"）
  walkingMinutes: number; // 自宅から駅までの徒歩時間（分）
};

// 列車情報（Route Handler レスポンス用）
type TrainDeparture = {
  departureTime: string;         // "HH:MM" 形式
  destination: string;           // 行き先（終着駅名）
  trainType: string;             // "普通" | "特急" など
  minutesUntilDeparture: number; // 発車までの残り分数
  minutesToLeaveHome: number;    // 家を出るまでの余裕時間（分）。0以下は「今すぐ出発」
};
```

### 3.6 API 設計

#### `GET /api/departures`

| パラメータ | 型 | 必須 | 説明 |
|----------|----|----|------|
| `stationId` | string | ✓ | CSV ファイル ID（`data/{stationId}.csv` を読み込む） |
| `walkingMinutes` | number | ✓ | 徒歩時間（分）。乗車可能な電車の絞り込みに使用 |
| `limit` | number | — | 取得件数（デフォルト: 3） |

**レスポンス例**
```json
{
  "stationId": "hiratsuka-tokaido-inbound",
  "walkingMinutes": 10,
  "fetchedAt": "2026-03-21T14:30:00+09:00",
  "dayType": "weekday",
  "departures": [
    {
      "departureTime": "14:40",
      "destination": "東京",
      "trainType": "普通",
      "minutesUntilDeparture": 10,
      "minutesToLeaveHome": 0
    },
    {
      "departureTime": "14:52",
      "destination": "東京",
      "trainType": "普通",
      "minutesUntilDeparture": 22,
      "minutesToLeaveHome": 12
    }
  ]
}
```

---

## 4. CSV 時刻表ファイル仕様

### 4.1 配置場所

```
data/
└── {stationId}.csv    例: hiratsuka-tokaido-inbound.csv
```

`data/` ディレクトリはプロジェクトルートに配置し、Route Handler からサーバーサイドで読み込む。

### 4.2 CSVフォーマット

```csv
time,train_type,destination,day_type
05:22,普通,東京,weekday
05:45,普通,東京,weekday
06:01,普通,東京,weekday
06:20,特急 湘南,新宿,weekday
...
06:15,普通,東京,holiday
06:38,普通,東京,holiday
...
```

| カラム | 型 | 説明 |
|--------|----|----|
| `time` | `HH:MM` | 発車時刻（24時間表記） |
| `train_type` | string | 種別（例: `普通`, `特急 湘南`） |
| `destination` | string | 行き先（終着駅名） |
| `day_type` | `weekday` \| `holiday` | 平日 / 土休日 |

### 4.3 曜日判定ルール

| 日付 | 判定 |
|------|------|
| 月〜金（祝日除く） | `weekday` |
| 土・日・祝日 | `holiday` |

曜日判定は Route Handler 側でサーバー時刻をもとに行う。

### 4.4 時刻表の準備方法

JR 東日本などの各社公式サイトから時刻表を手動で収集し CSV に入力する。
ダイヤ改正時は CSV を更新することで対応する。

---

## 5. アーキテクチャ (Phase 1)

```
ブラウザ (Client Component)
  │  自動更新 (60秒ごとに fetch)
  │  駅設定は localStorage に保存・読み込み
  ▼
Next.js Route Handler  (/api/departures)
  │  data/{stationId}.csv を読み込み
  │  + 曜日判定（平日/土休日）
  │  + 徒歩時間フィルタリング
  │  + 余裕時間計算
  ▼
data/{stationId}.csv  （プロジェクト内の静的ファイル）
```

### ファイル構成

```
/
├── data/
│   └── {stationId}.csv           # 駅ごとの時刻表 CSV
├── src/
│   ├── app/
│   │   ├── page.tsx              # トップページ (Server Component)
│   │   ├── layout.tsx
│   │   └── api/
│   │       └── departures/
│   │           └── route.ts      # GET /api/departures（CSV 読み込み・絞り込み）
│   ├── components/
│   │   ├── DepartureBoard.tsx    # 発車案内ボード (Client Component, 自動更新)
│   │   ├── DepartureCard.tsx     # 1件分の表示カード
│   │   ├── StationTabs.tsx       # 駅切り替えタブ
│   │   └── SettingsPanel.tsx     # 設定パネル（駅追加・削除・徒歩時間変更）
│   ├── lib/
│   │   └── timetable.ts          # CSV パース・曜日判定・徒歩フィルタ ユーティリティ
│   └── hooks/
│       └── useStationSettings.ts # 駅設定の localStorage 読み書きフック
```

---

## 6. Phase 2 — Amazon Alexa スキル仕様

### 6.1 概要

Phase 1 の Route Handler (`/api/departures`) を再利用し、Alexa スキルのバックエンドとして接続する。

### 6.2 発話例

| ユーザー発話 | Alexa の応答例 |
|------------|--------------|
| 「電車教えて」 | 「今から家を出ると乗れる電車を案内します。14時40分発 普通 東京行き、今すぐ出発してください。次は14時52分発 普通 東京行き、あと12分以内に出発してください。もう1本は15時1分発 特急 東京行き、あと21分以内に出発してください。」 |
| 「次の電車は？」 | 「今から家を出ると、次は14時40分発 普通 東京行きです。今すぐ出発してください。」 |
| 「まだ時間ある？」 | 「次に乗れる電車は14時40分発 普通です。今すぐ出発してください。」 |

### 6.3 インテント設計

| インテント名 | 説明 |
|------------|------|
| `GetNextTrainsIntent` | 乗れる直近3本を読み上げる |
| `GetNextSingleTrainIntent` | 次の1本だけ読み上げる |
| `GetTimeRemainingIntent` | 家を出るまでの余裕時間を読み上げる |

### 6.4 技術方針

- Alexa Skills Kit Node.js SDK (`ask-sdk-core`) を使用
- バックエンドは AWS Lambda または Next.js の Route Handler を Webhook として利用
- Phase 1 で構築した `/api/departures` API を内部的に呼び出す形で実装

---

## 7. 開発優先順位（Phase 1）

1. **CSV ファイル準備** — 対象駅の時刻表を CSV として用意する
2. **CSV パース + 徒歩フィルタロジック** — `lib/timetable.ts` の実装
3. **Route Handler 実装** — `/api/departures` で CSV 読み込み・絞り込み・レスポンス返却
4. **発車ボード UI** — DepartureCard・DepartureBoard の表示
5. **設定パネル UI** — 駅追加・削除・徒歩時間変更 + localStorage 永続化
6. **自動更新** — 60秒ごとの再フェッチ
7. **エラーハンドリング・ローディング表示** — UX 改善

---

## 8. 将来のデータソース移行（参考）

### ODPT API（公共交通オープンデータセンター）

将来的に CSV 管理を自動化する場合の候補。

- **対応路線**: JR東日本（東海道本線含む）、東京メトロ、東急など首都圏主要路線
- **提供データ**: `StationTimetable`（静的時刻表）、`Train`（リアルタイム位置・遅延）
- **認証**: 無料登録で APIキー取得
- **移行方法**: `lib/timetable.ts` のデータ取得層を CSV 読み込みから ODPT API 呼び出しに差し替えるだけで対応可能な設計とする

---

## 9. 未決事項・確認事項

| 項目 | 状況 |
|------|------|
| CSV 時刻表の整備 | 実装前に対象駅・路線・方向の CSV を用意する必要がある |
| デプロイ先 | Phase 1 はローカル動作確認のみ |
| Alexa スキル公開範囲 | 個人利用（非公開スキル）か公開スキルか未定 |
