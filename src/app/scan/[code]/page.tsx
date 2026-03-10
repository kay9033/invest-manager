"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface StockDetail {
  code: string;
  name: string;
  market: string | null;
  sales: number | null;
  salesGrowthRate: number | null;
  eps: number | null;
  epsGrowthRate: number | null;
  marketCap: number | null;
}

interface ScanDetail {
  scanDate: string;
  closePrice: number | null;
  volume: number | null;
  tradingValue: number | null;
  score: number | null;
  passed: boolean | null;
  reasons: string[];
  rs3m: number | null;
  rs6m: number | null;
}

interface DetailResponse {
  stock: StockDetail;
  scan: ScanDetail | null;
}

export default function ScanDetailPage() {
  const { code } = useParams<{ code: string }>();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/scan/${code}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<DetailResponse>;
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [code]);

  if (loading) return <p className="text-gray-400">読み込み中...</p>;
  if (error) return <p className="text-red-400">エラー: {error}</p>;
  if (!data) return null;

  const { stock, scan } = data;
  const kabutanUrl = `https://kabutan.jp/stock/?code=${code}`;

  const passedReasons = scan?.reasons.filter((r) => !r.includes("注意") && !r.includes("なし") && !r.includes("劣位") && !r.includes("減少") && !r.includes("減益") && !r.includes("減収")) ?? [];
  const warnReasons = scan?.reasons.filter((r) => r.includes("注意") || r.includes("なし") || r.includes("劣位") || r.includes("減少") || r.includes("減益") || r.includes("減収")) ?? [];

  return (
    <div className="space-y-6 max-w-2xl">
      {/* ヘッダー */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{stock.name}</h1>
            <span className="font-mono text-gray-400">{stock.code}</span>
            {stock.market && (
              <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
                {stock.market}
              </span>
            )}
          </div>
          {scan && (
            <p className="mt-1 text-sm text-gray-500">スキャン日: {scan.scanDate}</p>
          )}
        </div>
        <div className="flex gap-2">
          <a
            href={kabutanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg transition-colors"
          >
            カブタンで見る →
          </a>
          <a href="/scan" className="text-sm text-gray-500 hover:text-white self-center ml-2">
            ← 戻る
          </a>
        </div>
      </div>

      {/* スコア */}
      {scan && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">フィルター結果</h2>
            <div className="flex items-center gap-3">
              <span
                className={`text-sm font-medium px-2.5 py-1 rounded-full ${
                  scan.passed
                    ? "bg-emerald-900/50 text-emerald-400 border border-emerald-800"
                    : "bg-red-900/50 text-red-400 border border-red-800"
                }`}
              >
                {scan.passed ? "通過" : "不通過"}
              </span>
              <span className="text-2xl font-bold text-white">
                {scan.score ?? "-"}
                <span className="text-sm text-gray-500 font-normal"> / 100</span>
              </span>
            </div>
          </div>

          {/* スコアバー */}
          {scan.score != null && (
            <div className="w-full bg-gray-800 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  scan.score >= 70 ? "bg-emerald-500" : scan.score >= 40 ? "bg-yellow-500" : "bg-red-500"
                }`}
                style={{ width: `${scan.score}%` }}
              />
            </div>
          )}

          {/* 判定理由 */}
          <div className="space-y-2">
            {passedReasons.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="text-emerald-400 mt-0.5 shrink-0">✓</span>
                <span className="text-gray-300">{r}</span>
              </div>
            ))}
            {warnReasons.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="text-amber-400 mt-0.5 shrink-0">!</span>
                <span className="text-gray-400">{r}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 基本情報 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-white mb-4">基本情報</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt className="text-gray-500">株価</dt>
            <dd className="text-white font-medium">
              {scan?.closePrice != null ? `${scan.closePrice.toLocaleString()}円` : "-"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">売買代金</dt>
            <dd className="text-white font-medium">
              {scan?.tradingValue != null
                ? `${(scan.tradingValue / 1e8).toFixed(1)}億円`
                : "-"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">時価総額</dt>
            <dd className="text-white font-medium">
              {stock.marketCap != null ? `${(stock.marketCap / 1e8).toFixed(0)}億円` : "-"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">EPS成長率</dt>
            <dd className="text-white font-medium">
              {stock.epsGrowthRate != null ? `${stock.epsGrowthRate.toFixed(1)}%` : "-"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">売上成長率</dt>
            <dd className="text-white font-medium">
              {stock.salesGrowthRate != null ? `${stock.salesGrowthRate.toFixed(1)}%` : "-"}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">RS (TOPIX比)</dt>
            <dd className="text-white font-medium">
              {scan?.rs3m != null ? (
                <span>
                  3M: <span className={scan.rs3m >= 0 ? "text-emerald-400" : "text-red-400"}>
                    {scan.rs3m > 0 ? "+" : ""}{scan.rs3m.toFixed(1)}%
                  </span>
                  {scan.rs6m != null && (
                    <>
                      {" / "}6M:{" "}
                      <span className={scan.rs6m >= 0 ? "text-emerald-400" : "text-red-400"}>
                        {scan.rs6m > 0 ? "+" : ""}{scan.rs6m.toFixed(1)}%
                      </span>
                    </>
                  )}
                </span>
              ) : "-"}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
