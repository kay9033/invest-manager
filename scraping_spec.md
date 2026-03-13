# スクレイピング仕様書

スクレイパー実装: `src/lib/scraper/kabutan.ts`

---

## 1. 処理フロー概要

```
scrapeKabutan()
  │
  ├─ 1. TOPIX月足データ取得（RS計算の基準値）
  │     └─ scrapeMonthlyPrices(browser, "0000")
  │
  ├─ 2. カブタン52週高値一覧ページ取得（全ページ）
  │     └─ scrapeListPage(browser, pageNum)  ← ページネーションが尽きるまで再帰
  │
  └─ 3. 各銘柄を5件並列で詳細取得（500ms間隔）
        ├─ scrapeStockDetail(browser, code)   ← 個別ページ + 日足ページ
        ├─ scrapeFinance(browser, code)        ← 財務ページ
        ├─ scrapeMonthlyPrices(browser, code)  ← 月足ページ（RS計算用）
        └─ scrapeInstitutionalIncrease(browser, code)  ← IRBANK
```

---

## 2. 取得元URL一覧

| データ | URL |
|--------|-----|
| 52週高値一覧 | `https://kabutan.jp/warning/record_w52_high_price?page=N&pagecount=50` |
| 個別ページ（出来高・業績） | `https://kabutan.jp/stock/?code=XXXX` |
| 日足ページ（25日平均出来高） | `https://kabutan.jp/stock/kabuka?code=XXXX&ashi=day` |
| 財務ページ（ROE・年次EPS等） | `https://kabutan.jp/stock/finance?code=XXXX` |
| 月足ページ（RS計算用） | `https://kabutan.jp/stock/kabuka?code=XXXX&ashi=month` |
| IRBANK大量保有報告 | `https://irbank.net/XXXX/bigs` |

---

## 3. 取得データ詳細

### 3-1. 52週高値一覧（scrapeListPage）

**URL**: `https://kabutan.jp/warning/record_w52_high_price?pagecount=50&page=N`

| フィールド | 取得方法 |
|-----------|---------|
| code | テーブル列「コード」 |
| name | テーブル列「銘柄名」 |
| market | テーブル列「市場」 |
| closePrice | テーブル列「株価」（カンマ除去してparseFloat） |

- ページネーション: 「次のページ」リンクが存在する限り再帰取得
- ETF判定はこの段階では行わない（個別ページで判定）

---

### 3-2. 個別ページ（scrapeStockDetail）

**URL**: `https://kabutan.jp/stock/?code=XXXX`

#### 出来高・売買代金（table[4]）

| フィールド | th テキスト | 単位変換 |
|-----------|------------|---------|
| volume | 「出来高」 | 「株」「,」を除去 |
| tradingValue | 「売買代金」 | 百万円 × 1,000,000 または 億円 × 100,000,000 |
| marketCap | 「時価総額」 | 「兆」「億」「万」を加味して円換算 |

- 「－」は null として扱う

#### 業績（決算期テーブル）

- 「決算期」thを含むテーブルを検索
- データ行判定: `"I"`, `"連"`, `"単"` で始まる、または年号パターン `\d{4}\.\d{2}` を含み、「予」を含まない行
- カラム構成（0-indexed）:

| index | データ |
|-------|--------|
| 0 | 売上高（百万円） |
| 1 | 経常益 |
| 2 | 最終益 |
| 3 | 1株益（EPS） |
| 4 | 1株配 |
| 5 | 発表日 |

- `前期比(%)` 行からsalesGrowthRate（index[0]）、epsGrowthRate（index[3]）を取得
- `前期比` が「赤転」「赤縮」「黒転」「－」等の場合、最新2期のデータ行から直接計算:
  `growthRate = (curr - prev) / |prev| × 100`

#### 信用倍率（PER/PBR/信用倍率テーブル）

- `thead th` から「信用倍率」の列インデックスを特定
- `tbody tr:first-child` の同インデックスの `td` から取得
- 「倍」を除去してparseFloat

#### ETF判定

- 業績テーブル（決算期を含む表）が存在しない場合 → `hasBizData = false`
- `hasBizData = false` の銘柄はスキャン対象から除外（scrapeKabutan内でスキップ）

---

### 3-3. 日足ページ（scrapeStockDetail内）

**URL**: `https://kabutan.jp/stock/kabuka?code=XXXX&ashi=day`

