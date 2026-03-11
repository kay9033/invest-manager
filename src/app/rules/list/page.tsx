import Link from "next/link";
import { Section, SubSection, Tag, RulesTable } from "../components";

export default function ListRulesPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">銘柄リストアップルール</h1>
          <p className="mt-1 text-sm text-gray-400">CAN-SLIM + DUKE — フィルタリング・スコアリング基準</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/rules/trading" className="text-sm text-gray-500 hover:text-white">売買ルール →</Link>
          <Link href="/" className="text-sm text-gray-500 hover:text-white">← ホーム</Link>
        </div>
      </div>

      <Section title="1. 必須通過条件（Hard Filters）">
        <p className="text-xs text-gray-500">以下をすべて満たさない銘柄は即除外。</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <p className="text-xs text-gray-400 font-medium">1-1. 新高値ブレイク（N / DUKE）</p>
            <ul className="space-y-1 text-sm text-gray-300">
              <li className="flex gap-2"><span className="text-red-400 shrink-0">必須</span>52週高値・上場来高値の更新</li>
              <li className="flex gap-2"><span className="text-red-400 shrink-0">必須</span>正しいベースからのブレイク（逆張り高値掴みでない）</li>
            </ul>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-gray-400 font-medium">1-2. 出来高スパイク（N・S・DUKE）</p>
            <ul className="space-y-1 text-sm text-gray-300">
              <li className="flex gap-2"><span className="text-red-400 shrink-0">必須</span>25日平均の <Tag color="yellow">150%以上</Tag></li>
              <li className="flex gap-2"><span className="text-emerald-400 shrink-0">理想</span><Tag color="green">200%以上</Tag>（確信度の高いブレイク）</li>
            </ul>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-gray-400 font-medium">1-3. 最低流動性（S）</p>
            <ul className="space-y-1 text-sm text-gray-300">
              <li className="flex gap-2"><span className="text-red-400 shrink-0">必須</span>1日平均売買代金 <Tag color="yellow">5億円以上</Tag></li>
            </ul>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-gray-400 font-medium">1-4. 低位株・割安放置株の除外</p>
            <ul className="space-y-1 text-sm text-gray-300">
              <li className="flex gap-2"><span className="text-red-400 shrink-0">除外</span>株価 <Tag color="red">100円未満</Tag>（仕手性排除）</li>
              <li className="flex gap-2"><span className="text-red-400 shrink-0">除外</span>新高値を伴わない低PBR放置株（バリュートラップ）</li>
            </ul>
          </div>
        </div>
      </Section>

      <Section title="2. 成長性スクリーニング（CAN-SLIM: C・A）">
        <SubSection title="2-1. C：当期業績の加速（Current Quarterly Earnings）">
          <RulesTable
            headers={["指標", "最低基準", "理想"]}
            rows={[
              ["当期EPS成長率（前期比）", <Tag key="e" color="yellow">+25%以上</Tag>, "+40〜100%以上"],
              ["当期売上高成長率（前期比）", <Tag key="s" color="yellow">+25%以上</Tag>, "3四半期連続で加速"],
              ["EPS加速", "直近期の成長率 > 前期", "2〜3期連続で加速"],
            ]}
          />
          <p className="text-xs text-gray-500 mt-1">売上を伴わないEPS増加（経費削減のみ）は持続性がなく評価しない。</p>
        </SubSection>

        <SubSection title="2-2. A：年間業績の安定的成長（Annual Earnings Increases）">
          <RulesTable
            headers={["指標", "基準"]}
            rows={[
              ["年間EPS成長率", <><Tag key="a" color="yellow">3年連続+25%以上</Tag><span key="b" className="text-gray-500 text-xs ml-1">（最低でも直近2期）</span></>],
              ["ROE", <><Tag key="r1" color="yellow">17%以上</Tag><span key="r2" className="text-gray-500 text-xs ml-1">（オニール基準）、できれば </span><Tag key="r3" color="green">20%超</Tag></>],
              ["営業利益率", "改善傾向にあること"],
            ]}
          />
        </SubSection>
      </Section>

      <Section title="3. 市場での優位性（CAN-SLIM: L・I）">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SubSection title="3-1. L：主導銘柄か（Leader or Laggard）">
            <ul className="space-y-1 text-sm text-gray-300">
              <li>過去3ヶ月・6ヶ月の騰落率がTOPIXを上回ること</li>
              <li>市場下落日に逆行高している銘柄を最優先</li>
              <li className="text-gray-500 text-xs">RS上位30%以内が理想（IBD基準 RS70以上相当）</li>
            </ul>
          </SubSection>
          <SubSection title="3-2. I：機関投資家の動向（Institutional Sponsorship）">
            <ul className="space-y-1 text-sm text-gray-300">
              <li>直近決算で機関投資家の保有が増加傾向にあること</li>
              <li>信用倍率が低い（売り圧力が少ない）銘柄を優遇</li>
            </ul>
          </SubSection>
        </div>
      </Section>

      <Section title="4. ビッグチェンジの確認（N・DUKE）">
        <p className="text-sm text-gray-400">新高値を更新する銘柄には必ず「変化」がある。AI判定時にウェブ検索で最新ニュースを確認。</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            "新製品・新サービス・新業態（売上急増の構造変化）",
            "新経営陣による大変革（ターンアラウンド）",
            "業界トレンドの追い風（テーマ株・政策株）",
            "上方修正・増配・自社株買いの発表",
          ].map((item, i) => (
            <div key={i} className="bg-gray-800 rounded-lg p-3 text-gray-300 text-xs">{item}</div>
          ))}
        </div>
      </Section>

      <Section title="5. 除外条件">
        <RulesTable
          headers={["条件", "理由"]}
          rows={[
            [<Tag key="1" color="red">株価100円未満</Tag>, "仕手性が強く予測困難"],
            [<Tag key="2" color="red">売買代金5億円未満</Tag>, "流動性リスク・脱出困難"],
            [<Tag key="3" color="red">出来高スパイクなしの新高値</Tag>, "だましの可能性"],
            [<Tag key="4" color="red">年間EPSが2期以上連続減少</Tag>, "成長トレンド崩壊"],
            [<Tag key="5" color="red">万年割安株（新高値を伴わない低PBR）</Tag>, "バリュートラップ"],
            [<Tag key="6" color="red">市場全体が下落トレンド（M条件NG）</Tag>, "逆風の中では勝率低下"],
          ]}
        />
      </Section>

      <Section title="6. スコアリング基準（加点方式）">
        <RulesTable
          headers={["条件", "加点"]}
          rows={[
            ["新高値更新", <Tag key="s1" color="green">+20</Tag>],
            ["株価100円以上", <Tag key="s2" color="green">+10</Tag>],
            ["売買代金5億円以上", <Tag key="s3" color="green">+30</Tag>],
            ["売買代金2億円以上（追加）", <Tag key="s4" color="gray">+5</Tag>],
            ["売買代金10億円以上（追加）", <Tag key="s5" color="gray">+10</Tag>],
            ["出来高スパイク 150%以上", <Tag key="s6" color="green">+20</Tag>],
            ["出来高スパイク 300%以上（追加）", <Tag key="s7" color="gray">+10</Tag>],
            ["EPS成長率 25%以上（C条件）", <Tag key="s8" color="green">+10</Tag>],
            ["EPS加速（A・C条件）", <Tag key="s9" color="green">+8</Tag>],
            ["年間EPS3期連続+25%（A条件）", <Tag key="s10" color="green">+10</Tag>],
            ["年間EPS直近2期+25%", <Tag key="s10b" color="gray">+5</Tag>],
            ["売上成長率 25%以上（C条件）", <Tag key="s11" color="green">+10</Tag>],
            ["売上加速", <Tag key="s12" color="gray">+5</Tag>],
            ["上方修正あり", <Tag key="s13" color="green">+10</Tag>],
            ["ROE 20%以上（A条件）", <Tag key="s14" color="green">+8</Tag>],
            ["ROE 17%以上（A条件）", <Tag key="s15" color="gray">+5</Tag>],
            ["営業利益率改善傾向", <Tag key="s16" color="gray">+5</Tag>],
            ["RS良好（TOPIX比 3M・6M両方プラス）", <Tag key="s17" color="green">+8</Tag>],
            ["RS部分通過（どちらか一方）", <Tag key="s18" color="gray">+4</Tag>],
            ["機関投資家増加報告あり", <Tag key="s19" color="green">+5</Tag>],
            ["信用倍率1.5倍未満", <Tag key="s20" color="gray">+3</Tag>],
          ]}
        />
        <div className="bg-emerald-900/20 border border-emerald-800 rounded-lg p-3 text-sm text-emerald-300">
          最優先銘柄: 「新高値更新」＋「売上/EPS成長率+25%以上」＋「出来高スパイク」がすべて揃い、かつビッグチェンジが確認できる銘柄
        </div>
      </Section>
    </div>
  );
}
