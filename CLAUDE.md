# プロジェクト: Stock Pioneer

## 技術スタック

- フロントエンド: Next.js (App Router), Tailwind CSS
- データベース: SQLite (better-sqlite3)
- スクレイピング: Playwright
- 言語: TypeScript / Node.js

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

## 実行コマンド

- ビルド: npm run build
- 開発用: npm run dev
- テスト: npm test
- DB更新: npx drizzle-kit push

## Git 運用

- 言語: 日本語
- 頻度: 機能・修正単位でこまめにコミット。
- 形式: feat: 内容, fix: 内容, docs: 内容
