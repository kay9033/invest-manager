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
  roe: number | null;
  marginRatio: number | null;
  hasUpwardRevision: boolean | null;
  epsAccelerating: boolean | null;
  salesAccelerating: boolean | null;
  operatingMarginImproving: boolean | null;
  hasInstitutionalIncrease: boolean | null;
  annualEpsGrowths: number[] | null;
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
  volumeRatio: number | null;
}

interface DetailResponse {
  stock: StockDetail;
  scan: ScanDetail | null;
}

function Val({ v, fmt }: { v: unknown; fmt?: (v: NonNullable<unknown>) => string }) {
  if (v === null || v === undefined) {
    return <span className="text-gray-600 text-xs">未取得</span>;
  }
  if (typeof v === "boolean") {
    return <span className={v ? "text-emerald-400" : "text-gray-400"}>{v ? "あり" : "なし"}</span>;
  }
  return <span className="text-white">{fmt ? fmt(v) : String(v)}</span>;
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

  const positiveReasons = scan?.reasons.filter((r) =>
    !r.includes("注意") && !r.includes("なし") && !r.includes("劣位") &&
    !r.includes("減少") && !r.includes("減益") && !r.includes("減収") &&
    !r.includes("データなし")
  ) ?? [];
  const warnReasons = scan?.reasons.filter((r) =>
    r.includes("注意") || r.includes("劣位") || r.includes("減少") ||
    r.includes("減益") || r.includes("減収")
  ) ?? [];
  const missingReasons = scan?.reasons.filter((r) => r.includes("データなし")) ?? [];

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
          {scan && <p className="mt-1 text-sm text-gray-500">スキャン日: {scan.scanDate}</p>}
        </div>
        <div className="flex items-center gap-3">
          <a
            href={kabutanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg transition-colors"
          >
            カブタンで見る →
          </a>
          <a href="/scan" className="text-sm text-gray-500 hover:text-white">← 戻る</a>
        </div>
      </div>

      {/* フィルター結果 */}
      {scan && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">フィルター結果</h2>
            <div className="flex items-center gap-3">
              <span className={`text-sm font-medium px-2.5 py-1 rounded-full ${
                scan.passed
                  ? "bg-emerald-900/50 text-emerald-400 border border-emerald-800"
                  : "bg-red-900/50 text-red-400 border border-red-800"
              }`}>
                {scan.passed ? "通過" : "不通過"}
              </span>
              <span className="text-2xl font-bold text-white">
                {scan.score ?? "-"}
                <span className="text-sm text-gray-500 font-normal"> / 100</span>
              </span>
            </div>
          </div>

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

          <div className="space-y-1.5">
            {positiveReasons.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="text-emerald-400 mt-0.5 shrink-0">✓</span>
                <span className="text-gray-200">{r}</span>
              </div>
            ))}
            {warnReasons.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="text-amber-400 mt-0.5 shrink-0">!</span>
                <span className="text-gray-400">{r}</span>
              </div>
            ))}
            {missingReasons.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="text-gray-600 mt-0.5 shrink-0">?</span>
                <span className="text-gray-600">{r}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* スクレイピングデータ確認 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold text-white">
          取得データ確認
          <span className="ml-2 text-xs text-gray-500 font-normal">「未取得」はスクレイピング失敗または非対応</span>
        </h2>

        <div className="space-y-3">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">価格・流動性</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Row label="株価" v={scan?.closePrice} fmt={(v) => `${(v as number).toLocaleString()}円`} />
            <Row label="売買代金" v={scan?.tradingValue} fmt={(v) => `${((v as number) / 1e8).toFixed(1)}億円`} />
            <Row label="出来高比率(25日)" v={scan?.volumeRatio} fmt={(v) => `${(v as number).toFixed(0)}%`} />
            <Row label="時価総額" v={stock.marketCap} fmt={(v) => `${((v as number) / 1e8).toFixed(0)}億円`} />
          </div>

          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium pt-2">業績（C/A条件）</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Row label="EPS成長率" v={stock.epsGrowthRate} fmt={(v) => `${(v as number).toFixed(1)}%`} />
            <Row label="EPS加速" v={stock.epsAccelerating} />
            <Row label="売上成長率" v={stock.salesGrowthRate} fmt={(v) => `${(v as number).toFixed(1)}%`} />
            <Row label="売上加速" v={stock.salesAccelerating} />
            <Row label="ROE" v={stock.roe} fmt={(v) => `${(v as number).toFixed(1)}%`} />
            <Row label="営業利益率改善" v={stock.operatingMarginImproving} />
            <Row label="上方修正" v={stock.hasUpwardRevision} />
            <div className="col-span-2">
              <span className="text-gray-500">年次EPS成長率:</span>{" "}
              {stock.annualEpsGrowths?.length ? (
                <span className="text-white">
                  {stock.annualEpsGrowths.map((g, i) => (
                    <span key={i} className={g >= 25 ? "text-emerald-400" : g < 0 ? "text-red-400" : "text-gray-300"}>
                      {g > 0 ? "+" : ""}{g.toFixed(1)}%{i < stock.annualEpsGrowths!.length - 1 ? " → " : ""}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="text-gray-600 text-xs">未取得</span>
              )}
            </div>
          </div>

          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium pt-2">市場優位性（L/I条件）</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Row label="RS 3ヶ月(TOPIX比)" v={scan?.rs3m} fmt={(v) => `${(v as number) > 0 ? "+" : ""}${(v as number).toFixed(1)}%`} />
            <Row label="RS 6ヶ月(TOPIX比)" v={scan?.rs6m} fmt={(v) => `${(v as number) > 0 ? "+" : ""}${(v as number).toFixed(1)}%`} />
            <Row label="信用倍率" v={stock.marginRatio} fmt={(v) => `${(v as number).toFixed(2)}倍`} />
            <Row label="大株主増加(IRBANK)" v={stock.hasInstitutionalIncrease} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, v, fmt }: { label: string; v: unknown; fmt?: (v: NonNullable<unknown>) => string }) {
  return (
    <div>
      <span className="text-gray-500">{label}: </span>
      <Val v={v} fmt={fmt} />
    </div>
  );
}
