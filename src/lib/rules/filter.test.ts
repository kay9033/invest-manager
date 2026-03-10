import { describe, it, expect } from "vitest";
import { filterStock, ScanData } from "./filter";

// フィルター通過できる最低限のベースデータ
const base: ScanData = {
  code: "1234",
  isNewHigh: true,
  closePrice: 1000,
  tradingValue: 600_000_000, // 6億円（5億以上）
  volume: null,
  avgVolume25: null,
  epsGrowthRate: null,
  salesGrowthRate: null,
};

// ────────────────────────────────────────────────
// 必須条件: 脱落ケース
// ────────────────────────────────────────────────

describe("必須条件: 脱落ケース", () => {
  it("新高値でない → passed=false, score=0", () => {
    const result = filterStock({ ...base, isNewHigh: false });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reasons).toContain("新高値更新なし");
  });

  it("株価99円 → passed=false（低位株除外）", () => {
    const result = filterStock({ ...base, closePrice: 99 });
    expect(result.passed).toBe(false);
    expect(result.reasons.some(r => r.includes("低位株除外"))).toBe(true);
  });

  it("株価100円ちょうど → 脱落しない", () => {
    const result = filterStock({ ...base, closePrice: 100 });
    expect(result.passed).toBe(true);
  });

  it("売買代金4.9億円 → passed=false（流動性不足）", () => {
    const result = filterStock({ ...base, tradingValue: 490_000_000 });
    expect(result.passed).toBe(false);
    expect(result.reasons.some(r => r.includes("流動性不足"))).toBe(true);
  });

  it("売買代金5億円ちょうど → 脱落しない", () => {
    const result = filterStock({ ...base, tradingValue: 500_000_000 });
    expect(result.passed).toBe(true);
  });

  it("出来高比率149% → passed=false（スパイクなし）", () => {
    const result = filterStock({
      ...base,
      volume: 149,
      avgVolume25: 100,
    });
    expect(result.passed).toBe(false);
    expect(result.reasons.some(r => r.includes("スパイクなし"))).toBe(true);
  });

  it("出来高比率150%ちょうど → 脱落しない", () => {
    const result = filterStock({
      ...base,
      volume: 150,
      avgVolume25: 100,
    });
    expect(result.passed).toBe(true);
  });
});

// ────────────────────────────────────────────────
// スコアリング: 加点ケース
// ────────────────────────────────────────────────

