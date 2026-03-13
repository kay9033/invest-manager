import { chromium, type Browser } from "playwright";
import db from "@/lib/db";
import { stocks, scans } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { scanProgress } from "@/lib/scan-progress";

// ────────────────────────────────────────────────
// 型定義
// ────────────────────────────────────────────────

export interface ScrapedStock {
  code: string;
  name: string;
  market: string;
  closePrice: number | null;
  volume: number | null;
  avgVolume25: number | null;
  tradingValue: number | null;
  marketCap: number | null;
  sales: number | null;
  salesGrowthRate: number | null;
  eps: number | null;
  epsGrowthRate: number | null;
  // 財務ページから追加取得
  epsAccelerating: boolean | null;          // EPS成長率が加速しているか
  salesAccelerating: boolean | null;        // 売上成長率が加速しているか
  hasUpwardRevision: boolean;               // 直近で上方修正があったか
  roe: number | null;                       // ROE（直近期）
  annualEpsGrowths: (number | null)[];      // 年次EPS前期比成長率の配列（古い順）
  operatingMarginImproving: boolean | null; // 営業利益率が改善傾向か
  // 個別ページ追加
  marginRatio: number | null;               // 信用倍率
  // RS（TOPIX比相対強度）
  rs3m: number | null;                      // 3ヶ月騰落率 - TOPIX3ヶ月騰落率
  rs6m: number | null;                      // 6ヶ月騰落率 - TOPIX6ヶ月騰落率
  // IRBANK: 大量保有報告（I条件）
  hasInstitutionalIncrease: boolean | null; // 直近6ヶ月以内に5%超保有者の増加報告があるか
}

// ────────────────────────────────────────────────
// パーサー
// ────────────────────────────────────────────────

export function parseNumber(text: string): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[,\s株円回倍　]/g, "").trim();
  if (!cleaned || cleaned === "-" || cleaned === "－" || cleaned === "---") return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/** "141,573 百万円" → 141_573_000_000 (円) */
