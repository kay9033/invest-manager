仕様(specifications.md)

# 詳細仕様書

## 1. 技術スタック

- **Runtime**: Node.js / TypeScript
- **Framework**: Next.js (App Router)
- **Database**: SQLite (better-sqlite3)
- **ORM**: Prisma または Drizzle ORM (任意)
- **Scraping**: Playwright
- **Styling**: Tailwind CSS

## 2. データベース設計 (SQLite)

- **stocksテーブル**: 銘柄コード(PK)、社名、市場、業績データ（売上、利益など）
- **scansテーブル**: ID(PK)、コード、スキャン日、終値、出来高、新高値フラグ
- **watchlistテーブル**: ID(PK)、コード、追加理由、AI判定ステータス（待ち/買い/売り）、メモ

## 3. ディレクトリ構造

/src
/app # Next.js pages & API
/lib
/db # SQLite connection & schemas
/scraper # Playwright scripts for Kabutan
/rules # Logic for numerical filtering
/ai # AI prompt logic & MCP integration
/components # UI components (Dashboard)

## 4. フェーズ別実装計画

- **Phase 1**: プロジェクト初期化とカブタンからのリスト取得・DB保存。
- **Phase 2**: 数値フィルタリングの実装とダッシュボード画面の作成。
- **Phase 3**: チャート画像/ニュース解析によるAI売買判定の実装。
