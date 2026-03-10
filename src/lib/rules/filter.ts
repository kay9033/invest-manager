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
  annualEpsGrowths?: (number | null)[];      // 年次EPS前期比成長率の配列（古い順）
  operatingMarginImproving?: boolean | null; // 営業利益率が改善傾向か
  marginRatio?: number | null;               // 信用倍率
  rs3m?: number | null;                      // 3ヶ月RS（TOPIX比超過リターン）
  rs6m?: number | null;                      // 6ヶ月RS（TOPIX比超過リターン）
  hasInstitutionalIncrease?: boolean | null; // 直近6ヶ月以内に5%超保有者の増加報告があるか（I条件）
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

  // 5c. 年次EPS成長率チェック（A条件）
  if (scan.annualEpsGrowths && scan.annualEpsGrowths.length >= 2) {
    const valid = scan.annualEpsGrowths.filter((v): v is number => v !== null);
    // 除外条件: 2期以上連続減少
    if (valid.length >= 2 && valid.slice(-2).every(g => g < 0)) {
      reasons.push(`年間EPS2期連続減少（${valid.slice(-2).map(g => g.toFixed(1)).join("%, ")}%）- 成長トレンド崩壊`);
      return { passed: false, reasons, score };
    }
    // 加点: 3期連続+25%以上 → A条件クリア
    if (valid.length >= 3 && valid.slice(-3).every(g => g >= 25)) {
      score += 10;
      reasons.push("年間EPS3期連続+25%以上（A条件クリア）");
    } else if (valid.length >= 2 && valid.slice(-2).every(g => g >= 25)) {
      score += 5;
      reasons.push("年間EPS直近2期+25%以上");
    }
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

  // 9. 営業利益率の改善傾向（A条件）
  if (scan.operatingMarginImproving === true) {
    score += 5;
    reasons.push("営業利益率改善傾向（A条件）");
  }

  // 10. L条件: TOPIX比相対強度（RS）
  const rs3mPos = scan.rs3m !== null && scan.rs3m !== undefined && scan.rs3m > 0;
  const rs6mPos = scan.rs6m !== null && scan.rs6m !== undefined && scan.rs6m > 0;
  if (rs3mPos && rs6mPos) {
    score += 8;
    reasons.push(`RS良好 - TOPIX比 3M:+${scan.rs3m!.toFixed(1)}%, 6M:+${scan.rs6m!.toFixed(1)}%（L条件クリア）`);
  } else if (rs3mPos || rs6mPos) {
    score += 4;
    const rs3mStr = scan.rs3m != null ? `3M:${scan.rs3m.toFixed(1)}%` : "";
    const rs6mStr = scan.rs6m != null ? `6M:${scan.rs6m.toFixed(1)}%` : "";
    reasons.push(`RS部分通過 - TOPIX比 ${[rs3mStr, rs6mStr].filter(Boolean).join(", ")}`);
  } else if (scan.rs3m != null || scan.rs6m != null) {
    const rs3mStr = scan.rs3m != null ? `3M:${scan.rs3m.toFixed(1)}%` : "";
    const rs6mStr = scan.rs6m != null ? `6M:${scan.rs6m.toFixed(1)}%` : "";
    reasons.push(`RS劣位 - TOPIX比 ${[rs3mStr, rs6mStr].filter(Boolean).join(", ")}（L条件注意）`);
  }

  // 11. I条件: 信用倍率（低いほど売り圧力が少ない）+ 大量保有報告増加
  if (scan.hasInstitutionalIncrease === true) {
    score += 5;
    reasons.push("直近6ヶ月以内に5%超保有者の増加報告あり（I条件クリア）");
  } else if (scan.hasInstitutionalIncrease === false) {
    reasons.push("大量保有者の増加報告なし（直近6ヶ月）");
  }

  if (scan.marginRatio != null) {
    if (scan.marginRatio < 1.5) {
      score += 3;
      reasons.push(`信用倍率${scan.marginRatio.toFixed(2)}倍 - 低水準（I条件良好）`);
    } else if (scan.marginRatio >= 5) {
      reasons.push(`信用倍率${scan.marginRatio.toFixed(2)}倍 - 高水準注意（売り圧力リスク）`);
    } else {
      reasons.push(`信用倍率${scan.marginRatio.toFixed(2)}倍`);
    }
  }

  // スコアを0-100に正規化
  const normalizedScore = Math.min(Math.round((score / maxScore) * 100), 100);

  reasons.push("全必須条件クリア");
  return { passed: true, reasons, score: normalizedScore };
}
