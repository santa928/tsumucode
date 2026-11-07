# Python基礎Courseの残る受入と公開後確認（#143 / #15）

この文書は受入準備表です。未実施の検証、公開資格、公開後操作を成功へ変更しません。教材・Runner・schema・共通公開Gate・承認Bodyは変更せず、#140 / #196 / #143 / #15のcloseは統合担当が全条件を照合して行います。

## 候補と配信を分ける

確認日: 2026-11-06 JST。以下は固定Sourceについての記録で、最新mainや最新配信の保証ではありません。

| 区分 | Source / 状態 | この表での扱い |
| --- | --- | --- |
| 実配信のmetadata | `16bbf55442a3166193c3e7de07c06d644126968d` / deployment `7522091460` | 2026-11-06 00:17 JSTのGETで最新deploymentとsuccessを確認。success記録時刻は2026-11-03 14:55:36 UTC。この確認では配信全bytes・画面を再取得していない。 |
| 正式公開候補 | `9821a4eb16b7395ccf94bfbb59f467507bca97b3` / tree `031169e0eac90cfde8fe5974fc894345d0bc6dd4` | PR #299のmerge。既存10 Lesson・revision `2026-10-12.1`。Pagesの成功はdeployの証拠と分ける。 |
| #259の別候補 | PR #300 / HEAD `ccea8af8aba3535c500d79163ad2d5c6738e4f4d` | Draft・未統合。16 Lesson・revision `2026-11-03.1`。この教材構成を9821候補の受入済み内容へ混ぜない。 |
| 最初の1教材の過去受入 | `9e1002169b2770be28c5a1dd3467848e6088dfbe` | [旧受入台帳](python-release-acceptance.yaml)と[2026-10-10の公開後記録](post-deploy/python-basics/2026-10-10.1.yaml)を保持。現在のCourse全体の公開承認には昇格しない。 |

配信URLは `https://santa928.github.io/tsumucode/`。`publicationStatus: published`、mainへのmerge、Pages品質jobの成功だけでは新Sourceの公開完了を示しません。旧配信467ファイルの2回の正式captureは#259担当が2026-11-05 13:25:57 / 13:32:38 UTCに記録した別証拠で、今回その全byte照合を再実行したとは扱いません。

## #138〜#142と学習目標の対応

表中の`lNN`は`python-basics-ch01-lNN`、Projectは`python-basics-ch02-l01`です。旧構成の内容レビューは[後続9教材の記録](python-basics-content-review.md)にあります。#259の新説明・前提・自力記述・支援段階・正負例の作成と移動は#259担当が所有します。

| 子Issue / 目標 | 9821候補の教材・演習 | 既存の有効な確認 / #259導入時の差 |
| --- | --- | --- |
| #138 値・変数・加算・print | l01、3 Slide、10正負Fixture | 旧Pyodide受入・3 engine・能力境界・遅延load。8私有原本のhashを旧台帳と今回照合し全件一致。原本の対象Sourceは旧版のまま保持する。 |
| #139 同じ課題を実CPythonで実行 | l01、同じ教材ID・共有AST契約 | PR #194。実CPython 3.14.2、10 Fixture、停止/回収/障害後復帰、保存/JSON、独立レビュー。Browser fallbackなし。 |
| #140 入力・条件分岐・反復 | l02 input、l03 int/if/else、l04 range/for | PR #195の21 Fixtureと事前入力の両engine確認を維持。途中入力は#196/PR #286・#290・#299を別途照合する。 |
| #141 Collection | l05 alias/更新/合計、l06 Dict/key/value/合計 | PR #197のList/Dict/Function計30 Fixture・保存/Reset/再試行。#259ではl05-values→l05-iterate→既存l05へ段階化。旧複合課題の成功だけで新目標を習得済みにしない。 |
| #141 Function | 旧l07の定義/呼出し/引数/return/print/外側の変数 | #259ではl07〜l11へ分割。旧l07の達成と下書きは新しい呼出し課題の達成へ転記しない。 |
| #142 Module・例外 | 旧l08の固定2.py import、旧l09のValueError伝播/限定except/復帰 | PR #198のModule/例外/Project計47 Fixture。#259ではModule→l12、例外→l13へ移動。本文・演習・負例と旧意図の引継ぎを正式movementの証拠で確認する。 |
| #142 小Project | ch02-l01、2行入力・List/for・helper・合計・不正値から復帰 | 両file保存/Reset/reload、古いhelper結果拒否、別Workspace非混入、2.py+READMEのZIP、JSON。#259で同IDを保持しても前提と用語参照の変更を無視しない。 |

各目標のSlide・予測/修正・Hint・Solution・Rule・正負Fixtureと前提の照合は内容レビューです。コードの実行、正式Validatorの結果、AIのUI観察、学習成果の証明はそれぞれ別です。通常の旧教材の成功を毎回全Courseで取り直しません。

