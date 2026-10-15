# Tailwind最初のレッスン（Issue128）

以下はIssue128時点の対象と検証記録。現在の追加入力契約と3単位の教材は[基本・状態・レスポンシブ](tailwind-foundations.md)を参照する。

HTML/CSSのclass・Box・Flexを既習前提とする草稿1レッスン。4Slide、標準演習1件、20分。CSSのdisplay・gap・paddingをUtilityと実際の見た目へ対応させる。全課程・制作・本番CSS生成・公開はIssue129〜131で別途扱う。

## 固定compilerと配信

公式`@tailwindcss/browser 4.3.2`の配布物を変更せず、`public/tailwind-runtime/4.3.2/`へ同梱する。MIT原文・copyrightはNOTICES.html、取得元・archive hashはmanifest.jsonに記録する。registryのSHA512 integrityを照合して取得した。依存導入・install scriptは不要。

| 項目              | 固定値                                                           |
| ----------------- | ---------------------------------------------------------------- |
| browser.global.js | 276617 bytes                                                     |
| gzip実測          | 72138 bytes（配信性能SLAではない）                               |
| SHA256            | 0bc32045dd897c063f4966c608bbbe373e035fcafcb3dd8ee3b315d5e6165410 |
| 取得              | 演習の初回renderのみ、同origin・credentials omit・redirect拒否   |
| 取得境界          | 5秒、bounded stream、容量完全一致、全bytes SHA256                |

Home・Path・Slide読書へcompilerを取得しない。公開一覧と学習パスには草稿を追加しない。既存のHome初期JS容量上限・Editor／Runnerの遅延chunk境界を維持する。公式のブラウザcompilerは開発用であり、アプリ本体の本番CSS生成には使わない。制作物の本番CSSはIssue130で別に生成する。

## 入力と採点の境界

index.htmlだけ、公開assetなし。UTF-8で16KiB、128要素、class候補合計64個・1個64文字まで。有限のHTML要素とclass/id/lang/aria-label属性を許可する。追加CSS・style属性・script・外部参照を許可しない。

- Utility：flex、block、inline-block、flex-row/col、gapとpの0/2/4/8、border、border-slate-400、rounded、bg-slate-100、bg-white、text-slate-900、text-lg、font-bold。
- 数値別解：gapとpの0〜128px・0〜8rem、小数は2桁まで。
- 未知の通常class：原文は保存し、警告を表示。compilerへ渡すDOMからそのclassだけを除外し、実際のStyleで未達を判断する。
- variant、任意Property、url/function、plugin/config、巨大入力：具体的な日本語診断で採点を止める。Sourceは保存したまま。

演習の初期Previewは360×240pxとし、3列の学習画面でも余白と文字を読める寸法で表示する。classを持つ対象DOMと実computed-styleと2項目を5Ruleで照合する。CSSだけの代用は入力境界で拒否する。Starter・正例・小数数値別解・誤display/gap/padding・誤class・誤方向・項目不足の9Fixtureを使う。FixtureとSolutionはauthoring情報で、配信payloadへ含めない。

## 初回CSSの完了と取消

既存HTML/CSS Runnerのgeneration・frame・abort照合、session/revision/token認証、旧Preview復旧、disposeを共有する。CSPとBridgeの既存5秒期限を変更しない。iframeはallow-scriptsだけのopaque origin。nonce script、connect/worker/frame/object/base/form noneを維持する。

学習DOM全量をparseした後に、nonce script内で固定bundleを実行する。compilerが同期的にheadへ追加した唯一のstyleのElement identityを捕捉する。そのstyle自身のCSSRuleとtrusted確認用Utilityの実computed gapを照合してからBridgeを起動する。空style・preflightだけ・別styleのCSSをready扱いしない。確認用DOMとbootstrap scriptはBridge開始前に除去する。

この完了判定は汎用のTailwind APIではない。固定配布物の初回full buildは全Utilityを`Ct.build`で作り、唯一の`ir.textContent`代入で一括commitすることを確認した。この固定version/hashと有限入力に依存する。versionを更新するときは出力style・一括commit・CSP・取消と正負Fixtureを再検証する。

取得失敗・hash不一致・未readyは環境障害として未採点。成功していないSourceを達成へ進めず、下書きを保持して再試行する。旧Previewの復旧後も、新revisionのSnapshotとしては利用できない。

## 検証

対象のDocker型・unit、実compiler全Fixture、ready故障／取消／旧版復旧、通常UIの判定・保存・Hint・Reset・取得失敗後の再試行、PC/390pxの全Slide・図・a11y・compiler取得0を確認する。手書きソースは通常整形、公式vendorのminified配布物だけを原文で保持する。

技術検証を人による学習受入や実機性能測定へ一般化しない。Pages公開はこの変更では行わない。

参照：[公式browsercompilerの用途](https://tailwindcss.com/docs/installation/play-cdn)、[gap](https://tailwindcss.com/docs/gap)、[padding](https://tailwindcss.com/docs/padding)。
