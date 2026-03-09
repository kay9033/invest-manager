import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface StockJudgeInput {
  code: string;
  name: string;
  closePrice: number | null;
  volume: number | null;
  avgVolume25: number | null;
  tradingValue: number | null;
  epsGrowthRate: number | null;
  salesGrowthRate: number | null;
  marketCap: number | null;
  volumeRatio: number | null;
  rs3m: number | null;
  rs6m: number | null;
  isNewHigh: boolean;
}

export interface JudgeResult {
  status: "BUY" | "WATCH" | "SELL";
  reason: string;
  confidence: number; // 0-100
}

const SYSTEM_PROMPT = `あなたは日本株の投資アシスタントです。以下のルールに基づいて売買判定を行ってください。

## 買い（エントリー）判定ルール
- ベース形成の質を確認: 大型株はフラットベース・25日線タッチからの反発、中小型株はカップウィズハンドル・VCPパターン
- ピボット突破の強度: 抵抗線突破直後 → [BUY]
- 5%以上乖離している場合 → [WATCH]（押し目待ち）

## 売り（エグジット）判定ルール
- 損切りライン: 基本-7%（超大型株は-5%）
- 利確: 終値で25日移動平均線を完全に割り込むまでホールド
- 異常値（クライマックス）: 週足レベルで数週間乖離しすぎ + 出来高異常増 → 半分利確推奨

## 必須確認事項
- 新高値更新時の出来高スパイク（25日平均の150%以上）を伴わない場合は「だまし」の可能性あり
- 売買代金5億円未満は流動性リスクあり
- 低位株（100円未満）は除外

## 出力形式
JSON形式で以下を返してください:
{
  "status": "BUY" | "WATCH" | "SELL",
  "reason": "判定理由（日本語、200字以内）",
  "confidence": 0から100の整数
}`;

export async function judgeStock(
  stockData: StockJudgeInput
): Promise<JudgeResult> {
  const volumeRatioDisplay =
    stockData.volumeRatio !== null
      ? `${stockData.volumeRatio.toFixed(0)}%`
      : stockData.volume !== null && stockData.avgVolume25 !== null
        ? `${((stockData.volume / stockData.avgVolume25) * 100).toFixed(0)}%`
        : "不明";

  const userMessage = `以下の銘柄を分析して売買判定を行ってください。

銘柄コード: ${stockData.code}
社名: ${stockData.name}
株価: ${stockData.closePrice !== null ? `${stockData.closePrice.toLocaleString()}円` : "不明"}
売買代金: ${stockData.tradingValue !== null ? `${(stockData.tradingValue / 100_000_000).toFixed(1)}億円` : "不明"}
出来高: ${stockData.volume !== null ? stockData.volume.toLocaleString() : "不明"}
25日平均出来高: ${stockData.avgVolume25 !== null ? stockData.avgVolume25.toLocaleString() : "不明"}
出来高比率: ${volumeRatioDisplay}
時価総額: ${stockData.marketCap !== null ? `${(stockData.marketCap / 100_000_000).toFixed(0)}億円` : "不明"}
EPS成長率: ${stockData.epsGrowthRate !== null ? `${stockData.epsGrowthRate.toFixed(1)}%` : "不明"}
売上高成長率: ${stockData.salesGrowthRate !== null ? `${stockData.salesGrowthRate.toFixed(1)}%` : "不明"}
RS(3ヶ月): ${stockData.rs3m !== null ? `${stockData.rs3m.toFixed(1)}%` : "不明"}
RS(6ヶ月): ${stockData.rs6m !== null ? `${stockData.rs6m.toFixed(1)}%` : "不明"}
新高値更新: ${stockData.isNewHigh ? "はい" : "いいえ"}

上記データを元に、売買ルールに基づいた判定をJSON形式で返してください。`;

  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude API");
  }

  // JSONを抽出
  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Could not parse JSON from Claude response");
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    status: "BUY" | "WATCH" | "SELL";
    reason: string;
    confidence: number;
  };

  if (!["BUY", "WATCH", "SELL"].includes(parsed.status)) {
    throw new Error(`Invalid status: ${parsed.status}`);
  }

  return {
    status: parsed.status,
    reason: parsed.reason,
    confidence: Math.max(0, Math.min(100, Math.round(parsed.confidence))),
  };
}