## #143の受入表

「既存成功」は記載したSource・環境・操作の証拠を再利用する意味です。このセッションで当該testを実行したという意味ではありません。

| #143条件 / 親#15への対応 | 既存成功・境界 | 残る確認と完了根拠 |
| --- | --- | --- |
| 目標と教材/演習/Project、未説明構文 | #141/#142の内容レビュー、後続9教材41例、l02差分レビュー。#259はList/Functionの段階化を別候補で実装。 | 統合する最終構成と前提を固定し、#259の新教材と変更目標のreceipt・独立レビュー・blocking finding是正を照合。既存受入済みを一律再personaしない。 |
| 同じLessonを実Pyodide/CPythonで実行、版と意味差 | Pyodide `314.0.7` / interpreter Python `3.14.2`、Local CPython `3.14.2`。#138/#139のl01、#195/#197/#198の正負Fixture。 | 最終planで選択される入力/FixtureとmodeごとのSource digestに不足がないこと。同じIDをRuntime別のCourseProgressへ分けない。#259の直接CPython観測はnative controller/UI/Validatorの成功とは別。 |
| 失敗・停止・未対応を誤採点しない、Source/過去成功保持 | 事前入力不足/EOF、timeout、load失敗、stale結果拒否、取消/再試行。#286の同run練習、#299の旧client回収待ち。練習は正常終了でも未採点。 | 9821のmain Runtime終端と公開後の対話停止→復帰を照合。Firefox通常採点の初期化失敗、WebKit通常対話UIの未完/OOMは後続の該当成功原本があるまで解消済みにしない。 |
| 保存/Reset/再開・JSON移行・別origin | #194/#195/#197/#198の通常UI、両file/過去成功/JSON、入力非保存。Pages/Localは別originでJSONを移送、自動同期なし。 | #259導入時は旧revisionからl07/l08/l09の`intentionally-reset`・旧達成/元下書き保護、新l05-values/l05-iterate未達を確認。旧形式/移行専用27 testsの証拠と新しい通常UIの確認を区別する。 |
| Home/Path/読書で重い依存非混入、作者素材非配信 | #138のcore要求0、初期chunk分離、opaque frame/CSP/能力除去、固定同origin core/通知/source offer。#194のLocal隔離。 | 最終candidateとsubpathの静的artifact検査・Home予算・遅延loadとライセンス配布を既存gateで照合。実配信で入口→読書はcore要求0、演習で必要時load。Solution/Fixtureの配信漏れを生成済み全配布物で検査する。 |
| A11y・Security・必要性能 | 旧各LessonのKeyboard/focus/390px/axe、実containerの非root/通信・mount・socket禁止/出力・計算・回収制限。 | 最終変更面のKeyboard/Console到達性/focusと狭幅の実画像を確認。90秒取得上限を性能合格値にしない。物理端末は未観測、旧cold/warm計測の条件を保持する。 |
| 独立レビュー・必要CI・公開Gate・配信後SHA/主要操作 | 旧教材・Runtimeレビュー、PR #286/#290/#299。旧公開の記録は旧Sourceに限る。 | 最終Source/tree/dist・baseline・必要receipt・許可・same-run品質/公開後receiptの一致。統合担当が正式公開後に下の限定操作を確認して判断する。#143/#15はOPEN。 |

## #140 / #196の実入力を独立して照合する

PR #195は事前入力Aの受入で、途中入力待機の完了には数えません。PR #286は同じrunへの入力・空行/EOF・待機中停止を練習専用に接続し、PR #290は未説明の語とConsole到達性・l02の4 receiptを補いました。PR #299は画面離脱直後の再実行で旧client回収前に新runが409になる競合を修正しています。Issue本文に残る「修正は未公開」はその時点の履歴で、PR #299の統合後の状態とは区別します。

| 証拠 | 認める範囲 | 維持する不足・旧失敗 |
| --- | --- | --- |
| PR #286 HEAD `0fa6643e` | 実Pyodide/Chromiumの11 scenarioと通常UI、実CPython通常画面96件・skip/flaky 0、独立Runtimeレビュー | merge `6f450fc4` のmain Runtimeは95成功/1失敗。Home再入場409の元失敗を成功へ書き換えない。 |
| PR #290 HEAD `d9de8260` | Hint文言とConsoleスクロール/Tab、content/novice/recovery/maker receipt。原本の初見・限定再確認・再利用を区別 | content receiptは原本検査の記録で、全Browser Runtimeの受入や今回の実配信を代行しない。 |
| PR #299 HEAD `d960e921` / merge `9821a4eb` | 旧client cleanup/generation修正、Docker canonical prepush、実CPython通常UI4件、Source/進捗/過去成功/入力非保存、独立レビュー | merge SHAのmain Runtime終端と正式公開・配信後操作は別。旧V8 heap不足やOOMもcanonical成功へ言い換えない。 |
| Firefox / WebKit | Firefoxの必要API不足・core取得前未対応、WebKitの能力除去後の自己検査で未対応を表示。事前入力/通常採点は別機能 | PR #286のFirefox通常採点は15秒初期化期限で失敗、WebKit通常UIは対話未対応表示まで未完・再試験OOM。作者core検査の成功を通常UI成功へ代用しない。 |

