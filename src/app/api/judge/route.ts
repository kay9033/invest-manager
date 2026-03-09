import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { watchlist, stocks, scans } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { judgeStock, StockJudgeInput } from "@/lib/ai/judge";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { watchlistId?: number };
    const { watchlistId } = body;

    if (!watchlistId) {
      return NextResponse.json(
        { error: "watchlistIdは必須です" },
        { status: 400 }
      );
    }

    // watchlistとstocksを結合して取得
    const wlItem = db
      .select({
        id: watchlist.id,
        code: watchlist.code,
        name: stocks.name,
        salesGrowthRate: stocks.salesGrowthRate,
        epsGrowthRate: stocks.epsGrowthRate,
        marketCap: stocks.marketCap,
      })
      .from(watchlist)
      .leftJoin(stocks, eq(watchlist.code, stocks.code))
      .where(eq(watchlist.id, watchlistId))
      .get();

    if (!wlItem) {
      return NextResponse.json(
        { error: "監視リストのレコードが見つかりません" },
        { status: 404 }
      );
    }

    // 最新のスキャンデータを取得
    const latestScan = db
      .select()
      .from(scans)
      .where(eq(scans.code, wlItem.code))
      .orderBy(desc(scans.createdAt))
      .limit(1)
      .get();

    const judgeInput: StockJudgeInput = {
      code: wlItem.code,
      name: wlItem.name ?? wlItem.code,
      closePrice: latestScan?.closePrice ?? null,
      volume: latestScan?.volume ?? null,
      avgVolume25: latestScan?.avgVolume25 ?? null,
      tradingValue: latestScan?.tradingValue ?? null,
      epsGrowthRate: wlItem.epsGrowthRate ?? null,
      salesGrowthRate: wlItem.salesGrowthRate ?? null,
      marketCap: wlItem.marketCap ?? null,
      volumeRatio: latestScan?.volumeRatio ?? null,
      rs3m: latestScan?.rs3m ?? null,
      rs6m: latestScan?.rs6m ?? null,
      isNewHigh: latestScan?.isNewHigh ?? true,
    };

    const judgeResult = await judgeStock(judgeInput);

    // 結果をDBに保存
    db.update(watchlist)
      .set({
        aiStatus: judgeResult.status,
        aiComment: `[${judgeResult.confidence}%] ${judgeResult.reason}`,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(watchlist.id, watchlistId))
      .run();

    return NextResponse.json({
      watchlistId,
      code: wlItem.code,
      ...judgeResult,
    });
  } catch (err) {
    console.error("[POST /api/judge]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "AI判定に失敗しました",
      },
      { status: 500 }
    );
  }
}
