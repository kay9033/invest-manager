import { chromium } from "playwright";
import db from "@/lib/db";
import { stocks, scans } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export interface ScrapedStock {
  code: string;
  name: string;
  market: string;
  closePrice: number | null;
  volume: number | null;
  tradingValue: number | null;
}

const TARGET_URL =
  "https://kabutan.jp/warning/?mode=2_9&market=1&capitalgroupid=0";

function parseNumber(text: string): number | null {
  if (!text) return null;
  // カンマ・空白・円・株などを除去
  const cleaned = text.replace(/[,\s円株万億]/g, "").trim();
  if (cleaned === "" || cleaned === "-" || cleaned === "---") return null;

  // 万・億の単位変換は不要（生数値を取得）
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseTradingValue(text: string): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[,\s]/g, "").trim();
  if (cleaned === "" || cleaned === "-") return null;

  // 「億」単位の場合
  if (text.includes("億")) {
    const num = parseFloat(cleaned.replace("億", ""));
    return isNaN(num) ? null : num * 100_000_000;
  }
  // 「万」単位の場合
  if (text.includes("万")) {
    const num = parseFloat(cleaned.replace("万", ""));
    return isNaN(num) ? null : num * 10_000;
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

export async function scrapeKabutan(): Promise<ScrapedStock[]> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  const results: ScrapedStock[] = [];

  try {
    await page.goto(TARGET_URL, { waitUntil: "networkidle", timeout: 30000 });

    // テーブルの行を取得
    const rows = await page.$$("table.stock_table tbody tr, table tbody tr");

    for (const row of rows) {
      try {
        const cells = await row.$$("td");
        if (cells.length < 4) continue;

        // 銘柄コードと社名のセル
        const codeCell = cells[0];
        const codeText = (await codeCell.textContent()) ?? "";
        const code = codeText.trim().match(/\d{4}/)?.[0];
        if (!code) continue;

        // 社名
        const nameCell = cells[1];
        const nameText = ((await nameCell.textContent()) ?? "").trim();
        if (!nameText) continue;

        // 市場
        let market = "";
        try {
          const marketEl = await nameCell.$(".market, .exchange");
          if (marketEl) {
            market = ((await marketEl.textContent()) ?? "").trim();
          }
        } catch {
          // 市場情報が取れない場合は空のまま
        }

        // 株価（終値）
        const priceCell = cells[2] ?? cells[3];
        const priceText = ((await priceCell.textContent()) ?? "").trim();
        const closePrice = parseNumber(priceText);

        // 出来高
        let volume: number | null = null;
        let tradingValue: number | null = null;

        if (cells.length >= 6) {
          const volumeText = ((await cells[4].textContent()) ?? "").trim();
          volume = parseNumber(volumeText);

          const tradingText = ((await cells[5].textContent()) ?? "").trim();
          tradingValue = parseTradingValue(tradingText);
        }

        results.push({
          code,
          name: nameText,
          market,
          closePrice,
          volume,
          tradingValue,
        });
      } catch {
        // 個別行のエラーはスキップ
        continue;
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}

export async function runScrape(): Promise<{
  scraped: number;
  saved: number;
  errors: string[];
}> {
  const scrapedData = await scrapeKabutan();
  const today = new Date().toISOString().split("T")[0];
  let saved = 0;
  const errors: string[] = [];

  for (const item of scrapedData) {
    try {
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
      } else if (existing.name !== item.name) {
        db.update(stocks)
          .set({ name: item.name, updatedAt: new Date().toISOString() })
          .where(eq(stocks.code, item.code))
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

      saved++;
    } catch (err) {
      errors.push(
        `${item.code}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { scraped: scrapedData.length, saved, errors };
}

// CLIから直接実行する場合
if (require.main === module) {
  runScrape()
    .then((result) => {
      console.log(`スクレイプ完了: ${result.scraped}件取得, ${result.saved}件保存`);
      if (result.errors.length > 0) {
        console.error("エラー:", result.errors);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error("スクレイプ失敗:", err);
      process.exit(1);
    });
}