個別ページ取得後、同一browserContextで別ページとして開く。

| フィールド | 取得方法 |
|-----------|---------|
| avgVolume25 | 直近25日分の売買高を平均 |

**テーブル選択ロジック**:
1. `thead tr` のみからヘッダーを取得（tbody内の日付thを除外）
2. 「日付」と「売買高」の両方を含むテーブルを選択
3. 「売買高」の列インデックス（volIdx）を特定
4. tbody各行の `td[volIdx - 1]` を取得（日付列がthのため1つずれる）
5. 25行分を取得し20件以上あれば平均を計算

- 403エラー時はcatchして`avgVolume25 = null`のまま継続（ログ出力あり）
- 有効データが20件未満の場合もnull

---

### 3-4. 財務ページ（scrapeFinance）

**URL**: `https://kabutan.jp/stock/finance?code=XXXX`

#### 年次業績テーブル（「修正1株益」列を持つテーブル）

データ行判定: `isDataRow(label)` — `"単"`, `"連"`, `"I"` を含む、または `\d{4}\.\d{2}` にマッチし「予」を含まない

| index | データ |
|-------|--------|
| 0 | 売上高 |
| 1 | 営業益 |
| 2 | 経常益 |
| 3 | 最終益 |
| 4 | 修正1株益（EPS） |

- `annualEps[]` と `annualSales[]` を構築
- `epsAccelerating`: 直近の成長率が前期を上回るか
- `salesAccelerating`: 同上（売上）
- `annualEpsGrowths[]`: 前期比EPS成長率の配列（連続何期分か）
- `operatingMarginImproving`: 直近期の営業利益率 > 前期

#### 業績修正テーブル（「修正方向」列を持つテーブル）

- 「上」を含むセルが存在 → `hasUpwardRevision = true`

#### 経営指標テーブル（「ROE」列を持つテーブル）

- `th.textContent.normalize("NFKC")` で全角→半角変換（例: ＲＯＥ → ROE）
- `roeIdx = headers.findIndex(h => h.includes("ROE")) - 1`（日付thの分-1）
- 直近実績行（最後のisDataRow）の `td[roeIdx]` からROEを取得

---

### 3-5. 月足ページ（scrapeMonthlyPrices）

**URL**: `https://kabutan.jp/stock/kabuka?code=XXXX&ashi=month`

- 月足テーブルから直近24ヶ月分の終値を取得
- 相対強度（RS）計算:
  - `stock3m = (現在値 / 3ヶ月前値 - 1) × 100`
  - `topix3m` = TOPIXの同期間騰落率
  - `rs3m = stock3m - topix3m`（超過リターン）

---

### 3-6. IRBANK大量保有報告（scrapeInstitutionalIncrease）

**URL**: `https://irbank.net/XXXX/bigs`

- 直近6ヶ月以内の報告書を確認
- 「増加」または「新規取得」の報告が存在する → `hasInstitutionalIncrease = true`
- 存在しない → `false`
- ページ取得失敗時 → `null`

---

## 4. 並列処理・レート制限

```
for (chunks of 5件ずつ):
  Promise.all([
    Promise.all(5件のscrapeStockDetail),  // 各銘柄: 個別ページ + 日足ページ
    Promise.all(5件のscrapeFinance),
    Promise.all(5件のscrapeMonthlyPrices),
    Promise.all(5件のscrapeInstitutionalIncrease),
  ])
  await sleep(500ms)  // チャンク間の待機
```

- 各関数は独立した `browserContext`（User-Agent設定済み）を作成・破棄
- User-Agent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36`

---

## 5. エラーハンドリング

| エラーケース | 挙動 |
|------------|------|
| ページ取得失敗（timeout/403） | null値を返す（スキャンは継続） |
| 日足403エラー | `[avgVolume25] XXXX: エラー内容` をログ出力 |
| 業績テーブルなし（ETF等） | `hasBizData=false` → スキャン除外 |
| 前期比が文字列（赤転等） | データ行から直接計算するフォールバック |
| scrapeStockDetail例外 | 全フィールドnullで返却（スキャンは継続） |

---

## 6. スキャン実行の進捗（SSE）

`GET /api/scan/progress` でServer-Sent Eventsを配信。

```json
{
  "total": 80,
  "current": 25,
  "currentCode": "4031",
  "currentName": "片倉コープ",
  "isScanning": true
}
```

スキャン完了後に `isScanning: false` を送信。
