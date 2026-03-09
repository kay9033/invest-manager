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

// 52週高値更新銘柄ページ
const TARGET_URL = "https://kabutan.jp/warning/record_w52_high_price";

function parseNumber(text: string): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[,\s円株万億　]/g, "").trim();
  if (cleaned === "" || cleaned === "-" || cleaned === "－" || cleaned === "---") return null;
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
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);

    // tbody の全行を処理
    // 構造: td.tac(コード) | th[scope=row](社名) | td.tac(市場) | td.gaiyou_icon | td.chart_icon | td(株価) | td(S/空) | td.w61(前日比) | td.w50(%) | td.news_icon | td(PER) | td(PBR) | td(利回り)
    const rows = await page.$$("table.stock_table tbody tr");

    for (const row of rows) {
      try {
        const codeEl = await row.$("td.tac a");
        if (!codeEl) continue;

        const codeHref = await codeEl.getAttribute("href") ?? "";
        const codeMatch = codeHref.match(/code=([^&]+)/);
        const code = codeMatch?.[1]?.trim();
        if (!code) continue;

        const nameEl = await row.$("th[scope='row']");
        const name = ((await nameEl?.textContent()) ?? "").trim();
        if (!name) continue;

        // 市場: 2番目の td.tac
        const marketTds = await row.$$("td.tac");
        const market = marketTds.length >= 2
          ? ((await marketTds[1].textContent()) ?? "").trim()
          : "";

        // 全tdを取得して株価を探す (gaiyou_icon/chart_iconを除いた5番目のtd)
        const allTds = await row.$$("td");
        // td[0]=コード, td[1]=市場, td[2]=gaiyou_icon, td[3]=chart_icon, td[4]=株価
        const priceText = allTds[4]
          ? ((await allTds[4].textContent()) ?? "").trim()
          : "";
        const closePrice = parseNumber(priceText);

        // 出来高・売買代金はこのページにないのでnull
        results.push({ code, name, market, closePrice, volume: null, tradingValue: null });
      } catch {
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
      const existing = db
        .select()
        .from(stocks)
        .where(eq(stocks.code, item.code))
        .get();

      if (!existing) {
        db.insert(stocks)
          .values({ code: item.code, name: item.name, market: item.market || null })
          .run();
      } else if (existing.name !== item.name) {
        db.update(stocks)
          .set({ name: item.name, updatedAt: new Date().toISOString() })
          .where(eq(stocks.code, item.code))
          .run();
      }

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

if (require.main === module) {
  runScrape()
    .then((result) => {
      console.log(`スクレイプ完了: ${result.scraped}件取得, ${result.saved}件保存`);
      if (result.errors.length > 0) console.error("エラー:", result.errors);
      process.exit(0);
    })
    .catch((err) => {
      console.error("スクレイプ失敗:", err);
      process.exit(1);
    });
}
