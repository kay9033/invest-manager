export interface ScanData {
  code: string;
  name?: string;
  closePrice: number | null;
  volume: number | null;
  avgVolume25: number | null;
  tradingValue: number | null;
  epsGrowthRate: number | null;
  isNewHigh: boolean;
  volumeRatio?: number | null;
}

export interface FilterResult {
  passed: boolean;
  reasons: string[];
  score: number; // 0-100
}

export function filterStock(scan: ScanData): FilterResult {
  const reasons: string[] = [];
  let score = 0;
  const maxScore = 100;

  // 1. 新高値更新チェック（必須）
  if (!scan.isNewHigh) {
    reasons.push("新高値更新なし");
    return { passed: false, reasons, score: 0 };
  }
  score += 20;

  // 2. 株価100円以上（低位株除外）
  if (scan.closePrice !== null && scan.closePrice < 100) {
    reasons.push(`株価${scan.closePrice}円 - 低位株除外（100円未満）`);
    return { passed: false, reasons, score };
  }
  if (scan.closePrice !== null && scan.closePrice >= 100) {
    score += 10;
  }

  // 3. 売買代金チェック（データある場合のみ必須）
  if (scan.tradingValue !== null) {
    if (scan.tradingValue < 500_000_000) {
      reasons.push(`売買代金${(scan.tradingValue / 100_000_000).toFixed(1)}億円 - 5億円未満（流動性不足）`);
      return { passed: false, reasons, score };
    }
    score += 30;
    if (scan.tradingValue >= 10_000_000_000) score += 10;
    else if (scan.tradingValue >= 2_000_000_000) score += 5;
  } else {
    reasons.push("売買代金: データなし（要確認）");
    score += 15; // データなしは減点なしだが満点も与えない
  }

  // 4. 出来高スパイクチェック（データある場合のみ必須）
  let volumeRatio: number | null = scan.volumeRatio ?? null;
  if (
    volumeRatio === null &&
    scan.volume !== null &&
    scan.avgVolume25 !== null &&
    scan.avgVolume25 > 0
  ) {
    volumeRatio = (scan.volume / scan.avgVolume25) * 100;
  }

  if (volumeRatio !== null) {
    if (volumeRatio < 150) {
      reasons.push(`出来高比率${volumeRatio.toFixed(0)}% - 25日平均の150%未満（スパイクなし）`);
      return { passed: false, reasons, score };
    }
    score += 20;
    if (volumeRatio >= 300) score += 10;
  } else {
    reasons.push("出来高: データなし（要確認）");
  }

  // 5. EPS成長率25%以上チェック（中小型株向け加点）
  if (scan.epsGrowthRate !== null) {
    if (scan.epsGrowthRate >= 25) {
      score += 10;
      reasons.push(`EPS成長率${scan.epsGrowthRate.toFixed(1)}% - 優良`);
    } else {
      reasons.push(
        `EPS成長率${scan.epsGrowthRate.toFixed(1)}% - 25%未満（成長性注意）`
      );
    }
  }

  // スコアを0-100に正規化
  const normalizedScore = Math.min(Math.round((score / maxScore) * 100), 100);

  reasons.push("全必須条件クリア");
  return { passed: true, reasons, score: normalizedScore };
}