export function parseTradingValue(text: string): number | null {
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
export function parseMarketCap(text: string): number | null {
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
  hasBizData: boolean; // 業績テーブルが存在するか（ETF等は false）
  volume: number | null;
  avgVolume25: number | null; // 25日平均出来高
  tradingValue: number | null;
  marketCap: number | null;
  sales: number | null;
  salesGrowthRate: number | null;
  eps: number | null;
  epsGrowthRate: number | null;
  marginRatio: number | null; // 信用倍率
}

interface MonthlyPrice {
  date: string;
  close: number;
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

      // ── 信用倍率（PER/PBR/信用倍率テーブル: ヘッダ行+データ行の構造）──
      // 構造: <thead><tr><th>PER</th><th>PBR</th><th>利回り</th><th>信用倍率</th></tr></thead>
      //       <tbody><tr><td>26.3倍</td><td>4.64倍</td><td>0.47%</td><td>3.22倍</td></tr></tbody>
      let marginRatioText = "";
      for (const t of tables) {
        const headerCells = Array.from(t.querySelectorAll("thead th, tr:first-child th"));
        const idx = headerCells.findIndex(th => th.textContent?.includes("信用倍率"));
        if (idx < 0) continue;
        // ヘッダの次のデータ行（tbodyの最初のtr）を取得
        const dataRow = t.querySelector("tbody tr");
        if (!dataRow) continue;
        const tds = dataRow.querySelectorAll("td");
        marginRatioText = tds[idx]?.textContent?.trim() ?? "";
        if (marginRatioText) break;
      }

      return { volumeText, tradingText, capText, bizRows, marginRatioText };
    });

    // ── 業績パース ──
    // ヘッダ行: 決算期 | 売上高 | 経常益 | 最終益 | １株益 | １株配 | 発表日
    // データ行: "I 2024.12" or "2024.03" → [22658, 12988, 4273, 345.3, 86.0, 25/02/13]
    // 最終行: "前期比(%)" → [-5.9, -14.8, -16.2, -14.2, ...]
    const dataRows = detail.bizRows.filter(r =>
      (r.label.startsWith("I") || r.label.startsWith("連") || r.label.startsWith("単") || /\d{4}\.\d{2}/.test(r.label)) &&
      !r.label.includes("予")
    );
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

    const stockDetail = {
      hasBizData: detail.bizRows.length > 0,
      volume: parseNumber(detail.volumeText),
      tradingValue: parseTradingValue(detail.tradingText),
      marketCap: parseMarketCap(detail.capText),
      sales,
      salesGrowthRate,
      eps,
      epsGrowthRate,
      marginRatio: parseNumber(detail.marginRatioText),
    };

    // ── 25日平均出来高（日足ページから取得）──
    let avgVolume25: number | null = null;
    try {
      const dailyPage = await ctx.newPage();
      await dailyPage.goto(`https://kabutan.jp/stock/kabuka?code=${code}&ashi=day`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await dailyPage.waitForTimeout(500);
      const dailyVolumes = await dailyPage.evaluate(() => {
        const tables = document.querySelectorAll("table");
        for (const t of tables) {
          // theadのth行のみからヘッダーを取得（tbody行のth=日付セルを除外）
          const theadRow = t.querySelector("thead tr");
          if (!theadRow) continue;
          const headers = Array.from(theadRow.querySelectorAll("th")).map(th => th.textContent?.trim() ?? "");
          if (!headers.some(h => h.includes("日付")) || !headers.some(h => h.includes("売買高"))) continue;
          const volIdx = headers.findIndex(h => h.includes("売買高"));
          if (volIdx < 0) continue;
          // tbodyのtr（日付はth、数値はtd）
          const rows = Array.from(t.querySelectorAll("tbody tr"));
          return rows.slice(0, 25).map(tr => {
            const tds = tr.querySelectorAll("td");
            // tdのインデックスは「日付th」の分だけ1つずれる（volIdx - 1）
            return tds[volIdx - 1]?.textContent?.trim().replace(/,/g, "") ?? "";
          });
        }
        return [];
      });
      await dailyPage.close();
      const volumes = dailyVolumes
        .map(v => parseFloat(v))
        .filter(v => !isNaN(v) && v > 0);
      if (volumes.length >= 20) {
        avgVolume25 = Math.round(volumes.reduce((a, b) => a + b, 0) / volumes.length);
      }
    } catch (e) {
      console.error(`[avgVolume25] ${code}:`, e instanceof Error ? e.message : e);
    }

    return { ...stockDetail, avgVolume25 };
  } catch {
    return { hasBizData: false, volume: null, avgVolume25: null, tradingValue: null, marketCap: null, sales: null, salesGrowthRate: null, eps: null, epsGrowthRate: null, marginRatio: null };
  } finally {
    await ctx.close();
  }
}

// ────────────────────────────────────────────────
// IRBANK: 大量保有報告書（機関投資家動向）
// ────────────────────────────────────────────────

/** 直近6ヶ月以内に5%超保有者の増加報告があるか */
export async function scrapeInstitutionalIncrease(browser: Browser, code: string): Promise<boolean | null> {
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();
  try {
    // Step1: 銘柄ページからEDINETコードを取得
    await page.goto(`https://irbank.net/${code}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(500);
    const edinetCode = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll("a[href]"));
      for (const a of links) {
        const m = (a as HTMLAnchorElement).href.match(/irbank\.net\/(E\d+)\/share/);
        if (m) return m[1];
      }
      return null;
    });
    if (!edinetCode) return null;

    // Step2: 大量保有報告ページを取得
    await page.goto(`https://irbank.net/${edinetCode}/share`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(500);

    const result = await page.evaluate(() => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const rows = Array.from(document.querySelectorAll("table tr"));
      for (const row of rows) {
        const tds = Array.from(row.querySelectorAll("td"));
        if (tds.length < 3) continue;
        // 日付セル（例: "2025/06/03"）
        const dateText = tds[0]?.textContent?.trim() ?? "";
        const dateMatch = dateText.match(/(\d{4})\/(\d{2})\/(\d{2})/);
        if (!dateMatch) continue;
        const reportDate = new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]));
        if (reportDate < sixMonthsAgo) continue;
        // 増減セル（例: "+0.52%" → 増加）
        const changeText = tds[2]?.textContent?.trim() ?? "";
        if (changeText.startsWith("+")) return true;
      }
      return false;
    });
    return result;
  } catch {
    return null;
  } finally {
    await ctx.close();
  }
}

