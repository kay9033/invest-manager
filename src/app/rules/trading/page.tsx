import Link from "next/link";
import { Section, SubSection, Tag, RulesTable } from "../components";

export default function TradingRulesPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">売買ルール</h1>
          <p className="mt-1 text-sm text-gray-400">CAN-SLIM + DUKE — エントリー・損切り・利確基準</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/rules/list" className="text-sm text-gray-500 hover:text-white">← リストアップルール</Link>
          <Link href="/" className="text-sm text-gray-500 hover:text-white">← ホーム</Link>
        </div>
      </div>

      <Section title="1. 買い（エントリー）">
        <SubSection title="1-1. エントリーポイント（共通）">
          <ul className="space-y-1.5 text-sm text-gray-300">
            <li><span className="text-gray-500 mr-2">ピボット:</span>カップウィズハンドルのハンドル最高値、フラットベース上限、VCPの収束点などのブレイク</li>
            <li><span className="text-gray-500 mr-2">価格条件:</span>ピボットから <Tag color="yellow">+5%以内</Tag> でエントリー（超えたら見送り）</li>
            <li><span className="text-gray-500 mr-2">出来高条件:</span>ブレイク当日が <Tag color="yellow">25日平均比150%以上</Tag>（理想は200%以上）</li>
          </ul>
        </SubSection>

        <SubSection title="1-2. ベース別エントリー基準">
          <RulesTable
            headers={["パターン", "エントリー", "特記事項"]}
            rows={[
              ["カップウィズハンドル（CwH）", "ハンドル高値のブレイク", "ハンドルの下落は15%以内が理想"],
              ["フラットベース", "ベース上限のブレイク", "調整が5〜15%で浅いもの"],
              ["VCP（ボラティリティ収束）", "収束最終段階のブレイク", "中小型株で特に有効"],
              ["ボックス圏上放れ（DUKE）", "ボックス上限のブレイク", "1/5ポジションから開始"],
            ]}
          />
        </SubSection>

        <SubSection title="1-3. AIの判定出力">
          <div className="flex flex-wrap gap-3 text-sm">
            <div className="flex items-center gap-2 bg-emerald-900/20 border border-emerald-800 rounded-lg px-3 py-2">
              <Tag color="green">BUY</Tag>
              <span className="text-gray-300">ピボット突破直後（+5%以内）＋ 出来高スパイク</span>
            </div>
            <div className="flex items-center gap-2 bg-yellow-900/20 border border-yellow-800 rounded-lg px-3 py-2">
              <Tag color="yellow">WATCH</Tag>
              <span className="text-gray-300">ピボットから+5%超の乖離（押し目待ち）</span>
            </div>
            <div className="flex items-center gap-2 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
              <Tag color="red">SELL</Tag>
              <span className="text-gray-300">25日線を割り込んでいる</span>
            </div>
          </div>
        </SubSection>
      </Section>

      <Section title="2. ポジション管理（DUKE方式）">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          {[
            { label: "初期ポジション", value: "総資金の 1/5（20%）上限" },
            { label: "買い増し", value: "利益が乗った段階のみ 1/5 ずつ追加" },
            { label: "最大保有（同一銘柄）", value: "総資金の 1/5 以内" },
            { label: "同時保有銘柄数", value: "最大 5 銘柄" },
            { label: "ナンピン", value: "厳禁（含み損への追加買い禁止）" },
          ].map((item, i) => (
            <div key={i} className="bg-gray-800 rounded-lg p-3">
              <p className="text-xs text-gray-500">{item.label}</p>
              <p className="mt-1 text-gray-200">{item.value}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="3. 損切り（ストップロス）">
        <RulesTable
          headers={["状況", "損切り基準"]}
          rows={[
            ["基本ルール（オニール）", <><Tag key="sl1" color="red">ピボットから -7〜8%</Tag><span key="sl1b" className="text-gray-400 text-xs ml-2">で即座に損切り</span></>],
            ["超大型株（低ボラ）", <><Tag key="sl2" color="red">-5%</Tag><span key="sl2b" className="text-gray-400 text-xs ml-2">でタイトに設定</span></>],
            ["DUKE方式", <><Tag key="sl3" color="red">購入価格から -10%</Tag><span key="sl3b" className="text-gray-400 text-xs ml-2">またはボックス底面を割れた時点（先に来た方）</span></>],
          ]}
        />
        <p className="text-xs text-gray-500">損切りは感情を排して機械的に実行。「もう少し待てば戻るかも」は禁止。</p>
      </Section>

      <Section title="4. 利益確定">
        <SubSection title="4-1. 基本ルール（オニール）">
          <ul className="space-y-1.5 text-sm text-gray-300">
            <li><Tag color="green">+20〜25%</Tag> で部分利確を検討</li>
            <li>例外: ブレイク後 <span className="text-white">2〜3週間で+20%以上</span> 達成した場合 → <Tag color="yellow">最低8週間ホールド</Tag>（強い上昇トレンドは継続）</li>
          </ul>
        </SubSection>

        <SubSection title="4-2. クライマックストップ（天井圏のシグナル）">
          <p className="text-xs text-gray-500 mb-2">以下が重なった場合は利確を優先する：</p>
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
            {[
              "週足で数週間連続の異常な急騰（クライマックス・ラン）",
              "急騰に伴う出来高の異常増（それまでの2〜3倍超）",
              "大陽線の後に大陰線（レールロードトラック）",
              "長期上昇の末の窓開けギャップアップ（Exhaustion Gap）",
            ].map((s, i) => (
              <div key={i} className="flex gap-1.5">
                <span className="text-amber-400 shrink-0">!</span>
                <span>{s}</span>
              </div>
            ))}
          </div>
        </SubSection>

        <SubSection title="4-3. トレンドフォロー型利確">
          <ul className="space-y-1 text-sm text-gray-300">
            <li>終値で <Tag color="yellow">25日移動平均線を完全に割り込む</Tag> → 全数または半数売却</li>
            <li>クライマックスシグナル時は優先して利確</li>
          </ul>
        </SubSection>
      </Section>

      <Section title="5. 監視継続（WATCH）">
        <ul className="space-y-1.5 text-sm text-gray-300">
          <li><span className="text-emerald-400 mr-2">◎</span><span className="text-white">新高値圏でのもみ合い</span> — 上昇への準備期間として継続監視</li>
          <li><span className="text-emerald-400 mr-2">◎</span><span className="text-white">5%以内の押し目</span> — ベースの一部として許容、買い増し検討ポイント</li>
          <li><span className="text-emerald-400 mr-2">◎</span><span className="text-white">ビッグチェンジの再確認</span> — 上方修正・新製品発表・増配などポジティブ材料の継続を確認</li>
        </ul>
      </Section>

      <Section title="6. 市場環境の確認（M: CAN-SLIMのM条件）">
        <p className="text-sm text-gray-400 mb-3">市場全体が下落トレンド（Distribution Day が多発）の場合：</p>
        <div className="flex flex-wrap gap-3 text-sm">
          <div className="bg-red-900/20 border border-red-800 rounded-lg px-3 py-2 text-gray-300">新規エントリーを停止</div>
          <div className="bg-red-900/20 border border-red-800 rounded-lg px-3 py-2 text-gray-300">既存ポジションの損切りラインを引き締める</div>
          <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg px-3 py-2 text-gray-300">市場が回復するまで WATCH 格で保留</div>
        </div>
        <p className="text-xs text-gray-500 mt-2">AIは判定時にウェブ検索で市場全体の動向（日経・TOPIX）を確認する。</p>
      </Section>
    </div>
  );
}
