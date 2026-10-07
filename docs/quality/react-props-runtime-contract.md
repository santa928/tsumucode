# React導入のTSX・Props実行契約（Issue #116）

TypeScriptを学習前提に、作者用PR #82のQuestionCardを通常の学習画面へ接続する。今回の到達点は、型付きPropsの値を修正し、隔離された実React/React DOMの表示と指定内容を確認する1演習である。Courseはdraftのまま、正式公開とPath追加は#123で判断する。

## 学習範囲と後続Issue

| 学習目標                            | 今回の範囲                                         | 続きを受け持つIssue |
| ----------------------------------- | -------------------------------------------------- | ------------------- |
| Component                           | 表示を返す関数を読む                               | #117                |
| JSX                                 | 波括弧の値と実DOMへの変換を読む                    | #117                |
| Props                               | Question型に合う問題文を渡し、表示を確認する       | #117                |
| Composition                         | 今回は用意済みQuestionCardを利用する               | #117                |
| Event / State                       | 表示専用のため未導入                               | #118                |
| List / Key                          | 足場のmapとkeyを読み、書き換えは要求しない         | #118                |
| immutable update                    | 今回は初期の静的データだけ                         | #118                |
| Form / State配置 / lifting state up | 未導入                                             | #119                |
| Reducer / Context                   | 未導入                                             | #120                |
| Ref / Effectとcleanup / Custom Hook | 未導入。導出値を不要なEffectで同期する例は作らない | #121                |
| 型付き対話型App                     | 表示導入から段階的に統合する                       | #122                |
| 全Course品質・初心者受入・公開Path  | 技術試験を人の理解や実機試用の証明にしない         | #123                |

16トピックを削除・保留せず、#116 → #117 → #118 → #119 → #120/#121 → #122 → #123の依存順を維持する。Next.js、任意npm、任意Reactコードの実行は対象外。

## 固定toolchainと責務

lock済みのNode 24.18.0、TypeScript 6.0.3、React/React DOM 19.2.7、React型19.2.17、DOM型19.2.3、Vite 8.2.0を使う。新しい依存やCDNは追加しない。

React専用Workerが固定標準libと6つの固定React/DOM/csstype宣言だけを読む。strict/noUncheckedIndexedAccess/exactOptionalPropertyTypes/noEmitOnErrorを維持し、成功時だけJSとsource mapを返す。元TS専用のWorkerと型関係検査をReactへ切り替えない。欠落した宣言は学習者の誤型と区別してenvironment-errorへ閉じる。

Vite pluginは固定Reactを自己完結するESMの文字列にbuildする。学習者moduleを通常のJavaScript Analyzerで検査した後、予約stubの1moduleだけをその文字列へ置換する。固定exportはjsx/jsxs/Fragment/createRootだけ。管理UIはこの実行instanceを使わず、隔離iframe内だけで評価する。

Runnerがcompile・解析・描画・停止を管理し、Validatorが現在のTSXを再検査して実DOMと突き合わせる。CodeMirrorのTSX支援も演習で遅延登録する。

## 安全境界と世代

profile `props-card-v1`はmain.tsxの起動足場を固定し、Questionの文字列・文字列配列・数値だけを編集対象にする。QuestionCard.tsxは固定ASTと照合し、コメント・整形・意味を変えない括弧だけの差を認める。index.htmlとFile集合は固定原稿へ照合する。UIの読み取り専用表示だけを信頼せず、Importした下書きでも型・表示・HTMLの差し替えを拒否する。JSXの許可タグはQuestionCard/section/h1/ol/li/p、属性はquestion/aria-labelledby/id/keyに限定する。spread/ref/イベント/URL/HTML挿入、any/assertion/診断抑制、動的import、直接JSX factory import、後書きmutationを受理しない。描画失敗の試験用に、promptで文字列付きErrorをthrowするだけのgetterを認める。

iframeのsandboxはallow-scriptsのみ。既存CSP・管理DOMへのアクセス禁止・storage/credential/network無効化・実行予算を維持する。Reactのためにnative capabilityを追加で保存したり、グローバルの禁止を緩めたりしない。

full Source、runtime profile、session、revisionのSHA-256を実行証拠へ追加する。生成JSのgraph hashには固定React bundleも含める。Validatorは同じSourceの再compileとgraph照合に加え実DOMの文・選択肢・個数を評価する。型成功や固定DOMだけで合格としない。編集・停止・disposeで旧Workerとrealmを破棄し、Sessionの世代管理で古い採点結果を保存しない。

## 失敗と復帰

- 型失敗：元TSX位置とReact型診断を表示し、実行・採点しない。
- 描画失敗：初回同期renderをflushSyncでcommitし、子ComponentのErrorBoundaryとcreateRootの報告を実行時診断へ伝える。fallbackの表示だけで成功にしない。
- 環境失敗：Workerや固定宣言の欠落、非同期chunkの読込失敗を環境の案内にする。保存したSourceと合否履歴を変更せず再試行できる。React環境のchunk失敗後の「もう一度読み込む」は同じURLを読み直し、native importの失敗cacheを捨てて下書きを復元する。型・描画失敗の再実行はdocumentを読み直さない。

ErrorBoundaryの受入範囲は、この静的課題の初回同期子描画だけ。イベントhandler、timer、非同期処理、Effectの失敗や再描画は今回の完成範囲に含めない。後続対話型profileではそれぞれの完了・停止・例外契約を追加する。Resetだけは確認後に初期コードへ戻す。

## 性能予算と配信

Home/Path/Slideの初期graphへReact演習bundle、Compiler Worker、TSX Editorを混入させない。既存Home初期JSとEditor増分JSのgzip上限512000 bytesは維持する。Reactを含む演習全体の初回読込、低速端末p95、正式公開の追加予算は#123で測定・受入する。TS正式公開の承認をReactへ流用しない。

入力上限16files/131072 UTF-16 code units、Compiler deadline 10000ms、Analyzer deadline 500ms、DOM/module経路の同期guard 250ms・Runner全体1500ms、source map上限4194304 unitsを維持する。今回の静的profileの測定はDocker Chromiumでの技術観察で、低速実機の性能保証ではない。

#116完了時のbuildではHome初期JSはgzip 181767 bytes、React演習の静的graph増分（共通Editor込み、Compiler Worker別）は338184 bytesで、既存上限内。旧baseline比のHome増分23705 bytesは20480 bytesの注意目安を超え、既存のwarningとして記録する。硬い上限512000 bytesを緩和しない。

後続の純粋Component再利用・childrenの契約は[Component・Composition導入](react-component-composition-contract.md)を参照する。このprops-card-v1の受付範囲は維持する。

## 検証の範囲

教材には4Slide、1Exercise、3段階Hint、Starter/Solutionと5つの正負Fixtureがある。通常UIで型修正→実DOM→採点→保存/再読込→Reset、停止/編集の旧世代排除を確認する。Fixtureは実Worker/Runner/Validatorを通し、誤型、必須Prop不足、正例2つ、表示不一致、Source差し替え、描画例外と復帰を扱う。

変更関連Unit/Component/Content、型、Lint、build、配信graph、読み込み失敗と再試行、390pxのSlideとPC案内、PCの段階Hint・Keyboard・axeをDockerで確認する。既存の編集要件（幅1024px以上とマウス/トラックパッド）を維持し、390pxで編集できるとは案内しない。画像は実見する。内容と実装の独立レビューは別の台帳へ記録する。Firefox/WebKit、物理実機、人の初心者観察、全React Course/公開受入は#123へ残す。
