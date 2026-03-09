import { chromium, type Browser } from "playwright";
import db from "@/lib/db";
import { stocks, scans } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// ────────────────────────────────────────────────
// 型定義
// ────────────────────────────────────────────────

export interface ScrapedStock {
  code: string;
  name: string;
  market: string;
  closePrice: number | null;
  volume: number | null;
  tradingValue: number | null;
  marketCap: number | null;
  sales: number | null;
  salesGrowthRate: number | null;
  eps: number | null;
  epsGrowthRate: number | null;
}

// ────────────────────────────────────────────────
// パーサー
// ────────────────────────────────────────────────

function parseNumber(text: string): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[,\s株円回　]/g, "").trim();
  if (!cleaned || cleaned === "-" || cleaned === "－" || cleaned === "---") return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/** "141,573 百万円" → 141_573_000_000 (円) */
function parseTradingValue(text: string): number | null {
  if (!text) return null;
  if (text.includes("百万")) {
    const n = parseFloat(text.replace(/[,\s百万円　]/g, ""));
    return isNaN(n) ? null : n * 1_000_000;
  }
  if (text.includes("億")) {
    const n = parseFloat(text.replace(/[,\s億円　]/g, ""));
    return isNaN(n) ? null : n * 100_000_000;
  }
  return parseNumber(text);
}

/** "5兆1,637億円" / "1,200億円" / "500百万円" → 円 */
function parseMarketCap(text: string): number | null {
  if (!text) return null;
  let total = 0;
  const cho = text.match(/([0-9,]+(?:\.[0-9]+)?)兆/);
  const oku = text.match(/([0-9,]+(?:\.[0-9]+)?)億/);
  const hyakuman = text.match(/([0-9,]+(?:\.[0-9]+)?)百万/);
  if (cho) total += parseFloat(cho[1].replace(/,/g, "")) * 1_000_000_000_000;
  if (oku) total += parseFloat(oku[1].replace(/,/g, "")) * 100_000_000;
  if (hyakuman) total += parseFloat(hyakuman[1].replace(/,/g, "")) * 1_000_000;
  return total > 0 ? total : parseNumber(text);
}

// ────────────────────────────────────────────────
// 一覧ページ: 52週高値更新銘柄を全ページ取得
// ────────────────────────────────────────────────

const LIST_BASE = "https://kabutan.jp/warning/record_w52_high_price";

interface ListItem {
  code: string;
  name: string;
  market: string;
  closePrice: number | null;
}

async function scrapeListPage(browser: Browser, pageNum: number): Promise<ListItem[]> {
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();
  const items: ListItem[] = [];

  try {
    const url = `${LIST_BASE}?market=0&capitalization=-1&dispmode=normal&stc=code&stm=0&pagecount=50&page=${pageNum}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1000);

    const rows = await page.$$("table.stock_table tbody tr");
    for (const row of rows) {
      try {
        const codeEl = await row.$("td.tac a");
        if (!codeEl) continue;
        const href = (await codeEl.getAttribute("href")) ?? "";
        const code = href.match(/code=([^&]+)/)?.[1]?.trim();
        if (!code) continue;

        const nameEl = await row.$("th[scope='row']");
        const name = ((await nameEl?.textContent()) ?? "").trim();
        if (!name) continue;

        const marketTds = await row.$$("td.tac");
        const market = marketTds.length >= 2
          ? ((await marketTds[1].textContent()) ?? "").trim()
          : "";

        const allTds = await row.$$("td");
        const priceText = ((await allTds[4]?.textContent()) ?? "").trim();
        const closePrice = parseNumber(priceText);

        items.push({ code, name, market, closePrice });
      } catch {
        continue;
      }
    }

    // 次ページがあるか確認
    const hasNext = await page.$('.pagination a:has-text("次へ")');
    return items.concat(hasNext ? await scrapeListPage(browser, pageNum + 1) : []);
  } finally {
    await ctx.close();
  }
}

// ────────────────────────────────────────────────
// 個別ページ: 出来高・売買代金・業績を取得
// ────────────────────────────────────────────────

interface StockDetail {
  volume: number | null;
  tradingValue: number | null;
  marketCap: number | null;
  sales: number | null;
  salesGrowthRate: number | null;
  eps: number | null;
  epsGrowthRate: number | null;
}

async function scrapeStockDetail(browser: Browser, code: string): Promise<StockDetail> {
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();

  try {
    await page.goto(`https://kabutan.jp/stock/?code=${code}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(800);

    const detail = await page.evaluate(() => {
      const tables = document.querySelectorAll("table");

      // ── 出来高・売買代金・時価総額 (table[4]) ──
      const t4 = tables[4];
      const findTdByTh = (table: Element, label: string): string => {
        const rows = table.querySelectorAll("tr");
        for (const tr of rows) {
          const th = tr.querySelector("th");
          if (th?.textContent?.includes(label)) {
            return tr.querySelector("td")?.textContent?.trim() ?? "";
          }
        }
        return "";
      };

      const volumeText = t4 ? findTdByTh(t4, "出来高") : "";
      const tradingText = t4 ? findTdByTh(t4, "売買代金") : "";
      const capText = t4 ? findTdByTh(t4, "時価総額") : "";

      // ── 業績テーブル (th="決算期" を含むテーブルを検索) ──
      let bizTable: Element | null = null;
      for (const t of tables) {
        const ths = t.querySelectorAll("th");
        for (const th of ths) {
          if (th.textContent?.includes("決算期")) { bizTable = t; break; }
        }
        if (bizTable) break;
      }

      // データ行（"I"で始まるth行）を収集
      const bizRows: { label: string; values: string[] }[] = [];
      if (bizTable) {
        for (const tr of bizTable.querySelectorAll("tr")) {
          const th = tr.querySelector("th");
          const label = th?.textContent?.trim() ?? "";
          const tds = Array.from(tr.querySelectorAll("td")).map(td => td.textContent?.trim() ?? "");
          if (tds.length > 0) bizRows.push({ label, values: tds });
        }
      }

      return { volumeText, tradingText, capText, bizRows };
    });

    // ── 業績パース ──
    // ヘッダ行: 決算期 | 売上高 | 経常益 | 最終益 | １株益 | １株配 | 発表日
    // データ行: "I 2024.12" → [22658, 12988, 4273, 345.3, 86.0, 25/02/13]
    // 最終行: "前期比(%)" → [-5.9, -14.8, -16.2, -14.2, ...]
    const dataRows = detail.bizRows.filter(r => r.label.startsWith("I") && !r.label.includes("予"));
    const growthRow = detail.bizRows.find(r => r.label.includes("前期比"));

    let sales: number | null = null;
    let salesGrowthRate: number | null = null;
    let eps: number | null = null;
    let epsGrowthRate: number | null = null;

    if (dataRows.length > 0) {
      const latest = dataRows[dataRows.length - 1];
      sales = parseNumber(latest.values[0] ?? "");
      eps = parseNumber(latest.values[3] ?? "");
    }
    if (growthRow) {
      salesGrowthRate = parseNumber(growthRow.values[0] ?? "");
      epsGrowthRate = parseNumber(growthRow.values[3] ?? "");
    }

    return {
      volume: parseNumber(detail.volumeText),
      tradingValue: parseTradingValue(detail.tradingText),
      marketCap: parseMarketCap(detail.capText),
      sales,
      salesGrowthRate,
      eps,
      epsGrowthRate,
    };
  } catch {
    return { volume: null, tradingValue: null, marketCap: null, sales: null, salesGrowthRate: null, eps: null, epsGrowthRate: null };
  } finally {
    await ctx.close();
  }
}

