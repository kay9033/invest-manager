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
  annualEpsGrowths?: (number | null)[];
  operatingMarginImproving?: boolean | null;
  marginRatio?: number | null;
  rs3m?: number | null;
  rs6m?: number | null;
  hasInstitutionalIncrease?: boolean | null;
}

export interface FilterResult {
  passed: boolean;
  reasons: string[];
  score: number; // 0-100
}

function r(reasons: string[], points: number, text: string): void {
  reasons.push(points > 0 ? `[+${points}] ${text}` : text);
}

/**
 * スコアリング設計（合計100点満点）
 *
 * オニール CAN-SLIM の優先度に従い配分:
 *   C条件（当期業績）: 最大45pt  ← 最重要
 *   A条件（年間業績）: 最大25pt
 *   L条件（主導銘柄）: 最大18pt
 *   S条件（出来高強度ボーナス）: 最大7pt  ← 150%は必須条件、200%超が加点
 *   I条件（機関投資家）: 最大5pt
 *
 * 必須通過条件（pass/fail のみ、スコアなし）:
 *   - 新高値更新
 *   - 株価100円以上
 *   - 売買代金5億円以上
 *   - 出来高スパイク150%以上（データなし時は通過）
 *   - 年次EPS2期連続マイナス → 除外
 */
