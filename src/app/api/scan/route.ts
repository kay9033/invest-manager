import { NextResponse } from "next/server";
import { scrapeKabutan } from "@/lib/scraper/kabutan";
import { filterStock, ScanData } from "@/lib/rules/filter";
import db from "@/lib/db";
import { stocks, scans } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const today = new Date().toISOString().split("T")[0];
  const rows = db
    .select({
      code: scans.code,
      name: stocks.name,
      closePrice: scans.closePrice,
      volume: scans.volume,
      tradingValue: scans.tradingValue,
      score: scans.score,
      passed: scans.passed,
      reasons: scans.reasons,
    })
    .from(scans)
    .innerJoin(stocks, eq(scans.code, stocks.code))
    .where(eq(scans.scanDate, today))
    .all();

  const results = rows.map((r) => ({
    ...r,
    reasons: r.reasons ? (JSON.parse(r.reasons) as string[]) : [],
  }));

  return NextResponse.json({
    scanned: results.length,
    passed: results.filter((r) => r.passed).length,
    results,
  });
}

export async function POST() {
  try {
    const scraped = await scrapeKabutan();
    const today = new Date().toISOString().split("T")[0];
    const results = [];

    // 同日の既存スキャン結果を削除して重複を防ぐ
    db.delete(scans).where(eq(scans.scanDate, today)).run();

    for (const item of scraped) {
      // stocksテーブルにupsert
      const existing = db
        .select()
        .from(stocks)
        .where(eq(stocks.code, item.code))
        .get();

      if (!existing) {
        db.insert(stocks)
          .values({
            code: item.code,
            name: item.name,
            market: item.market || null,
          })
          .run();
      }

      // フィルタリング実行（個別ページ・財務ページから取得した最新データを優先）
      const scanData: ScanData = {
        code: item.code,
        name: item.name,
        closePrice: item.closePrice,
        volume: item.volume,
        avgVolume25: null,
        tradingValue: item.tradingValue,
        epsGrowthRate: item.epsGrowthRate ?? existing?.epsGrowthRate ?? null,
        salesGrowthRate: item.salesGrowthRate ?? null,
        isNewHigh: true,
        epsAccelerating: item.epsAccelerating,
        salesAccelerating: item.salesAccelerating,
        hasUpwardRevision: item.hasUpwardRevision,
        roe: item.roe,
        annualEpsGrowths: item.annualEpsGrowths,
        operatingMarginImproving: item.operatingMarginImproving,
        marginRatio: item.marginRatio,
        rs3m: item.rs3m,
        rs6m: item.rs6m,
        hasInstitutionalIncrease: item.hasInstitutionalIncrease,
      };

      const filterResult = filterStock(scanData);

      // scansテーブルに挿入（フィルター結果も保存）
      db.insert(scans)
        .values({
          code: item.code,
          scanDate: today,
          closePrice: item.closePrice,
          volume: item.volume,
          tradingValue: item.tradingValue,
          isNewHigh: true,
          score: filterResult.score,
          reasons: JSON.stringify(filterResult.reasons),
          passed: filterResult.passed,
        })
        .run();

      results.push({
        code: item.code,
        name: item.name,
        closePrice: item.closePrice,
        volume: item.volume,
        tradingValue: item.tradingValue,
        passed: filterResult.passed,
        score: filterResult.score,
        reasons: filterResult.reasons,
      });
    }

    const passed = results.filter((r) => r.passed).length;

    return NextResponse.json({
      scanned: scraped.length,
      passed,
      results,
    });
  } catch (err) {
    console.error("[POST /api/scan]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "スキャンに失敗しました",
      },
      { status: 500 }
    );
  }
}
