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
  newsSearched: boolean; // ウェブ検索を使ったか
}

const SYSTEM_PROMPT = `あなたは日本株の投資アシスタントです。以下のルールに基づいて売買判定を行ってください。

## ステップ1: 最新情報の収集
銘柄コードと社名でウェブ検索を行い、以下を確認してください:
- 直近の決算発表・業績修正（上方修正 or 下方修正）
- 増配・自社株買い・M&Aなどの重要発表
- 業界トレンドやテーマ性
- 「だまし」を示す否定的なニュース

## ステップ2: 売買判定ルール

### 買い（BUY）
- 抵抗線突破直後 + 出来高スパイク（25日平均比150%以上）
- 大型株: フラットベース・25日線タッチからの反発
- 中小型株: カップウィズハンドル・VCP（ボラティリティ収束）パターン
- 上方修正・増配・自社株買いなどポジティブ材料あり

### 押し目待ち（WATCH）
- 5%以上乖離している → 押し目を待つ
- 新高値圏でのもみ合い → 上昇準備期間として継続監視

### 売り（SELL）
- 終値で25日移動平均線を完全に割り込む
- 週足レベルで数週間乖離しすぎ + 出来高異常増 → 半分利確
- 損切りライン: 基本-7%（超大型株は-5%）

## 必須確認事項
- 出来高を伴わない新高値は「だまし」の可能性 → WATCH以下に格下げ
- 売買代金5億円未満は流動性リスク → WATCHに格下げ
- 低位株（100円未満）・万年割安株は除外

## 出力形式
分析の最後に必ずJSON形式で判定を返してください:
\`\`\`json
{
  "status": "BUY" または "WATCH" または "SELL",
  "reason": "判定理由（日本語、300字以内。ウェブ検索で得た情報も含めること）",
  "confidence": 0から100の整数
}
\`\`\``;

export async function judgeStock(
  stockData: StockJudgeInput
): Promise<JudgeResult> {
  const volumeRatioDisplay =
    stockData.volumeRatio !== null
      ? `${stockData.volumeRatio.toFixed(0)}%`
      : stockData.volume !== null && stockData.avgVolume25 !== null
        ? `${((stockData.volume / stockData.avgVolume25) * 100).toFixed(0)}%`
        : "不明";

  const userMessage = `以下の銘柄について、まずウェブ検索で最新ニュースを調べてから、売買判定を行ってください。

【銘柄情報】
銘柄コード: ${stockData.code}
社名: ${stockData.name}
株価: ${stockData.closePrice !== null ? `${stockData.closePrice.toLocaleString()}円` : "不明"}
売買代金: ${stockData.tradingValue !== null ? `${(stockData.tradingValue / 100_000_000).toFixed(1)}億円` : "不明"}
出来高: ${stockData.volume !== null ? stockData.volume.toLocaleString() : "不明"}
25日平均出来高: ${stockData.avgVolume25 !== null ? stockData.avgVolume25.toLocaleString() : "不明"}
出来高比率: ${volumeRatioDisplay}
時価総額: ${stockData.marketCap !== null ? `${(stockData.marketCap / 100_000_000).toFixed(0)}億円` : "不明"}
EPS成長率(前期比): ${stockData.epsGrowthRate !== null ? `${stockData.epsGrowthRate.toFixed(1)}%` : "不明"}
売上高成長率(前期比): ${stockData.salesGrowthRate !== null ? `${stockData.salesGrowthRate.toFixed(1)}%` : "不明"}
RS(3ヶ月): ${stockData.rs3m !== null ? `${stockData.rs3m.toFixed(1)}%` : "不明"}
RS(6ヶ月): ${stockData.rs6m !== null ? `${stockData.rs6m.toFixed(1)}%` : "不明"}
新高値更新: ${stockData.isNewHigh ? "はい（52週高値更新）" : "いいえ"}

検索クエリの例: "${stockData.name} 株 決算 業績 2026" や "${stockData.code} ${stockData.name} ニュース"

最新情報を踏まえて判定してください。`;

  // web_search ツールを有効化してリクエスト
  // beta header: "web-search-2025-03-05"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createWithBeta = client.messages.create.bind(client.messages) as any;
  const response = (await createWithBeta(
    {
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      tools: [
        {
          type: "web_search_20260209",
          name: "web_search",
          max_uses: 3,
        },
      ],
      messages: [{ role: "user", content: userMessage }],
    },
    {
      headers: { "anthropic-beta": "web-search-2025-03-05" },
    }
  )) as Anthropic.Message;

  // レスポンスからテキストブロックを抽出
  const textBlocks = response.content.filter(
    (block) => block.type === "text"
  ) as Array<{ type: "text"; text: string }>;

  const fullText = textBlocks.map((b) => b.text).join("\n");

  // ウェブ検索を使ったか確認 (tool_use ブロックの存在で判定)
  const newsSearched = response.content.some(
    (block) => block.type === "tool_use"
  );

  // JSONを抽出（```json ... ``` または裸のJSONに対応）
  const jsonMatch =
    fullText.match(/```json\s*(\{[\s\S]*?\})\s*```/) ??
    fullText.match(/(\{[\s\S]*"status"[\s\S]*\})/);

  if (!jsonMatch) {
    // JSONが見つからない場合はフォールバック
    console.warn("[judge] JSON not found in response:", fullText.slice(0, 200));
    return { status: "WATCH", reason: fullText.slice(0, 300), confidence: 30, newsSearched };
  }

  const parsed = JSON.parse(jsonMatch[1]) as {
    status: string;
    reason: string;
    confidence: number;
  };

  if (!["BUY", "WATCH", "SELL"].includes(parsed.status)) {
    throw new Error(`Invalid status: ${parsed.status}`);
  }

  return {
    status: parsed.status as "BUY" | "WATCH" | "SELL",
    reason: parsed.reason,
    confidence: Math.max(0, Math.min(100, Math.round(parsed.confidence))),
    newsSearched,
  };
}
