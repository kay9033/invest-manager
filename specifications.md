# 詳細仕様書 — Stock Pioneer

## 1. 技術スタック

| 分類 | 技術 |
|------|------|
| Runtime | Node.js / TypeScript |
| Framework | Next.js 16 (App Router) |
| Database | SQLite (better-sqlite3) + Drizzle ORM |
| Scraping | Playwright (headless Chromium) |
| Styling | Tailwind CSS v4 |
| AI判定 | Anthropic Claude API (`claude-sonnet-4-6`) + `web_search_20260209` (beta) |

---

## 2. データベース設計

DBパス: `data/stock-pioneer.db`

### stocks テーブル
銘柄マスタ。スキャン実行時にupsertされる。

| カラム | 型 | 説明 |
|--------|-----|------|
| code | TEXT (PK) | 銘柄コード |
| name | TEXT | 社名 |
| market | TEXT | 市場区分（東P / 東S / 東G 等） |
| sales | REAL | 直近期売上高（百万円） |
| sales_growth_rate | REAL | 売上成長率（%） |
| eps | REAL | 直近期EPS（円） |
| eps_growth_rate | REAL | EPS成長率（%） |
| market_cap | REAL | 時価総額（円） |
| roe | REAL | ROE（%） |
| margin_ratio | REAL | 信用倍率（倍） |
| has_upward_revision | INTEGER(bool) | 直近上方修正あり |
| eps_accelerating | INTEGER(bool) | EPS加速中 |
| sales_accelerating | INTEGER(bool) | 売上加速中 |
| operating_margin_improving | INTEGER(bool) | 営業利益率改善傾向 |
| has_institutional_increase | INTEGER(bool) | 機関投資家増加あり |
| annual_eps_growths | TEXT | 年次EPS成長率配列（JSON） |
| created_at / updated_at | TEXT | タイムスタンプ |

### scans テーブル
スキャン実行結果。同日に再実行すると上書き（DELETE→INSERT）。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | INTEGER (PK) | 自動採番 |
| code | TEXT | 銘柄コード（stocks FK） |
| scan_date | TEXT | スキャン日（YYYY-MM-DD） |
| close_price | REAL | 終値（円） |
| volume | REAL | 当日出来高（株） |
| avg_volume_25 | REAL | 25日平均出来高（株） |
| is_new_high | INTEGER(bool) | 新高値フラグ（常にtrue） |
| volume_ratio | REAL | 出来高比率（%）※通常null、volume/avgVolume25で計算 |
| trading_value | REAL | 売買代金（円） |
| rs3m | REAL | TOPIX比3ヶ月相対強度（%） |
| rs6m | REAL | TOPIX比6ヶ月相対強度（%） |
| score | INTEGER | フィルタースコア（0-100） |
| reasons | TEXT | フィルター理由配列（JSON） |
| passed | INTEGER(bool) | 必須条件通過フラグ |
| created_at | TEXT | タイムスタンプ |

### watchlist テーブル
監視リスト。ユーザーが手動追加。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | INTEGER (PK) | 自動採番 |
| code | TEXT | 銘柄コード（stocks FK） |
| added_at | TEXT | 追加日時 |
| add_reason | TEXT | 追加理由メモ |
| ai_status | TEXT | AI判定結果（WAITING / BUY / WATCH / SELL） |
| ai_comment | TEXT | AIコメント |
| memo | TEXT | ユーザーメモ |
| updated_at | TEXT | タイムスタンプ |

---

## 3. ディレクトリ構造

```
src/
├── app/
│   ├── page.tsx                    # ダッシュボード
│   ├── scan/
│   │   ├── page.tsx                # スキャン実行・結果一覧
│   │   └── [code]/page.tsx         # スキャン詳細（フィルター結果・取得データ確認）
│   ├── watchlist/
│   │   └── page.tsx                # 監視リスト
│   ├── rules/
│   │   ├── page.tsx                # ルールインデックス
│   │   ├── list/page.tsx           # リストアップルール
│   │   ├── trading/page.tsx        # 売買ルール
│   │   └── components.tsx          # 共通UIコンポーネント
│   └── api/
│       ├── scan/
│       │   ├── route.ts            # GET: 当日結果取得 / POST: スキャン実行
│       │   ├── progress/route.ts   # SSE: スキャン進捗ストリーム
│       │   └── [code]/route.ts     # GET: 銘柄スキャン詳細
│       ├── watchlist/
│       │   ├── route.ts            # GET: 一覧 / POST: 追加
│       │   └── [id]/route.ts       # PATCH: 更新 / DELETE: 削除
│       └── judge/route.ts          # POST: AI売買判定（Claude API）
├── lib/
│   ├── db/
│   │   ├── schema.ts               # Drizzle スキーマ定義
│   │   └── index.ts                # lazy初期化 SQLite接続
│   ├── scraper/
│   │   └── kabutan.ts              # カブタンスクレイパー（詳細は scraping_spec.md）
│   ├── rules/
│   │   └── filter.ts               # フィルタリング・スコアリングロジック
│   └── ai/
│       └── judge.ts                # Claude API売買判定
└── components/
    ├── StockTable.tsx              # ソート対応汎用テーブル
    └── StatusBadge.tsx             # AI判定バッジ
```

---

## 4. API仕様

### POST /api/scan
スクレイピング実行 → フィルタリング → DB保存。

**レスポンス**
```json
{
  "scanned": 50,
  "passed": 14,
  "results": [...],
  "warnings": [
    { "code": "1234", "name": "銘柄名", "missing": ["EPS成長率", "ROE"] }
  ]
}
```

- `warnings`: 取得できなかったフィールドの一覧（ETF除外済みの銘柄は含まない）

### GET /api/scan
当日のスキャン結果一覧を返す（DBキャッシュ）。

### GET /api/scan/progress
SSEストリーム。スキャン進捗（現在件数・対象銘柄名）をリアルタイム配信。

### GET /api/scan/[code]
銘柄コードのスキャン詳細（stocks + 最新scan レコード）を返す。

### GET/POST /api/watchlist
監視リスト取得・追加。

### PATCH/DELETE /api/watchlist/[id]
監視リストのステータス更新・削除。

### POST /api/judge
Claude APIによるAI売買判定。web_searchで最新ニュースを取得して判定。

---

## 5. フィルタリング・スコアリング仕様

詳細は `list_rules.md` を参照。

**必須条件**（pass/fail、失敗してもスコアリングは継続）:
1. 新高値更新
2. 株価100円以上
3. 売買代金5億円以上
4. 出来高スパイク25日平均比150%以上（データなし時は通過）
5. 年次EPS2期連続マイナス → 除外

**スコアリング**（0〜100点満点）:
- C条件（当期業績）: 最大45pt
- A条件（年間業績）: 最大25pt
- L条件（主導銘柄）: 最大18pt
- S条件（出来高強度ボーナス）: 最大7pt
- I条件（機関投資家）: 最大5pt

---

## 6. ETF・ファンド除外仕様

スクレイピング時に業績テーブル（決算期を含む表）が存在しない銘柄は自動除外。
対象: ETF、商品ファンド、証券化商品等（例: GX超短米債133A、WTI原油1671 等）

---

## 7. 環境変数

```
ANTHROPIC_API_KEY=sk-ant-...   # Claude API（judge機能に必須）
```

---

## 8. 実行コマンド

```bash
npm run dev          # 開発サーバー起動
npm run build        # プロダクションビルド
npx drizzle-kit push # DBスキーマ適用
npx drizzle-kit studio # DB GUIブラウザ
```
