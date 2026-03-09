import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { watchlist, stocks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const rows = db
      .select({
        id: watchlist.id,
        code: watchlist.code,
        name: stocks.name,
        addedAt: watchlist.addedAt,
        addReason: watchlist.addReason,
        aiStatus: watchlist.aiStatus,
        aiComment: watchlist.aiComment,
        memo: watchlist.memo,
        updatedAt: watchlist.updatedAt,
      })
      .from(watchlist)
      .leftJoin(stocks, eq(watchlist.code, stocks.code))
      .all();

    return NextResponse.json(rows);
  } catch (err) {
    console.error("[GET /api/watchlist]", err);
    return NextResponse.json(
      { error: "監視リストの取得に失敗しました" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { code?: string; reason?: string };
    const { code, reason } = body;

    if (!code) {
      return NextResponse.json(
        { error: "codeは必須です" },
        { status: 400 }
      );
    }

    // 銘柄が存在するか確認
    const stock = db
      .select()
      .from(stocks)
      .where(eq(stocks.code, code))
      .get();

    if (!stock) {
      return NextResponse.json(
        { error: `銘柄コード ${code} が見つかりません` },
        { status: 404 }
      );
    }

    // 既に登録済みか確認
    const existing = db
      .select()
      .from(watchlist)
      .where(eq(watchlist.code, code))
      .get();

    if (existing) {
      return NextResponse.json(
        { error: `${code} は既に監視リストに登録されています` },
        { status: 409 }
      );
    }

    const result = db
      .insert(watchlist)
      .values({
        code,
        addReason: reason ?? null,
        aiStatus: "WAITING",
      })
      .returning()
      .get();

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("[POST /api/watchlist]", err);
    return NextResponse.json(
      { error: "監視リストへの追加に失敗しました" },
      { status: 500 }
    );
  }
}
