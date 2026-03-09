import { describe, it, expect } from "vitest";
import { parseNumber, parseTradingValue, parseMarketCap, scrapeKabutan } from "./kabutan";

// ────────────────────────────────────────────────
// parseNumber
// ────────────────────────────────────────────────

describe("parseNumber", () => {
  it("カンマ区切りの整数", () => {
    expect(parseNumber("34,033,700")).toBe(34033700);
  });

  it("小数点あり", () => {
    expect(parseNumber("2,827.0")).toBe(2827);
  });

  it("「株」「円」「回」を除去", () => {
    expect(parseNumber("34,033,700 株")).toBe(34033700);
    expect(parseNumber("4,101 円")).toBe(4101);
  });

  it("空文字 → null", () => {
    expect(parseNumber("")).toBeNull();
  });

  it("「-」「－」「---」→ null", () => {
    expect(parseNumber("-")).toBeNull();
    expect(parseNumber("－")).toBeNull();
    expect(parseNumber("---")).toBeNull();
  });

  it("全角スペース含む → 正しく除去", () => {
    expect(parseNumber("1,746　")).toBe(1746);
  });
});

// ────────────────────────────────────────────────
// parseTradingValue
// ────────────────────────────────────────────────

describe("parseTradingValue", () => {
  it("「百万円」単位 → ×1,000,000", () => {
    expect(parseTradingValue("141,573 百万円")).toBe(141_573_000_000);
  });

  it("「百万円」小さい値", () => {
    expect(parseTradingValue("62 百万円")).toBe(62_000_000);
  });

  it("「億円」単位 → ×100,000,000", () => {
    expect(parseTradingValue("50億円")).toBe(5_000_000_000);
  });

  it("空文字 → null", () => {
    expect(parseTradingValue("")).toBeNull();
  });

  it("「-」→ null", () => {
    expect(parseTradingValue("-")).toBeNull();
  });
});

// ────────────────────────────────────────────────
// parseMarketCap
// ────────────────────────────────────────────────

describe("parseMarketCap", () => {
  it("「兆＋億」複合", () => {
    // 5兆1,637億 = 5 * 1e12 + 1637 * 1e8
    expect(parseMarketCap("5兆1,637億円")).toBe(
      5 * 1_000_000_000_000 + 1637 * 100_000_000
    );
  });

  it("「億」のみ", () => {
    expect(parseMarketCap("1,200億円")).toBe(1200 * 100_000_000);
  });

  it("「百万」のみ", () => {
    expect(parseMarketCap("500百万円")).toBe(500 * 1_000_000);
  });

  it("兆だけ（億なし）", () => {
    expect(parseMarketCap("2兆円")).toBe(2 * 1_000_000_000_000);
  });

  it("空文字 → null", () => {
    expect(parseMarketCap("")).toBeNull();
  });
});

// ────────────────────────────────────────────────
// 統合テスト: 実際にスクレイプして構造を検証
// ────────────────────────────────────────────────

describe("scrapeKabutan (統合テスト)", () => {
  it(
    "1件以上の銘柄を取得できる",
    async () => {
      const results = await scrapeKabutan();
      expect(results.length).toBeGreaterThan(0);
    },
    60_000
  );

  it(
    "各銘柄に code・name・market が含まれる",
    async () => {
      const results = await scrapeKabutan();
      for (const stock of results) {
        expect(stock.code).toBeTruthy();
        expect(stock.name).toBeTruthy();
        // market は空文字の場合もあるが存在はする
        expect(stock).toHaveProperty("market");
      }
    },
    60_000
  );

  it(
    "銘柄コードは英数字4文字以上",
    async () => {
      const results = await scrapeKabutan();
      for (const stock of results) {
        expect(stock.code).toMatch(/^[A-Za-z0-9]{4,}$/);
      }
    },
    60_000
  );

  it(
    "closePrice は正の数またはnull",
    async () => {
      const results = await scrapeKabutan();
      for (const stock of results) {
        if (stock.closePrice !== null) {
          expect(stock.closePrice).toBeGreaterThan(0);
        }
      }
    },
    60_000
  );

  it(
    "tradingValue は正の数またはnull",
    async () => {
      const results = await scrapeKabutan();
      for (const stock of results) {
        if (stock.tradingValue !== null) {
          expect(stock.tradingValue).toBeGreaterThan(0);
        }
      }
    },
    60_000
  );

  it(
    "marketCap は正の数またはnull",
    async () => {
      const results = await scrapeKabutan();
      for (const stock of results) {
        if (stock.marketCap !== null) {
          expect(stock.marketCap).toBeGreaterThan(0);
        }
      }
    },
    60_000
  );
}, 120_000);