describe("スコアリング: 加点", () => {
  // 最小通過ケース（データなし）のスコアを基準にする
  // 新高値(+20) + 株価100円以上(+10) + 売買代金データなし(+15) = 45 → 45/100 = 45点
  it("最小通過（売買代金・出来高データなし）→ score=45", () => {
    const result = filterStock({
      ...base,
      tradingValue: null,
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(45);
  });

  // 新高値(+20) + 株価(+10) + 売買代金5億(+30) = 60 → 60点
  it("売買代金5〜19億円 → score=60", () => {
    const result = filterStock({ ...base, tradingValue: 600_000_000 });
    expect(result.score).toBe(60);
  });

  // 新高値(+20) + 株価(+10) + 売買代金20億(+30+5) = 65 → 65点
  it("売買代金20〜99億円 → +5加点でscore=65", () => {
    const result = filterStock({ ...base, tradingValue: 2_000_000_000 });
    expect(result.score).toBe(65);
  });

  // 新高値(+20) + 株価(+10) + 売買代金100億(+30+10) = 70 → 70点
  it("売買代金100億以上 → +10加点でscore=70", () => {
    const result = filterStock({ ...base, tradingValue: 10_000_000_000 });
    expect(result.score).toBe(70);
  });

  // 出来高スパイク: +20
  it("出来高スパイク150〜299% → +20加点", () => {
    const noSpike = filterStock({ ...base });
    const withSpike = filterStock({ ...base, volume: 200, avgVolume25: 100 });
    expect(withSpike.score - noSpike.score).toBe(20);
  });

  // 出来高スパイク300%以上: +20+10
  it("出来高スパイク300%以上 → +30加点", () => {
    const noSpike = filterStock({ ...base });
    const withSpike300 = filterStock({ ...base, volume: 300, avgVolume25: 100 });
    expect(withSpike300.score - noSpike.score).toBe(30);
  });

  // EPS成長率25%以上: +10
  it("EPS成長率25%以上 → +10加点", () => {
    const noEps = filterStock({ ...base });
    const withEps = filterStock({ ...base, epsGrowthRate: 25 });
    expect(withEps.score - noEps.score).toBe(10);
  });

  // EPS成長率0〜24%: +3
  it("EPS成長率0〜24% → +3加点", () => {
    const noEps = filterStock({ ...base });
    const withEps = filterStock({ ...base, epsGrowthRate: 10 });
    expect(withEps.score - noEps.score).toBe(3);
  });

  // EPS成長率マイナス: +0
  it("EPS成長率マイナス → 加点なし", () => {
    const noEps = filterStock({ ...base });
    const withEps = filterStock({ ...base, epsGrowthRate: -10 });
    expect(withEps.score - noEps.score).toBe(0);
  });

  // 売上成長率25%以上: +10
  it("売上成長率25%以上 → +10加点", () => {
    const noSgr = filterStock({ ...base });
    const withSgr = filterStock({ ...base, salesGrowthRate: 25 });
    expect(withSgr.score - noSgr.score).toBe(10);
  });

  // 売上成長率0〜24%: +3
  it("売上成長率0〜24% → +3加点", () => {
    const noSgr = filterStock({ ...base });
    const withSgr = filterStock({ ...base, salesGrowthRate: 10 });
    expect(withSgr.score - noSgr.score).toBe(3);
  });

  // 売上成長率マイナス: +0
  it("売上成長率マイナス → 加点なし", () => {
    const noSgr = filterStock({ ...base });
    const withSgr = filterStock({ ...base, salesGrowthRate: -5 });
    expect(withSgr.score - noSgr.score).toBe(0);
  });

  // ROE 20%以上: +8（17%で+5、20%で+3追加）
  it("ROE 20%以上 → +8加点", () => {
    const noRoe = filterStock({ ...base });
    const withRoe = filterStock({ ...base, roe: 20 });
    expect(withRoe.score - noRoe.score).toBe(8);
  });

  // ROE 17%以上20%未満: +5
  it("ROE 17%以上20%未満 → +5加点", () => {
    const noRoe = filterStock({ ...base });
    const withRoe = filterStock({ ...base, roe: 17 });
    expect(withRoe.score - noRoe.score).toBe(5);
  });

  // ROE 17%未満: +0
  it("ROE 17%未満 → 加点なし", () => {
    const noRoe = filterStock({ ...base });
    const withRoe = filterStock({ ...base, roe: 10 });
    expect(withRoe.score - noRoe.score).toBe(0);
  });
});

// ────────────────────────────────────────────────
// スコア上限・複合ケース
// ────────────────────────────────────────────────

describe("スコア: 複合ケース", () => {
  it("スコアは100を超えない（全条件最大）", () => {
    const result = filterStock({
      ...base,
      closePrice: 5000,
      tradingValue: 50_000_000_000, // 500億
      volume: 500,
      avgVolume25: 100, // 500%スパイク
      epsGrowthRate: 50,
      salesGrowthRate: 30,
    });
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.passed).toBe(true);
  });

  it("優良銘柄（全条件クリア）のreasonに「全必須条件クリア」が含まれる", () => {
    const result = filterStock({
      ...base,
      tradingValue: 10_000_000_000,
      volume: 300,
      avgVolume25: 100,
      epsGrowthRate: 30,
      salesGrowthRate: 25,
    });
    expect(result.passed).toBe(true);
    expect(result.reasons).toContain("全必須条件クリア");
  });

  it("株価null → 株価チェックをスキップして通過", () => {
    const result = filterStock({ ...base, closePrice: null });
    expect(result.passed).toBe(true);
  });

  it("volumeRatioを直接渡した場合にvolume/avgVolume25より優先される", () => {
    // volumeRatio=100（150未満）なので脱落するはず
    const result = filterStock({
      ...base,
      volumeRatio: 100,
      volume: 500,      // これだけなら500%だが…
      avgVolume25: 100,
    });
    expect(result.passed).toBe(false);
  });
});
