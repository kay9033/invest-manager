import { NextResponse } from "next/server";
import db from "@/lib/db";
import { stocks, scans } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  const stock = db.select().from(stocks).where(eq(stocks.code, code)).get();
  if (!stock) {
    return NextResponse.json({ error: "銘柄が見つかりません" }, { status: 404 });
  }

  const scan = db
    .select()
    .from(scans)
    .where(eq(scans.code, code))
    .orderBy(desc(scans.scanDate))
    .limit(1)
    .get();

  return NextResponse.json({
    stock: {
      ...stock,
      annualEpsGrowths: stock.annualEpsGrowths
        ? (JSON.parse(stock.annualEpsGrowths) as number[])
        : null,
    },
    scan: scan
      ? {
          ...scan,
          reasons: scan.reasons ? (JSON.parse(scan.reasons) as string[]) : [],
        }
      : null,
  });
}
