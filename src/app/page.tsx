import Link from "next/link";
import db from "@/lib/db";
import { scans, watchlist } from "@/lib/db/schema";
import { sql, eq } from "drizzle-orm";

async function getStats() {
  try {
    const today = new Date().toISOString().split("T")[0];

    const scanCount = db
      .select({ count: sql<number>`count(*)` })
      .from(scans)
      .where(eq(scans.scanDate, today))
      .get();

    const watchCount = db
      .select({ count: sql<number>`count(*)` })
      .from(watchlist)
      .get();

    return {
      todayScanCount: scanCount?.count ?? 0,
      watchlistCount: watchCount?.count ?? 0,
    };
  } catch {
    return { todayScanCount: 0, watchlistCount: 0 };
  }
}

export default async function HomePage() {
  const stats = await getStats();

  return (
    <div className="space-y-8">
      {/* ヘッダー */}
      <header className="border-b border-gray-800 pb-6">
        <h1 className="text-3xl font-bold text-emerald-400 tracking-tight">
          Stock Pioneer
        </h1>
        <p className="mt-1 text-gray-400 text-sm">
          AI投資アシスタント — 新高値銘柄スクリーニング
        </p>
      </header>

      {/* サマリーカード */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            本日のスキャン銘柄数
          </p>
          <p className="mt-2 text-4xl font-bold text-white">
            {stats.todayScanCount}
          </p>
          <p className="mt-1 text-xs text-gray-500">件</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            監視リスト
          </p>
          <p className="mt-2 text-4xl font-bold text-white">
            {stats.watchlistCount}
          </p>
          <p className="mt-1 text-xs text-gray-500">銘柄</p>
        </div>
      </section>

      {/* ナビゲーション */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/scan"
          className="group bg-gray-900 border border-gray-800 hover:border-emerald-500 rounded-xl p-6 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white group-hover:text-emerald-400 transition-colors">
                スキャン実行
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                カブタン新高値銘柄を取得してフィルタリング
              </p>
            </div>
            <span className="text-2xl">→</span>
          </div>
        </Link>

        <Link
          href="/watchlist"
          className="group bg-gray-900 border border-gray-800 hover:border-emerald-500 rounded-xl p-6 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white group-hover:text-emerald-400 transition-colors">
                監視リスト
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                AI売買判定・メモ管理
              </p>
            </div>
            <span className="text-2xl">→</span>
          </div>
        </Link>
      </section>

      {/* フッター */}
      <footer className="text-center text-xs text-gray-600 pt-4 border-t border-gray-800">
        Stock Pioneer — ローカル完結型投資アシスタント
      </footer>
    </div>
  );
}
