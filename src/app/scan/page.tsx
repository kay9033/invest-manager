"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import StockTable, { StockColumn } from "@/components/StockTable";

interface ScanResult {
  code: string;
  name: string;
  closePrice: number | null;
  volume: number | null;
  tradingValue: number | null;
  passed: boolean;
  score: number;
  reasons: string[];
}

interface ScanWarning {
  code: string;
  name: string;
  missing: string[];
}

interface ScanResponse {
  scanned: number;
  passed: number;
  results: ScanResult[];
  warnings?: ScanWarning[];
}

type RowData = Record<string, unknown> & ScanResult;

const columns: StockColumn<RowData>[] = [
  { key: "code", label: "コード", sortable: true },
  { key: "name", label: "社名", sortable: false },
  {
    key: "closePrice",
    label: "株価",
    sortable: true,
    align: "right",
    render: (v) =>
      v !== null ? `${(v as number).toLocaleString()}円` : "-",
  },
  {
    key: "volume",
    label: "出来高",
    sortable: true,
    align: "right",
    render: (v) =>
      v !== null ? (v as number).toLocaleString() : "-",
  },
  {
    key: "tradingValue",
    label: "売買代金",
    sortable: true,
    align: "right",
    render: (v) =>
      v !== null
        ? `${((v as number) / 100_000_000).toFixed(1)}億円`
        : "-",
  },
  {
    key: "score",
    label: "スコア",
    sortable: true,
    align: "right",
    render: (v) => `${v}`,
  },
  {
    key: "passed",
    label: "フィルター",
    align: "center",
    render: (v) =>
      v ? (
        <span className="text-emerald-400 font-medium">通過</span>
      ) : (
        <span className="text-red-400">不通過</span>
      ),
  },
];

interface ScanProgressState {
  total: number;
  current: number;
  currentCode: string;
  currentName: string;
  isScanning: boolean;
}

export default function ScanPage() {
  const [loading, setLoading] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ScanProgressState | null>(null);
  const router = useRouter();

  // ページロード時に当日のスキャン結果をDBから復元
  useEffect(() => {
    fetch("/api/scan")
      .then((r) => r.json())
      .then((data: ScanResponse) => {
        if (data.results?.length > 0) setScanResult(data);
      })
      .catch(() => {});
  }, []);

  async function handleScan() {
    setLoading(true);
    setError(null);
    setScanResult(null);
    setProgress(null);

    // SSE で進捗を受信
    const es = new EventSource("/api/scan/progress");
    es.onmessage = (e) => {
      const data = JSON.parse(e.data as string) as ScanProgressState;
      setProgress(data);
      if (!data.isScanning && data.current > 0) es.close();
    };
    es.onerror = () => es.close();

    try {
      const res = await fetch("/api/scan", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? `HTTP ${res.status}`
        );
      }
      const data = (await res.json()) as ScanResponse;
      setScanResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      es.close();
      setLoading(false);
      setProgress(null);
    }
  }


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">スキャン実行</h1>
          <p className="mt-1 text-sm text-gray-400">
            カブタン新高値銘柄をスクレイピングしてフィルタリング
          </p>
        </div>
        <a href="/" className="text-sm text-gray-400 hover:text-white">
          ← ホーム
        </a>
      </div>

      <button
        onClick={handleScan}
        disabled={loading}
        className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
      >
        {loading ? "スキャン中..." : "スキャン実行"}
      </button>

      {loading && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2">
          {progress && progress.total > 0 ? (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">
                  {progress.current} / {progress.total} 件取得中
                  {progress.currentCode && (
                    <span className="ml-2 text-gray-500">
                      — {progress.currentCode} {progress.currentName}
                    </span>
                  )}
                </span>
                <span className="text-emerald-400 font-mono text-xs">
                  {Math.round((progress.current / progress.total) * 100)}%
                </span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-1.5">
                <div
                  className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400 animate-pulse">一覧ページ取得中...</p>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 text-red-300 text-sm">
          エラー: {error}
        </div>
      )}

      {scanResult && (
        <div className="space-y-6">
          {/* 取得失敗警告 */}
          {scanResult.warnings && scanResult.warnings.length > 0 && (
            <details className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
              <summary className="px-4 py-3 text-sm text-yellow-400 cursor-pointer select-none">
                取得失敗: {scanResult.warnings.length}件のデータが未取得（クリックで詳細）
              </summary>
              <div className="px-4 pb-3 max-h-60 overflow-y-auto">
                <table className="w-full text-xs mt-2">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-700">
                      <th className="pb-1 pr-3">コード</th>
                      <th className="pb-1 pr-3">銘柄名</th>
                      <th className="pb-1">未取得フィールド</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scanResult.warnings.map((w) => (
                      <tr key={w.code} className="border-b border-gray-800/50">
                        <td className="py-1 pr-3 text-gray-300 font-mono">{w.code}</td>
                        <td className="py-1 pr-3 text-gray-400">{w.name}</td>
                        <td className="py-1 text-yellow-600">{w.missing.join("、")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          {/* サマリー */}
          <div className="flex gap-6 text-sm">
            <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
              <span className="text-gray-400">スキャン件数: </span>
              <span className="font-bold text-white">
                {scanResult.scanned}
              </span>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
              <span className="text-gray-400">フィルター通過: </span>
              <span className="font-bold text-emerald-400">
                {scanResult.passed}
              </span>
            </div>
          </div>

          {/* 全結果テーブル */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-3">
              全スキャン結果
              <span className="ml-2 text-sm text-gray-500 font-normal">（行クリックで詳細）</span>
            </h2>
            <StockTable
              data={scanResult.results as RowData[]}
              columns={columns}
              emptyMessage="スキャン結果がありません"
              onRowClick={(row) => router.push(`/scan/${row.code}`)}
              defaultSortKey="score"
            />
          </div>
        </div>
      )}
    </div>
  );
}