// ────────────────────────────────────────────────
// 月足ページ: 過去株価（RS計算用）
// ────────────────────────────────────────────────

async function scrapeMonthlyPrices(browser: Browser, code: string): Promise<MonthlyPrice[]> {
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();
  try {
    await page.goto(`https://kabutan.jp/stock/kabuka?code=${code}&ashi=mon`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(500);

    const prices = await page.evaluate(() => {
      const result: { date: string; close: number }[] = [];
      const tables = document.querySelectorAll("table");
      for (const t of tables) {
        const rows = Array.from(t.querySelectorAll("tr"));
        if (rows.length < 2) continue;

        // ヘッダ行から「終値」の列インデックスを取得
        const headerCells = Array.from(rows[0].querySelectorAll("th, td")).map(c => c.textContent?.trim() ?? "");
        const closeIdx = headerCells.findIndex(h => h.includes("終値"));
        if (closeIdx < 0) continue;

        for (let i = 1; i < rows.length; i++) {
          const dateEl = rows[i].querySelector("th");
          const tds = rows[i].querySelectorAll("td");
          if (!dateEl || tds.length === 0) continue;
          const dateText = dateEl.textContent?.trim() ?? "";
          // 終値のインデックス（thが1列あるのでtdのインデックスはcloseIdx-1）
          const tdIdx = closeIdx - (dateEl ? 1 : 0);
          const closeText = tds[tdIdx]?.textContent?.trim().replace(/,/g, "") ?? "";
          const close = parseFloat(closeText);
          if (dateText && !isNaN(close)) result.push({ date: dateText, close });
        }
        if (result.length > 0) break;
      }
      return result;
    });
    return prices;
  } catch {
    return [];
  } finally {
    await ctx.close();
  }
}

/** 月足配列（新しい順）からN ヶ月前比騰落率(%)を計算 */
function calcReturn(prices: MonthlyPrice[], months: number): number | null {
  if (prices.length <= months) return null;
  const current = prices[0].close;
  const past = prices[months].close;
  if (!past) return null;
  return ((current - past) / past) * 100;
}

// ────────────────────────────────────────────────
// 財務ページ: EPS加速・売上加速・上方修正・ROE
// ────────────────────────────────────────────────

interface FinanceDetail {
  epsAccelerating: boolean | null;
  salesAccelerating: boolean | null;
  hasUpwardRevision: boolean;
  roe: number | null;
  annualEpsGrowths: (number | null)[];    // 年次EPS前期比成長率の配列（古い順）
  operatingMarginImproving: boolean | null; // 営業利益率が改善傾向か
}

/** 成長率の配列から加速しているか判定（直近の成長率 > 前の成長率）*/
function isAccelerating(values: (number | null)[]): boolean | null {
  const valid = values.filter((v): v is number => v !== null && isFinite(v));
  if (valid.length < 3) return null;
  const rates: number[] = [];
  for (let i = 1; i < valid.length; i++) {
    if (valid[i - 1] === 0) continue;
    rates.push(((valid[i] - valid[i - 1]) / Math.abs(valid[i - 1])) * 100);
  }
  if (rates.length < 2) return null;
  // 直近の成長率が前の成長率より高いか
  return rates[rates.length - 1] > rates[rates.length - 2];
}

export async function scrapeFinance(browser: Browser, code: string): Promise<FinanceDetail> {
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();

  try {
    await page.goto(`https://kabutan.jp/stock/finance?code=${code}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(800);

    const raw = await page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll("table"));

      const isDataRow = (label: string) =>
        (label.includes("単") || label.includes("連") || /\d{4}\.\d{2}/.test(label)) &&
        !label.includes("予");

      // ── 年次業績テーブル: 「修正1株益」列を持つテーブルを検索 ──
      const annualRows: { label: string; values: string[] }[] = [];
      for (const t of tables) {
        const headers = Array.from(t.querySelectorAll("th")).map(th => th.textContent?.trim() ?? "");
        if (!headers.some(h => h.includes("修正1株益")) || !headers.some(h => h.includes("売上高"))) continue;
        for (const tr of t.querySelectorAll("tr")) {
          const th = tr.querySelector("th");
          const label = th?.textContent?.trim() ?? "";
          const tds = Array.from(tr.querySelectorAll("td")).map(td => td.textContent?.trim() ?? "");
          if (isDataRow(label) && tds.length >= 5) annualRows.push({ label, values: tds });
        }
        if (annualRows.length > 0) break;
      }

      // ── 業績修正テーブル: 「修正方向」列を持つテーブルを検索 ──
      const revisionTexts: string[] = [];
      for (const t of tables) {
        const headers = Array.from(t.querySelectorAll("th")).map(th => th.textContent?.trim() ?? "");
        if (!headers.some(h => h.includes("修正方向"))) continue;
        for (const td of t.querySelectorAll("td")) {
          const text = td.textContent?.trim() ?? "";
          if (text.includes("上") || text.includes("下")) revisionTexts.push(text);
        }
        break;
      }

      // ── 経営指標テーブル: 「ROE」列を持つテーブルを検索 ──
      const kpiRows: { label: string; values: string[] }[] = [];
      for (const t of tables) {
        const headers = Array.from(t.querySelectorAll("th")).map(th => th.textContent?.trim().normalize("NFKC") ?? "");
        if (!headers.some(h => h.includes("ROE"))) continue;
        // ROEの列インデックスを取得（th列を除いた位置）
        const roeIdx = headers.findIndex(h => h.includes("ROE")) - 1;
        for (const tr of t.querySelectorAll("tr")) {
          const th = tr.querySelector("th");
          const label = th?.textContent?.trim() ?? "";
          const tds = Array.from(tr.querySelectorAll("td")).map(td => td.textContent?.trim() ?? "");
          if (isDataRow(label) && tds.length >= 4) kpiRows.push({ label, values: tds, roeIdx } as typeof kpiRows[0] & { roeIdx: number });
        }
        if (kpiRows.length > 0) break;
      }

      return { annualRows, revisionTexts, kpiRows };
    });

    // ── 年次EPSと売上の配列を構築 ──
    // tds: [売上高(0), 営業益(1), 経常益(2), 最終益(3), 修正1株益(4), 修正1株配(5), 発表日(6)]
    const annualEps = raw.annualRows.map(r => parseNumber(r.values[4] ?? ""));
    const annualSales = raw.annualRows.map(r => parseNumber(r.values[0] ?? ""));

    const epsAccelerating = isAccelerating(annualEps);
    const salesAccelerating = isAccelerating(annualSales);

    // ── 年次EPS前期比成長率の配列 ──
    const annualEpsGrowths: (number | null)[] = [];
    for (let i = 1; i < annualEps.length; i++) {
      const prev = annualEps[i - 1];
      const curr = annualEps[i];
      if (prev === null || curr === null || prev === 0) {
        annualEpsGrowths.push(null);
      } else {
        annualEpsGrowths.push(((curr - prev) / Math.abs(prev)) * 100);
      }
    }

    // ── 営業利益率の改善傾向 ──
    // tds: [売上高(0), 営業益(1), ...]
    const annualOperatingMargins = raw.annualRows.map(r => {
      const s = parseNumber(r.values[0] ?? "");
      const op = parseNumber(r.values[1] ?? "");
      if (s === null || op === null || s === 0) return null;
      return (op / s) * 100;
    });
    const validMargins = annualOperatingMargins.filter((v): v is number => v !== null);
    const operatingMarginImproving = validMargins.length >= 2
      ? validMargins[validMargins.length - 1] > validMargins[validMargins.length - 2]
      : null;

    // ── 上方修正フラグ ──
    // 修正方向セルに "上" が含まれるか確認
    const hasUpwardRevision = raw.revisionTexts.some(t => t.includes("上") && !t.includes("修正方向"));

    // ── ROE: kpiRowsの直近実績（最後の行）のindex[3] ──
    // ROEは動的に取得した列インデックスを使用
    let roe: number | null = null;
    if (raw.kpiRows.length > 0) {
      const latestKpi = raw.kpiRows[raw.kpiRows.length - 1] as typeof raw.kpiRows[0] & { roeIdx?: number };
      const roeIdx = latestKpi.roeIdx ?? 3; // フォールバック: index 3
      roe = parseNumber(latestKpi.values[roeIdx] ?? "");
    }

    return { epsAccelerating, salesAccelerating, hasUpwardRevision, roe, annualEpsGrowths, operatingMarginImproving };
  } catch {
    return { epsAccelerating: null, salesAccelerating: null, hasUpwardRevision: false, roe: null, annualEpsGrowths: [], operatingMarginImproving: null };
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

    // 進捗初期化
    scanProgress.isScanning = true;
    scanProgress.current = 0;
    scanProgress.total = listItems.length;
    scanProgress.currentCode = "";
    scanProgress.currentName = "";

    // 2. TOPIX月足を一度だけ取得（RS計算基準）
    const topixPrices = await scrapeMonthlyPrices(browser, "0010");
    const topix3m = calcReturn(topixPrices, 3);
    const topix6m = calcReturn(topixPrices, 6);
    console.log(`[scraper] TOPIX 3M: ${topix3m?.toFixed(1)}%, 6M: ${topix6m?.toFixed(1)}%`);

    // 3. 各銘柄の個別ページを取得（並列5件ずつ）
    const results: ScrapedStock[] = [];
    const CONCURRENCY = 5;

    for (let i = 0; i < listItems.length; i += CONCURRENCY) {
      const chunk = listItems.slice(i, i + CONCURRENCY);
      // 個別ページ・財務ページ・月足・IRBANK大量保有を並列取得
      const [details, finances, monthlyPricesList, institutionalList] = await Promise.all([
        Promise.all(chunk.map(item => scrapeStockDetail(browser, item.code))),
        Promise.all(chunk.map(item => scrapeFinance(browser, item.code))),
        Promise.all(chunk.map(item => scrapeMonthlyPrices(browser, item.code))),
        Promise.all(chunk.map(item => scrapeInstitutionalIncrease(browser, item.code))),
      ]);
      for (let j = 0; j < chunk.length; j++) {
        // ETF・商品ファンド等（業績テーブルなし）はCAN-SLIM対象外として除外
        if (!details[j].hasBizData) {
          console.log(`[scraper] ETF/ファンド除外: ${chunk[j].code} ${chunk[j].name}`);
          scanProgress.current = i + j + 1;
          scanProgress.currentCode = chunk[j].code;
          scanProgress.currentName = chunk[j].name;
          continue;
        }
        const prices = monthlyPricesList[j];
        const stock3m = calcReturn(prices, 3);
        const stock6m = calcReturn(prices, 6);
        const rs3m = topix3m !== null && stock3m !== null ? stock3m - topix3m : null;
        const rs6m = topix6m !== null && stock6m !== null ? stock6m - topix6m : null;
        results.push({ ...chunk[j], ...details[j], ...finances[j], rs3m, rs6m, hasInstitutionalIncrease: institutionalList[j] });
        scanProgress.current = i + j + 1;
        scanProgress.currentCode = chunk[j].code;
        scanProgress.currentName = chunk[j].name;
      }
      if (i + CONCURRENCY < listItems.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    console.log(`[scraper] 詳細取得完了: ${results.length}件`);
    scanProgress.isScanning = false;
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