Pyodideの対話対象はinput-echo / age-branch / range-loopのみ。固定2file Module/Projectや任意PythonのBrowser対話まで広げません。Local練習も固定入力による別採点と区別します。詳細は[実入力契約と旧失敗](python-interactive-input.md)を参照します。

## #259導入前後で残る作業

**9821候補を先に公開する場合:** 既存10教材とl02の変更receiptを対象に、統合担当がその時点の実baselineでprepare / stage-content / qualificationを確認します。#259の新16教材の不足を9821候補の失敗と混同せず、#259はOPENを維持します。公開後のl02練習・復帰は下の限定操作で確認します。

**#259を導入する場合:** PR #300の保護済みSource・原本・movement/意図引継ぎを再利用し、同じLessonを再実装しません。2026-11-05の既存証拠は次の範囲です。

- 新List2教材とFunction5教材の計7教材・78 authored Fixtureは、実Chromium/Pyodideと正式Validator、保存/reload、Reset後incomplete→修正後passまで7 tests成功、skip/flaky 0。#259担当が画像を実見しています。今回画像を再点検したという主張ではありません。
- 固定CPythonの78件は実AST・Source直接実行で期待不一致0。native controller/通常UI/正式Validatorの結果ではありません。現7profileの通常UI不足は該当Runtime CIの原本から補い、既存成功の一律再実行はしません。
- Pages `42040708055`は214ファイル/2,468 tests成功。旧形式/移行専用3ファイル27 testsを含むため、現行部分は211ファイル/2,441 tests。合成merge `29a0c7e1` と送信HEADのtree一致原本があります。ローカルcanonicalはtest起動時OOMで未完走であり、Hosted CIの成功をローカルcanonical成功とは記録しません。
- alias l05とProject ch02-l01は本文・目標・演習が同一bytesでも、正式learner投影の用語`firstSlideId`の差でdigestが変化。既存carryの固定pairs/coverage/stageMovesでは扱えず、`stage-content`はl05のcontent receipt不足で停止しています。この未達の契約調整は#259所有です。共通digest/schema/gateの変更案はこの文書では実装しません。

新規教材の独立AI persona観察は初見学習・回復/保存・自作/応用の3役を一度だけ行う方針です。既存receiptのactor/session/Source/learnerDigest・支援・原本を確認して再利用し、同じ目標を全員へ再試行させません。修正で影響した面は限定再確認と記録し、初見として扱いません。原本不足が見つかった場合は不足行だけを特定して統合担当へ返します。AI観察を実人観察・習得・学習成果/実務転移の保証と記録しません。

## 既存の検証入口と実行枠

以下は**未実行の割当候補**です。最終plan・原本の不足を確認してから選び、既に有効な成功と同じ入力を一律に再実行しません。Node/npm/test/BrowserはDocker内のみ、Browserは同時1 engine・1 worker。起動前にRootの枠割当を受け、Source/tree/dist、コマンド、開始/終了時刻、exit、skip/retry/flaky、停止/枠返却を私有原本へ残します。他担当の資源には触れません。

| 入口 | 不足時に確認する対象 |
| --- | --- |
| `tests/e2e/python-release-smoke.spec.ts` | Home/Path/読書core要求0、実Worker/取得障害からの再試行、保存/新context JSON移送、狭幅/a11y |
| `tests/e2e/python-interactive.spec.ts` | 同run・空行/EOF・停止/編集/離脱・復帰・進捗非変更・入力非保存。各engineの未対応を成功した対話と分ける |
| `tests/local/python-practice.spec.ts` | #196 Home再入場cleanup、CPython待機/送信/停止・固定2fileのZIP/JSON入力非混入 |
| `tests/e2e/python-input.spec.ts` | #259新7教材の入口はPR #300 / `ccea8af8`側。9821側は旧l02〜l07の構成。新7教材の正負Fixture、保存/reload/Reset/修正再判定を確認し、PyodideとCPythonの正式結果を分ける |
| `tests/e2e/python-module.spec.ts` | 固定2file、helper変更/cache/stale拒否、保存/Reset/ZIP/JSON/入力診断の非永続化 |
| `tests/e2e/python-core-cache.spec.ts` / `python-cold-preparation.spec.ts` | load失敗/取消/遅延完了と新runの競合、取得/初期化/実行期限、未採点とSource保持 |
| `playwright.python-local.config.ts` | 実CPython通常画面。通常の3 engine設定と異なる環境であることを記録 |
| `scripts/release/v2/cli.ts` / `checkStaticArtifact.ts` / `smoke-subpath.ts` | 正式inventory・receipt・最終artifact・作者素材非配信・basePathと同origin assetの境界 |

