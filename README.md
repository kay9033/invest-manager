# Stock Pioneer

個人投資家向けのローカル完結型AI投資アシスタント。カブタンの52週高値更新銘柄をスクレイピングし、独自ルールでフィルタリング。監視リストに保存した銘柄をClaude AIがリアルタイムのニュースを調べながら売買判定する。

## 技術スタック

| 分類 | 技術 |
|---|---|
| フレームワーク | Next.js 16 (App Router) |
| 言語 | TypeScript |
| DB | SQLite (better-sqlite3 + Drizzle ORM) |
| スクレイピング | Playwright |
| AI | Claude API (`claude-sonnet-4-6`) + web_search ツール |
| スタイル | Tailwind CSS v4 |

## セットアップ

```bash
npm install
npx playwright install chromium
npx drizzle-kit push
```

`.env.local` を編集してAPIキーを設定:

```
ANTHROPIC_API_KEY=sk-ant-...    # 必須
BRAVE_API_KEY=...                # 任意（Claude Code用Brave Search MCP）
```

```bash
npm run dev
# → http://localhost:3000
```

## 画面構成

```
/           ダッシュボード（スキャン件数・監視リスト件数の概要）
/scan       スキャン実行・フィルター結果確認・監視リスト追加
/watchlist  監視銘柄管理・AI売買判定実行・メモ編集
```

## 機能フロー

```
1. スキャン実行（/scan）
   └─ カブタン 52週高値更新ページを全ページ取得（Playwright）
   └─ 各銘柄の個別ページから出来高・売買代金・業績データを取得
   └─ フィルタリング・スコアリング実施
   └─ DBに保存（stocks / scans テーブル）

2. 監視リストに追加
   └─ フィルター通過銘柄を watchlist テーブルに登録

3. AI売買判定（/watchlist）
   └─ Claude API に銘柄データを渡す
   └─ web_search ツールで最新ニュースを自動検索（最大3回）
   └─ BUY / WATCH / SELL とその理由・確信度をDBに保存
```

## フィルタリングロジック

`src/lib/rules/filter.ts` に実装。

### 必須通過条件（NG で即脱落）

| # | 条件 | 基準 |
|---|---|---|
| 1 | 新高値更新 | 52週高値更新フラグが立っていること |
| 2 | 低位株除外 | 株価 100円以上 |
| 3 | 流動性確保 | 売買代金 **5億円以上**（データある場合のみ） |
| 4 | 出来高スパイク | 直近25日平均の **150%以上**（データある場合のみ） |

### スコアリング（0〜100点）

| 条件 | 加点 |
|---|---|
| 新高値更新 | +20 |
| 株価100円以上 | +10 |
| 売買代金5億円以上 | +30（データなし時は+15） |
| 売買代金20億円以上 | +5 |
| 売買代金100億円以上 | +10 |
| 出来高スパイク確認 | +20 |
| 出来高300%以上 | +10 |
| EPS成長率25%以上 | +10 |
| 売上成長率20%以上 | +10（CLAUDE.md優先項目） |

## AI売買判定ルール

`src/lib/ai/judge.ts` に実装。Claude APIの `web_search_20260209` ツールを使い、判定時にリアルタイムで最新ニュースを検索する。

### 買い（BUY）

- 抵抗線突破直後 + 出来高スパイク（25日平均比150%以上）
- 大型株: フラットベース・25日線タッチからの反発
- 中小型株: カップウィズハンドル・VCP（ボラティリティ収束）パターン
- 上方修正・増配・自社株買いなどポジティブ材料あり

### 押し目待ち（WATCH）

- 5%以上乖離 → 押し目を待つ
- 新高値圏でのもみ合い → 上昇準備期間として継続監視

### 売り（SELL）

- 終値で25日移動平均線を完全に割り込む
- 週足レベルで乖離しすぎ + 出来高異常増 → 半分利確
- 損切りライン: 基本-7%（超大型株は-5%）

## スクレイピング仕様

- **一覧ページ**: `https://kabutan.jp/warning/record_w52_high_price`
  - `pagecount=50` で全ページを再帰取得
  - 取得項目: 銘柄コード・社名・市場・株価

- **個別ページ**: `https://kabutan.jp/stock/?code=XXXX`
  - 取得項目: 出来高・売買代金（百万円単位）・時価総額・EPS・売上成長率
  - 並列5件ずつ取得（500ms間隔）

## DBスキーマ

```
stocks      銘柄マスタ（コード・社名・市場・EPS・売上・成長率・時価総額）
scans       スキャン結果（日付・株価・出来高・売買代金・新高値フラグ）
watchlist   監視リスト（AIステータス・判定コメント・確信度・メモ）
```

## Claude Code MCP設定

`.mcp.json` にBrave Search MCPを設定済み。`BRAVE_API_KEY` を `.env.local` に設定するとClaude Codeでのウェブ検索が有効になる。

Brave Search APIキー取得: https://brave.com/search/api/

## コマンド

```bash
npm run dev             # 開発サーバー起動
npm run build           # プロダクションビルド
npm run scrape          # 手動スクレイプ実行
npx drizzle-kit push    # DBスキーマ適用
npx drizzle-kit studio  # DB GUI
```
