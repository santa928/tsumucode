# Python関数・Listの段階化と移動契約

Issue #259は、旧関数Lessonの複合目標を同じ加算題材の5段階へ分け、Listの基礎操作・反復を既存の参照共有へ接続する。旧教材の合格を新目標の習得へ転記しない。自動採点とAIの教材試用は、実人の理解・自力記述・実務能力の証明ではない。

| 旧対象                           | 改訂後の目標                 | 前提            | 自分で書く範囲・支援の段階                               | 合格が確認する範囲                               |
| -------------------------------- | ---------------------------- | --------------- | -------------------------------------------------------- | ------------------------------------------------ |
| l05のList・反復・参照共有        | l05-values: 生成・参照・変更 | 値・変数・print | Listの生成から更新・表示まで記述する                     | 同じListを読み書きし、更新後の値を表示する       |
| 同上                             | l05-iterate: Listの反復      | 基礎操作・for   | Listは用意し、初期化・加算・表示を記述する               | 要素を反復して集計し、結果を使用する             |
| 同上                             | 既存l05: 参照共有            | 上記2段階       | 既存ガイド練習を保持する                                 | alias経由の変更と再代入の違いを確かめる          |
| 旧l07: 定義・引数・return・scope | l07: 定義と呼出し            | 変数・print     | 定義済み関数の呼出しを2回記述する                        | 定義だけでは実行されず、実呼出しが必要と確認する |
| 同上                             | l08: 引数                    | 定義と呼出し    | 引数を使う式を修正し、別入力の呼出しを追加する           | 両方の引数を和に使い、2組の値へ適用する          |
| 同上                             | l09: 戻り値の利用            | 引数            | 関数本体と呼出しを自作し、結果を保存・計算に使う         | 2回の戻り値が次の計算と表示へ届く                |
| 同上                             | l10: print・return・None     | 戻り値の利用    | 表示関数は保持し、値を返す関数と呼出しを自作する         | 表示する処理と値を返す処理を区別する             |
| 同上                             | l11: scope                   | 上記4段階       | 外側のleftと仕様だけを手掛かりに関数・呼出しを記述する   | 引数内の計算と外側の値を分け、戻り値を使用する   |
| 旧l08 / l09                      | l12 Module / l13 Exception   | 分割後の関数    | 既存の実行・採点契約を移動し、Moduleの前提説明を接続する | 既存28fixtureの義務を保持する                    |

各Lessonの予測・修正・別入力への適用、Hintの段階と答え、許容する別解は教材本文に置く。l11は引数名leftを使う仕様を持ち、名前を自由に選べる範囲も各演習の説明に従う。旧入力全域との互換性を主張しない。

## ID・保存と公開検証

l05の既存IDを維持し、新しい2目標は別IDにする。再利用されたl07/l08/l09は既存の`intentionally-reset`移行で旧達成・下書きを隔離保存する。旧Module/Exceptionの新しい移動先も、旧合格から自動で達成済みにしない。旧形式の保存読込・隔離・現行再試行は保存互換テストの対象である。

`movement-v2.json`はPython-firstの固定28fixture移動と旧関数10意図を、正式Compilerの全inventory・両側authoring/learner原本・独立審査scopeへ拘束する。Reactの25fixture移動は後続段階に残す。Moduleの前提説明の差分は新しいcontent receiptを要求し、Exceptionの同一投影と区別する。

既存alias l05とProject ch02-l01の用語初出リンクもlearner投影に含まれる。同IDの一般carryはlearnerDigest完全一致を必要とする。Python-firstの`list-alias-and-console-references-v1`だけは、旧Source `16bbf55442a3166193c3e7de07c06d644126968d`と候補Source `19cbed7d95cac527d17b58f3522cdf4f05466b92`の固定2教材に対し、前提と用語初出リンクの実値を別契約で検査する。

aliasの前提はl04からl05-iterate、Listの初出はl05からl05-valuesへ、Projectの前提とExceptionの初出はl09からl13へ変わる。両側の全67file、正式Compilerの全Lesson inventory、参照先の実投影、前提・nextを固定し、本文・fixture・採点・実行・保存情報の変更、原本の欠落・重複・追加を拒否する。learnerDigestからfieldを除外せず、一般の同ID教材や別Sourceへは拡張しない。