export function filterStock(scan: ScanData): FilterResult {
  const reasons: string[] = [];
  let score = 0;

  // ══════════════════════════════════════════════
  // 必須通過条件（Hard Filters）
  // ══════════════════════════════════════════════

  // 1. 新高値更新（必須）
  if (!scan.isNewHigh) {
    reasons.push("新高値更新なし");
    return { passed: false, reasons, score: 0 };
  }

  // 2. 株価100円以上
  if (scan.closePrice !== null && scan.closePrice < 100) {
    reasons.push(`株価${scan.closePrice}円 - 低位株除外（100円未満）`);
    return { passed: false, reasons, score: 0 };
  }

  // 3. 売買代金5億円以上
  if (scan.tradingValue !== null && scan.tradingValue < 500_000_000) {
    reasons.push(`売買代金${(scan.tradingValue / 100_000_000).toFixed(1)}億円 - 5億円未満（流動性不足）`);
    return { passed: false, reasons, score: 0 };
  }

  // 4. 出来高スパイク150%以上
  let volumeRatio: number | null = scan.volumeRatio ?? null;
  if (volumeRatio === null && scan.volume !== null && scan.avgVolume25 !== null && scan.avgVolume25 > 0) {
    volumeRatio = (scan.volume / scan.avgVolume25) * 100;
  }
  if (volumeRatio !== null && volumeRatio < 150) {
    reasons.push(`出来高比率${volumeRatio.toFixed(0)}% - 25日平均の150%未満（スパイクなし）`);
    return { passed: false, reasons, score: 0 };
  }

  // 5. 年次EPS2期連続マイナス → 成長トレンド崩壊として除外
  if (scan.annualEpsGrowths && scan.annualEpsGrowths.length >= 2) {
    const valid = scan.annualEpsGrowths.filter((v): v is number => v !== null);
    if (valid.length >= 2 && valid.slice(-2).every(g => g < 0)) {
      reasons.push(`年間EPS2期連続減少（${valid.slice(-2).map(g => g.toFixed(1)).join("%, ")}%）- 成長トレンド崩壊`);
      return { passed: false, reasons, score: 0 };
    }
  }

  // 通過情報（スコアなし）
  reasons.push("全必須条件クリア（新高値・流動性・出来高スパイク）");
  if (scan.tradingValue !== null) {
    reasons.push(`売買代金${(scan.tradingValue / 100_000_000).toFixed(1)}億円`);
  }
  if (volumeRatio !== null) {
    reasons.push(`出来高比率${volumeRatio.toFixed(0)}%（25日平均比）`);
  } else {
    reasons.push("出来高データなし（要確認）");
  }

  // ══════════════════════════════════════════════
  // C条件: 当期業績（最大45pt） ← オニール最重要
  // ══════════════════════════════════════════════

  // EPS成長率（最大20pt）
  // オニール: 25%必須基準、40-100%以上が理想
  if (scan.epsGrowthRate !== null) {
    if (scan.epsGrowthRate >= 100) {
      score += 20;
      r(reasons, 20, `EPS成長率${scan.epsGrowthRate.toFixed(1)}% - 超優秀（100%以上）`);
    } else if (scan.epsGrowthRate >= 50) {
      score += 15;
      r(reasons, 15, `EPS成長率${scan.epsGrowthRate.toFixed(1)}% - 優秀（50%以上）`);
    } else if (scan.epsGrowthRate >= 25) {
      score += 10;
      r(reasons, 10, `EPS成長率${scan.epsGrowthRate.toFixed(1)}% - 良好（25%以上）`);
    } else if (scan.epsGrowthRate >= 0) {
      score += 3;
      r(reasons, 3, `EPS成長率${scan.epsGrowthRate.toFixed(1)}% - 増益`);
    } else {
      reasons.push(`EPS成長率${scan.epsGrowthRate.toFixed(1)}% - 減益注意`);
    }
  }

  // EPS加速（+5pt）
  if (scan.epsAccelerating === true) {
    score += 5;
    r(reasons, 5, "EPS加速中（直近期の成長率が前期を上回る）");
  } else if (scan.epsAccelerating === false) {
    reasons.push("EPS減速注意（成長率が鈍化）");
  }

  // 売上成長率（最大8pt）
  // 売上を伴わないEPS成長は持続性なし（オニール）
  if (scan.salesGrowthRate != null) {
    if (scan.salesGrowthRate >= 25) {
      score += 8;
      r(reasons, 8, `売上成長率${scan.salesGrowthRate.toFixed(1)}% - 良好（25%以上）`);
    } else if (scan.salesGrowthRate >= 0) {
      score += 3;
      r(reasons, 3, `売上成長率${scan.salesGrowthRate.toFixed(1)}% - 増収`);
    } else {
      reasons.push(`売上成長率${scan.salesGrowthRate.toFixed(1)}% - 減収注意`);
    }
  }

  // 売上加速（+4pt）
  if (scan.salesAccelerating === true) {
    score += 4;
    r(reasons, 4, "売上加速中（直近期の伸びが前期を上回る）");
  }

  // 上方修正（+8pt）- ビッグチェンジ（N条件）として評価
  if (scan.hasUpwardRevision) {
    score += 8;
    r(reasons, 8, "直近で上方修正あり - ビッグチェンジ（N条件）");
  }

  // ══════════════════════════════════════════════
  // A条件: 年間業績（最大25pt）
  // ══════════════════════════════════════════════

  // 年次EPS成長（最大12pt）
  if (scan.annualEpsGrowths && scan.annualEpsGrowths.length >= 2) {
    const valid = scan.annualEpsGrowths.filter((v): v is number => v !== null);
    if (valid.length >= 3 && valid.slice(-3).every(g => g >= 25)) {
      score += 12;
      r(reasons, 12, "年間EPS3期連続+25%以上（A条件クリア）");
    } else if (valid.length >= 2 && valid.slice(-2).every(g => g >= 25)) {
      score += 6;
      r(reasons, 6, "年間EPS直近2期+25%以上");
    }
  }

  // ROE（最大8pt）- オニール基準17%以上
  if (scan.roe != null) {
    if (scan.roe >= 20) {
      score += 8;
      r(reasons, 8, `ROE${scan.roe.toFixed(1)}% - 高収益（20%以上）`);
    } else if (scan.roe >= 17) {
      score += 5;
      r(reasons, 5, `ROE${scan.roe.toFixed(1)}% - 良好（17%以上・オニール基準）`);
    } else if (scan.roe > 0) {
      reasons.push(`ROE${scan.roe.toFixed(1)}%（17%未満）`);
    }
  }

  // 営業利益率改善（+5pt）
  if (scan.operatingMarginImproving === true) {
    score += 5;
    r(reasons, 5, "営業利益率改善傾向（A条件）");
  }

  // ══════════════════════════════════════════════
  // L条件: 主導銘柄 RS（最大18pt）
  // ══════════════════════════════════════════════

  // TOPIX比相対強度（Leader or Laggard）
  const rs3mPos = scan.rs3m != null && scan.rs3m > 0;
  const rs6mPos = scan.rs6m != null && scan.rs6m > 0;
  if (rs3mPos && rs6mPos) {
    if (scan.rs3m! >= 15 && scan.rs6m! >= 15) {
      // 両方+15%超 = 真の主導銘柄
      score += 18;
      r(reasons, 18, `RS優秀 - TOPIX比 3M:+${scan.rs3m!.toFixed(1)}%, 6M:+${scan.rs6m!.toFixed(1)}%（真の主導銘柄）`);
    } else {
      score += 12;
      r(reasons, 12, `RS良好 - TOPIX比 3M:+${scan.rs3m!.toFixed(1)}%, 6M:+${scan.rs6m!.toFixed(1)}%（L条件クリア）`);
    }
  } else if (rs3mPos || rs6mPos) {
    score += 6;
    const rs3mStr = scan.rs3m != null ? `3M:${scan.rs3m.toFixed(1)}%` : "";
    const rs6mStr = scan.rs6m != null ? `6M:${scan.rs6m.toFixed(1)}%` : "";
    r(reasons, 6, `RS部分通過 - TOPIX比 ${[rs3mStr, rs6mStr].filter(Boolean).join(", ")}`);
  } else if (scan.rs3m != null || scan.rs6m != null) {
    const rs3mStr = scan.rs3m != null ? `3M:${scan.rs3m.toFixed(1)}%` : "";
    const rs6mStr = scan.rs6m != null ? `6M:${scan.rs6m.toFixed(1)}%` : "";
    reasons.push(`RS劣位 - TOPIX比 ${[rs3mStr, rs6mStr].filter(Boolean).join(", ")}（L条件注意）`);
  }

  // ══════════════════════════════════════════════
  // S条件: 出来高強度ボーナス（最大7pt）
  // 150%は必須条件として通過済み。200%超から加点
  // ══════════════════════════════════════════════
  if (volumeRatio !== null) {
    if (volumeRatio >= 500) {
      score += 7;
      r(reasons, 7, `出来高${volumeRatio.toFixed(0)}% - 強烈スパイク（500%超）`);
    } else if (volumeRatio >= 300) {
      score += 5;
      r(reasons, 5, `出来高${volumeRatio.toFixed(0)}% - 強いスパイク（300%超）`);
    } else if (volumeRatio >= 200) {
      score += 3;
      r(reasons, 3, `出来高${volumeRatio.toFixed(0)}% - スパイク良好（200%超）`);
    }
  }

  // ══════════════════════════════════════════════
  // I条件: 機関投資家動向（最大5pt）
  // ══════════════════════════════════════════════

  // 大量保有報告（+3pt）
  if (scan.hasInstitutionalIncrease === true) {
    score += 3;
    r(reasons, 3, "直近6ヶ月以内に5%超保有者の増加報告あり（I条件クリア）");
  } else if (scan.hasInstitutionalIncrease === false) {
    reasons.push("大量保有者の増加報告なし（直近6ヶ月）");
  }

  // 信用倍率（最大+2pt）
  if (scan.marginRatio != null) {
    if (scan.marginRatio < 1.5) {
      score += 2;
      r(reasons, 2, `信用倍率${scan.marginRatio.toFixed(2)}倍 - 低水準（売り圧力少）`);
    } else if (scan.marginRatio >= 5) {
      reasons.push(`信用倍率${scan.marginRatio.toFixed(2)}倍 - 高水準注意（売り圧力リスク）`);
    } else {
      reasons.push(`信用倍率${scan.marginRatio.toFixed(2)}倍`);
    }
  }

  // スコアは設計上0-100点満点（正規化不要）
  return { passed: true, reasons, score: Math.min(score, 100) };
}