通常mainの品質CIと正式公開のsame-run qualification/Native/browser/performanceは別です。必要範囲は正式planが決め、この文書を理由に公開Gateの対象を削りません。初期化の15秒・対話中の計算/待機上限や成功期待を検証都合で緩めません。

## 正式公開後の限定確認票

全行**未実施**。統合担当が実deployの後に1つの固定配信と新しい空のBrowser状態を使い、次を確認します。全Course/全Fixture/3人の初見観察を公開のたびに再実施する票ではありません。既存正式`public-operations`の必須targetはそのまま実行し、そこで得た同じ操作の結果を再利用します。

| ID | 操作と成功条件 | 残す証拠 |
| --- | --- | --- |
| P0 配信の同一性 | 実deploymentのSource、run/attempt、candidate/artifact/inventory/qualificationを固定。公開ファイルが承認済みartifactと一致し、旧16bbやローカルpreviewを新配信と誤認しない | deploy/status metadata、配信hash照合、正式public-smoke/operation receipt、観測時刻 |
| P1 入口/読書 | `/tsumucode/#/`→Python Path→代表読書。新しい入口/前提表示、深いURL・戻る/再読込、Keyboardで見出し/一覧/Escape。Home/Path/読書でPython core取得0 | 実URL、request記録、PC/390pxの代表画像を実見。#259未導入時は10教材、導入時だけ16教材を確認 |
| P2 採点/保存 | l01で変更→実行→未達/修正→判定→保存→reload/再開。実行成功と合格を分け、実Pyodideの版・Source・過去成功と現在状態を確認 | 操作順、採点状態、ファイル/進捗の一致。Solutionの公開配信は使わず画面の案内で操作 |
| P3 入力練習/回復 | Chromiumのl02で練習待機→1行送信、空行とEOF、待機中停止→再実行、編集/離脱→戻って再実行。source/初回完了/履歴/過去成功を保持し練習だけで進捗を増やさない | 同run/identity、状態とfocus、Source/進捗比較、入力の下書き/JSON非混入。Firefox/WebKitは未対応表示と事前入力採点の証拠を対話成功と分ける |
| P4 Project/JSON | 小Projectの両fileを保存→再開。JSON書出し→空contextで読込み差分→再開し両fileと過去成功を確認。ZIPは固定2.py+README、入力/tokenを含めない | export/import結果と元データ保持。Local側の実行は別origin・実controllerでの確認と分ける |
| P5 新教材移行（#259導入時のみ） | 実旧revision JSONで旧l07/l08/l09の達成・元下書きを保護し、新しい目標を自動合格にしない。List導入2件を未達として開始。Module/例外/Projectの入口と前提を確認 | 使用した旧bundleのrevision/hash、移行差分、隔離保存/現在状態、旧IDリンクの実挙動。旧fixtureの保存互換を消さない |
| P6 Localの限定回復 | 対応を表示したLocal CPythonで同じLesson/SourceをJSON移送。#299のHome離脱→即再入場→練習実行、待機中停止→復帰で409/旧入力を残さない | 実Local origin/image/版・操作。PagesからCPythonが動いたとは記録しない。候補CIの同操作が有効なら全96件は再実施しない |

P0の全配布物照合は入口が200を返すことや画面スクリーンショットだけで代用しません。P3のFirefox/WebKitの旧失敗を解消する証拠がなければ、その行を未達のまま返します。実機/実タッチ/VoiceOverなど未観測の項目は明記し、承認済みAI代替を実人・物理端末待ちへ戻しません。

## 統合担当へ返す残条件

- 9821 main [Pages 42047994036](https://github.com/santa928/tsumucode/actions/runs/42047994036) はsuccess。2026-11-06 00:17 JST近傍の [Runtime 42047993357](https://github.com/santa928/tsumucode/actions/runs/42047993357) は進行中。Python制約/回復と代表production UIのstepはsuccess、Python HTTP切断後の遅延入力拒否等はpending。run全体の成功とはしない。
- #259 PR #300のRuntime終端、現7profileのnative UI/Validator原本、不足2教材のcarry契約と正式stage-content、最終baseline/Source/scopeは#259・統合担当から確定する。#147 / #152 / React / HTMLの受入へこの表の結果を流用しない。
- 正式公開のqualification/許可とP0〜P6は未実施。以上が揃う前に#143/#15をcloseしない。
