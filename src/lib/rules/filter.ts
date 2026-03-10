export interface ScanData {
  code: string;
  name?: string;
  closePrice: number | null;
  volume: number | null;
  avgVolume25: number | null;
  tradingValue: number | null;
  epsGrowthRate: number | null;
  salesGrowthRate?: number | null;
  isNewHigh: boolean;
  volumeRatio?: number | null;
  // 財務ページ由来
  epsAccelerating?: boolean | null;
  salesAccelerating?: boolean | null;
  hasUpwardRevision?: boolean;
  roe?: number | null;
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

  // 5. EPS成長率チェック（中小型株: 25%以上優先 / C&A利益の加速）
  if (scan.epsGrowthRate !== null) {
    if (scan.epsGrowthRate >= 25) {
      score += 10;
      reasons.push(`EPS成長率${scan.epsGrowthRate.toFixed(1)}% - 優良（25%以上）`);
    } else if (scan.epsGrowthRate >= 0) {
      score += 3;
      reasons.push(`EPS成長率${scan.epsGrowthRate.toFixed(1)}% - 増益`);
    } else {
      reasons.push(`EPS成長率${scan.epsGrowthRate.toFixed(1)}% - 減益注意`);
    }
  }

  // 5b. EPS加速（C&A: 利益の加速）
  if (scan.epsAccelerating === true) {
    score += 8;
    reasons.push("EPS加速中（直近期の成長率が前期を上回る）");
  } else if (scan.epsAccelerating === false) {
    reasons.push("EPS減速注意（成長率が鈍化）");
  }

  // 6. 売上高成長率チェック（C条件: +25%以上）
  if (scan.salesGrowthRate != null) {
    const sgr = scan.salesGrowthRate!;
    if (sgr >= 25) {
      score += 10;
      reasons.push(`売上成長率${sgr.toFixed(1)}% - 優先条件クリア（25%以上）`);
    } else if (sgr >= 0) {
      score += 3;
      reasons.push(`売上成長率${sgr.toFixed(1)}% - 増収`);
    } else {
      reasons.push(`売上成長率${sgr.toFixed(1)}% - 減収注意`);
    }
  }

  // 6b. 売上加速
  if (scan.salesAccelerating === true) {
    score += 5;
    reasons.push("売上加速中（直近期の伸びが前期を上回る）");
  }

  // 7. 上方修正フラグ（大型株の重要カタリスト）
  if (scan.hasUpwardRevision) {
    score += 10;
    reasons.push("直近で上方修正あり - 重要ポジティブ材料");
  }

  // 8. ROEチェック（A条件: 17%以上+5, 20%以上+3追加）
  if (scan.roe != null) {
    if (scan.roe >= 20) {
      score += 8; // 17%以上+5 + 20%以上+3
      reasons.push(`ROE${scan.roe.toFixed(1)}% - 高収益（20%以上）`);
    } else if (scan.roe >= 17) {
      score += 5;
      reasons.push(`ROE${scan.roe.toFixed(1)}% - 良好（17%以上）`);
    } else if (scan.roe > 0) {
      reasons.push(`ROE${scan.roe.toFixed(1)}%`);
    }
  }

  // スコアを0-100に正規化
  const normalizedScore = Math.min(Math.round((score / maxScore) * 100), 100);

  reasons.push("全必須条件クリア");
  return { passed: true, reasons, score: normalizedScore };
}
