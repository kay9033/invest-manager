import Link from "next/link";

export default function RulesIndexPage() {
  return (
    <div className="space-y-6 max-w-xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">投資ルール</h1>
        <Link href="/" className="text-sm text-gray-500 hover:text-white">← ホーム</Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/rules/list"
          className="group bg-gray-900 border border-gray-800 hover:border-emerald-500 rounded-xl p-6 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white group-hover:text-emerald-400 transition-colors">
                銘柄リストアップルール
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                Hard Filters・スコアリング・除外条件
              </p>
            </div>
            <span className="text-2xl text-gray-600 group-hover:text-white transition-colors">→</span>
          </div>
        </Link>

        <Link
          href="/rules/trading"
          className="group bg-gray-900 border border-gray-800 hover:border-emerald-500 rounded-xl p-6 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white group-hover:text-emerald-400 transition-colors">
                売買ルール
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                エントリー・損切り・利確・ポジション管理
              </p>
            </div>
            <span className="text-2xl text-gray-600 group-hover:text-white transition-colors">→</span>
          </div>
        </Link>
      </div>
    </div>
  );
}
