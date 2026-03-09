import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { watchlist } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

type Params = { id: string };

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { id } = await params;
    const numId = parseInt(id, 10);
    if (isNaN(numId)) {
      return NextResponse.json({ error: "無効なIDです" }, { status: 400 });
    }

    const body = (await req.json()) as {
      memo?: string;
      aiStatus?: "WAITING" | "BUY" | "WATCH" | "SELL";
      aiComment?: string;
    };

    const updateData: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };

    if (body.memo !== undefined) updateData.memo = body.memo;
    if (body.aiStatus !== undefined) updateData.aiStatus = body.aiStatus;
    if (body.aiComment !== undefined) updateData.aiComment = body.aiComment;

    const result = db
      .update(watchlist)
      .set(updateData)
      .where(eq(watchlist.id, numId))
      .returning()
      .get();

    if (!result) {
      return NextResponse.json(
        { error: "該当レコードが見つかりません" },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[PATCH /api/watchlist/[id]]", err);
    return NextResponse.json(
      { error: "更新に失敗しました" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { id } = await params;
    const numId = parseInt(id, 10);
    if (isNaN(numId)) {
      return NextResponse.json({ error: "無効なIDです" }, { status: 400 });
    }

    const result = db
      .delete(watchlist)
      .where(eq(watchlist.id, numId))
      .returning()
      .get();

    if (!result) {
      return NextResponse.json(
        { error: "該当レコードが見つかりません" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/watchlist/[id]]", err);
    return NextResponse.json(
      { error: "削除に失敗しました" },
      { status: 500 }
    );
  }
}