// ────────────────────────────────────────────────
// メイン: 全銘柄スクレイプ
// ────────────────────────────────────────────────

export async function scrapeKabutan(): Promise<ScrapedStock[]> {
  const browser = await chromium.launch({ headless: true });

  try {
    // 1. 全ページの一覧を取得
    const listItems = await scrapeListPage(browser, 1);
    console.log(`[scraper] 一覧取得: ${listItems.length}件`);

    // 2. 各銘柄の個別ページを取得（並列5件ずつ）
    const results: ScrapedStock[] = [];
    const CONCURRENCY = 5;

    for (let i = 0; i < listItems.length; i += CONCURRENCY) {
      const chunk = listItems.slice(i, i + CONCURRENCY);
      const details = await Promise.all(
        chunk.map(item => scrapeStockDetail(browser, item.code))
      );
      for (let j = 0; j < chunk.length; j++) {
        results.push({ ...chunk[j], ...details[j] });
      }
      // サーバー負荷軽減のため少し待機
      if (i + CONCURRENCY < listItems.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    console.log(`[scraper] 詳細取得完了: ${results.length}件`);
    return results;
  } finally {
    await browser.close();
  }
}

// ────────────────────────────────────────────────
// DBへの保存
// ────────────────────────────────────────────────

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
      const existing = db.select().from(stocks).where(eq(stocks.code, item.code)).get();

      if (!existing) {
        db.insert(stocks).values({
          code: item.code,
          name: item.name,
          market: item.market || null,
          sales: item.sales,
          salesGrowthRate: item.salesGrowthRate,
          eps: item.eps,
          epsGrowthRate: item.epsGrowthRate,
          marketCap: item.marketCap,
        }).run();
      } else {
        db.update(stocks).set({
          name: item.name,
          market: item.market || null,
          sales: item.sales ?? existing.sales,
          salesGrowthRate: item.salesGrowthRate ?? existing.salesGrowthRate,
          eps: item.eps ?? existing.eps,
          epsGrowthRate: item.epsGrowthRate ?? existing.epsGrowthRate,
          marketCap: item.marketCap ?? existing.marketCap,
          updatedAt: new Date().toISOString(),
        }).where(eq(stocks.code, item.code)).run();
      }

      db.insert(scans).values({
        code: item.code,
        scanDate: today,
        closePrice: item.closePrice,
        volume: item.volume,
        tradingValue: item.tradingValue,
        isNewHigh: true,
      }).run();

      saved++;
    } catch (err) {
      errors.push(`${item.code}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { scraped: scrapedData.length, saved, errors };
}

if (require.main === module) {
  runScrape()
    .then(r => {
      console.log(`完了: ${r.scraped}件取得, ${r.saved}件保存`);
      if (r.errors.length) console.error("エラー:", r.errors);
      process.exit(0);
    })
    .catch(err => { console.error(err); process.exit(1); });
}