この`reference-only`受入は、新persona・新例実行・旧actorの再署名を表さない。固定28fixture移動・旧関数10意図・React後続25fixtureは変更せず、2教材のnavigation・保存と3ブラウザのlearning-engine検証をplanへ残す。Projectと全fixtureの検証義務も維持する。

同内容の履歴bindingでは、旧原本・実観測Sourceと日時・支援・限界を保存し、現Sourceへの対応だけを別原本で独立検査する。元actorによる新しいUI観測・例実行・初見評価・再署名とは扱わない。

`movement-baseline-proof-v2.json`は宣言が拘束した実baselineの元proofであり、採取時刻も原本どおり保持する。既存のprivate入力`.release-v2/movement-baseline-proof.json`が無いclean checkoutでは、この固定資料を読む。新しいcaptureの真正性・元proofの宣言hash・時刻以外の全field一致を既存検査で要求する。配信先・Source・inventory・公開bytes等が変われば拒否し、元scopeや承認を自動更新しない。

`release:flow baseline`、`prepare`、`stage-content`が成立しただけでは公開承認・全技術検証の完了にならない。同じ候補の必要な実Pyodide/CPython fixture、保存・Reset・再試行、型・Lint・build・CIと既存の公開gateを満たした後に、統合担当が公開を扱う。

## eb2実配信親への限定binding

`movement-eb2-v2.json`と`movement-eb2-baseline-proof-v2.json`は、実deployment `7593230441`／Source `eb2fe6f8e06409569f173efb2fe6275c46a535cf`に対応する追加原本である。元の16bb宣言・proofは元bytesのまま履歴検証用に保持する。新宣言が存在するときはそれを選び、破損や検証失敗を旧宣言へのfallbackで隠さない。

現行captureでeb2のhistorical Compileと467公開教材ファイルを照合し、16bb／eb2／候補19cbedの三者inventoryを比較した。旧親からeb2への変更はPython L02の説明・Hint、Tailwind公開状態、Pathで、旧関数と移動元2教材・reference-onlyの全67原本および投影は一致する。候補に対する保存移行・navigation等の技術差分は維持する。

新しい全previous payloadと親bindingへ10意図の独立source比較を行い、別のinspectorが各原本を確認した新しい承認を宣言へ拘束する。旧10承認のSource・hash・日時を新親へ付け替えたものではなく、新UI観察・engine実行・実人理解・旧actorの再署名を意味しない。既存33 content/role receiptと限定歴史受入の未観察範囲は変更しない。

reference-onlyは16bb→19cbedの歴史契約を保持し、同じ固定67原本・個別inventory・参照・採点等の全検査を満たすeb2→19cbedだけを追加する。任意Sourceへの一般化はしない。元proofと再captureは、各真正hashと`observedAt`以外の全field一致を引き続き要求する。親が再度変われば止め、新Sourceの正式same-run資格・公開後確認は別途必要である。

## JavaScript教材との固定同梱

eb2向け宣言の原本と承認を保持し、固定後続の全`content` tree・`content-v2-receipts.json` と現Compilerの全inventory digestが一致する場合に限り、JavaScriptの2教材を同じ候補に含める。旧宣言の候補commitとinventory digestは元の移行審査範囲を表す。候補全体の教材判定は通常の`stage-content`と正式資格検証で行い、教材や台帳が固定後続からさらに変われば比較で停止する。

正式資格の画像比較で判明した生表示を解消するため、`javascript-ch00-l01` のs02・s03で説明文のバッククォートだけを除去した。固定後続は修正と対象Lessonの独立内容確認・3役の画面観測に対応するreceipt 4件を含む。`javascript-ch01-l01` の4件は従来の値を使う。差し替え前の台帳は #310の統合Source `637021d4` に保存されている。固定後続と各receiptのSourceを後続checkoutから参照できるよう、統合時はこれらのコミットを履歴に保持する。 [正式run 42451350967](https://github.com/santa928/tsumucode/actions/runs/42451350967)

#327で更新したTailwindのコース説明1行を資格対象に含め、固定後続の参照先を `c01e02c8` に更新した。旧固定点 `db9811cd` と比較し、説明1行以外の教材とreceipt台帳が一致することを確認した。全inventory digestとeb2移行宣言は従来の値を使う。 [PR #327](https://github.com/santa928/tsumucode/pull/327)
