import { NextResponse } from "next/server";
import { scrapeKabutan } from "@/lib/scraper/kabutan";
import { filterStock, ScanData } from "@/lib/rules/filter";
import db from "@/lib/db";
import { stocks, scans } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST() {
  try {
    const scraped = await scrapeKabutan();
    const today = new Date().toISOString().split("T")[0];
    const results = [];

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

      // scansテーブルに挿入
      db.insert(scans)
        .values({
          code: item.code,
          scanDate: today,
          closePrice: item.closePrice,
          volume: item.volume,
          tradingValue: item.tradingValue,
          isNewHigh: true,
        })
        .run();

      // フィルタリング実行（個別ページから取得した最新データを優先）
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
      };

      const filterResult = filterStock(scanData);

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
