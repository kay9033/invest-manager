# プロジェクト: Stock Pioneer

## 技術スタック

- フロントエンド: Next.js 16 (App Router), Tailwind CSS v4
- データベース: SQLite (better-sqlite3) + Drizzle ORM
- スクレイピング: Playwright
- AI: Anthropic Claude API (`claude-sonnet-4-6`) + web_search ツール(beta)
- 言語: TypeScript / Node.js

## ディレクトリ構造

```
src/
├── app/
│   ├── page.tsx                   # ダッシュボード
│   ├── scan/page.tsx              # スキャン実行画面
│   ├── watchlist/page.tsx         # 監視リスト画面
│   └── api/
│       ├── scan/route.ts          # POST /api/scan（スクレイプ+フィルタ）
│       ├── watchlist/route.ts     # GET/POST /api/watchlist
│       ├── watchlist/[id]/route.ts # PATCH/DELETE
│       └── judge/route.ts         # POST /api/judge（AI判定）
├── lib/
│   ├── db/schema.ts               # stocks / scans / watchlist テーブル
│   ├── db/index.ts                # lazy初期化 SQLite接続
│   ├── scraper/kabutan.ts         # カブタン52週高値スクレイパー
│   ├── rules/filter.ts            # フィルタリング・スコアリング
│   └── ai/judge.ts                # Claude API売買判定（web_search付き）
└── components/
    ├── StockTable.tsx
    └── StatusBadge.tsx
```

## トークン節約ルール

- 言語: 日本語
- 挨拶・相槌の禁止: 「承知しました」「素晴らしい」等の不要な応答を省き、結論とコードのみ出力。
- 差分出力: ファイル全体ではなく、変更箇所のみを出力。
- 簡潔な回答: 質問には短い文章で回答。
- エラー対応: 原因と修正案を最短で提示。
- 不要な文書作成の禁止: 指示がない限り、解説用 .md ファイル等を新規作成しない。

## 投資判断ルール

- 参照: requirements.md, specifications.md, list_rules.md, trading_rules.md
- 優先項目: 「新高値更新」かつ「売上高成長率 +20% 以上」。
- 検証: 買い判断時は、出来高を伴わない「だまし」の可能性を必ず確認。

## スクレイピング仕様

- 対象URL: `https://kabutan.jp/warning/record_w52_high_price`
- 全ページ取得: `pagecount=50` でページング、ページネーションが尽きるまで再帰取得
- 個別ページ: `https://kabutan.jp/stock/?code=XXXX` から出来高・売買代金・業績データを取得
- 並列数: 5件ずつ並列スクレイプ（サーバー負荷軽減のため500ms待機あり）

## AI判定仕様

- モデル: `claude-sonnet-4-6`
- ツール: `web_search_20260209`（betaヘッダー: `web-search-2025-03-05`）
- 最大検索回数: 3回/銘柄
- 料金目安: $0.03/銘柄（web_search $10/1,000回）

## 環境変数 (.env.local)

```
ANTHROPIC_API_KEY=sk-ant-...   # Claude API（必須）
BRAVE_API_KEY=...               # Brave Search MCP / Claude Code用（任意）
```

## 実行コマンド

- 開発サーバー: `npm run dev`
- ビルド: `npm run build`
- DB初期化: `npx drizzle-kit push`
- DB GUI: `npx drizzle-kit studio`
- 手動スクレイプ: `npm run scrape`

## Git 運用

- 言語: 日本語
- 頻度: 機能・修正単位でこまめにコミット。
- 形式: `feat: 内容`, `fix: 内容`, `docs: 内容`
