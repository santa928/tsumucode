# Python OOP Courseの公開前統合受入（Issue #152）

2026-10-14にユーザーが初心者向け使いやすさ・実機性能の受入方法を変更しました。新規3名の会話履歴なしcomputer useレビューを代替として使います。[承認された方法・初回3件の観測と限界・是正対象](python-computer-use-acceptance.md)を正とします。初回3件は実施済みですが、再開などのblocking findingの修正後再操作は未完です。以下の実人・物理端末の観察案は変更前の参考であり、必須待ちへ戻しません。新Pages公開の保留は維持します。

対象は `python-oop` の4 Chapter・9 Lesson・34 Slide・標準8演習・Guided Project1件、240分の草稿です。基準mainは `fdc77bf9ad6adde7a4eb801d6c930f5f7d72c11d`、Course revisionは `2026-10-14.3` です。#148〜#151の実装を統合済みで、Python基礎のFunction・スコープとPython実践のdataclassを学習前提にします。実践Courseが未公開であることと、OOPの独立設計・技術検証を進められることを分けます。

上記はrevision `.3`の統合時の基準です。統合時に出典台帳への未登録を検出した `course.yaml`／`concepts.yaml`／`glossary.yaml` の3管理原稿も、独自作成物として登録しました。Courseは `publicationStatus: draft` を維持し、Home／Python Path追加と新Pages公開は保留です。

初回computer useの指摘是正では、最新基準main `7dba4412567c7d959a6a72bb66a1c915803858b4` に対し、初回演習の工程分割・最初の用語3件を改善し、revisionを `2026-10-14.4` へ進めます。空stepsのmigrationで既存ID・Source・履歴を保持します。教材の採点条件・実行Source・Fixtureは変えず、不一致を「未確認」と表していた結果文言と、保存演習への再開導線・読書案内を修正します。過去の `.3` の技術証拠はその入力と範囲を保持し、最新候補の再開・読書・必要CIや独立レビューと区別します。blocking findingの同3名再操作と公開後条件が未完の間、#147／#152はOpenです。

## 概念と確認する行動

| Lesson   | 対象と比較                                               | 課題で確認する行動・典型的誤解                                                                               |
| -------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| ch01-l01 | Class／Instance／初期化／identity／属性参照              | 別Instanceとalias、Class共有値とInstanceによる遮蔽を区別する。個別値をClassに置く誤りを拒否する              |
| ch01-l02 | 同じ倍率計算のinstance method／classmethod／staticmethod | `self`／`cls`／明示引数の供給元を予測し、Class変更と明示倍率を比較する。誤bindingと固定倍率を正解にしない    |
| ch02-l01 | 継承と継承した初期化／Composition                        | overrideと別objectへの委譲を同じ処理で比較する。Instance状態の共有・委譲せず値だけコピーする誤りを拒否する   |
| ch02-l02 | Propertyの読取・更新と値検証                             | 正常更新と負値拒否後の状態を比較する。検証前更新・不正値の受入を区別する                                     |
| ch02-l03 | 用途を絞ったdunder／objectのcopy                         | `len` と文字列表現の契約、共有Listとcopyを比較する。repr／演算子／一般descriptorへ範囲を広げない             |
| ch03-l01 | Function変換／Closure／引数転送／decorator構文           | 明示的なFunction適用と `@` の結果を対応させ、別wrapperの回数を予測する。戻り値・名前付き引数の欠落を修正する |
| ch03-l02 | metadataの消失とwraps                                    | 名前・docstring・元Function参照を比較し、戻り値と例外の中継を保つ。metadataだけ直書きする解を正解にしない    |
| ch03-l03 | 設定時／装飾時／呼出時                                   | 異なるlabelと同じ設定の再利用を比較し、wrapperごとの回数を分ける。設定側で回数を共有する誤りを拒否する       |
| ch04-l01 | Ledger Instanceとwrapperの状態を結ぶProject              | 記録先・label・呼出回数の持ち主を説明する。負値検証前の状態変更・例外の握り潰し・固定出力を拒否する          |

説明・独自の静的図・予測・修正・振り返りを順に置きます。図は実行結果の代用品ではありません。ProjectはClass／Instance methodとFunction変換・設定付きdecoratorを結び、継承／Property／dunderなど使わないAPIを無理に要求しません。3methodの規則、Function変換、引数・結果・例外とmetadataの契約は各[草稿契約](python-oop-method-contract.md)、[object契約](python-oop-object-contract.md)、[Function変換契約](python-decorator-flow-contract.md)、[設定付きdecorator契約](python-configured-decorator-contract.md)を参照します。

## 既存の実行・保存証拠と再利用条件

統合元は [PR211](https://github.com/santa928/tsumucode/pull/211)／[PR212](https://github.com/santa928/tsumucode/pull/212)、[PR213](https://github.com/santa928/tsumucode/pull/213)、[PR214](https://github.com/santa928/tsumucode/pull/214)／[PR215](https://github.com/santa928/tsumucode/pull/215)、[PR216](https://github.com/santa928/tsumucode/pull/216)／[PR217](https://github.com/santa928/tsumucode/pull/217)です。教材・解析・演習・保存処理はこの統合確認で変更しません。

固定CPython 3.14.2とPyodide 314.0.7の既存検査は、全9演習の正負Fixture・許容する別名／計算順序／一時変数などの別解、作者による実object観測とコード例を扱います。作者のobject観測と提出ごとの採点を混同しません。学習者の判定は有限の構造条件と同じSourceの実stdoutをANDで確認し、一般Pythonの自由採点やASTによる隔離保証とは説明しません。

通常UIの既存検査では、正解の後の誤呼出し・SyntaxError・未対応構文、Source全文と履歴・旧成功版の保持、保存／reload／Reset／再試行、ProjectのBrief／チェックリストを確認しています。CPythonとPyodideの能力・session／revision照合は既存契約を維持します。

統合した作者検査は両engine各166 Fixture・直接観測9件・34 Slide例です。初期2教材の作者解析は直接AST経路を使うため、全件が製品CPython wrapper経由という証拠ではありません。別解は有限の許容範囲で、任意のPython表現を保証しません。Firefox／WebKitは代表演習だけを確認し、全9演習の全Browser成功とは扱いません。保存全文は永続化データで照合し、Reload後のeditor表示は代表行の確認です。

成功を再利用する条件は、対象Source・Fixture・解析helper・実行器・固定依存・資源／期限・保存revision・操作条件の一致です。過去の別Lesson、別revision、別build、別幅の成功を流用しません。入力が変わった範囲のみ再検証します。原稿内容hashは `content-review-python-oop.yaml` の9Lessonと照合し、草稿の内容承認を公開承認に置き換えません。

PR216の初回main Runtime `38532023446` は、step3の固定Node digest取得でDockerHubからHTTP500が返り、source検証に入る前に失敗しました。Pages `38532023443` は成功しています。PR217は固定Node／CPython digestの取得だけを最大3回・間隔5秒にし、最終失敗はexit1で伝播します。テストの再実行／skip、期待値、学習者制約は変更していません。最終main `fdc77bf` の [Runtime初回38538757303](https://github.com/santa928/tsumucode/actions/runs/38538757303) と [Pages初回38538757270](https://github.com/santa928/tsumucode/actions/runs/38538757270) は成功し、公開処理はSKIPPEDです。

HTTP500の発生と失敗位置は実ログの事実です。Registry内部の原因・当該成功Runでの取得回数は未確認で、サービスの一時障害という説明は推定です。元Runを再実行した結果ではありません。以前の45分期限超過とその60分への修正、WebKitの1GiB OOM診断後に作者検証だけ2GiBで成功した履歴も私有原本に保持し、初回失敗を隠しません。

## 統合技術確認

開発・検証は既存の固定依存とBrowserを持つDocker内で行います。今回の読書検査は既存の実践Course検査と共通helperを使い、それぞれの専用configで対象を分けます。毎PRの通常全Course Gateへ追加しません。

```sh
npm run content:compile
npm exec -- tsx scripts/content/reportConceptCoverage.ts content/python-oop
npm exec -- tsx scripts/content/checkProvenance.ts content/python-oop
npm run content:review
BASE_PATH=/tsumucode/ npm run build:app
BASE_PATH=/tsumucode/ npm run smoke:subpath
npm run smoke:learning-chunks
npm exec -- tsx scripts/release/checkStaticArtifact.ts dist --course-id python-basics
BASE_PATH=/tsumucode/ npm exec -- playwright test --config=tests/acceptance/python-oop.config.ts
```

PC／390pxの全34Slideで図の読込、axe、横overflow、本文末尾とPagerへの到達を確認します。Home／既存Python Pathの非掲載、Home／Path／読書中のPython core取得0を別々に確認します。新しい画像は実物を確認し、スクリーンショット取得だけで可読性を承認しません。共有helperを抽出した実践Courseの検査は収集と必要な回帰確認を行います。

既存subpath smoke／Home初期JS上限／learning chunk境界／作者Fixture・Solution配信非混入を維持します。静的Artifact検査は既存 `python-basics` の入口契約で生成物全体を確認するもので、OOP専用公開Gateの承認ではありません。検証結果と最終HEAD／tree・3独立レビュー、正確HEADの初回PR CI・merge SHAの初回main CIはPRと私有引継ぎへ記録します。

2026-10-14に、8 Course compile、OOP概念coverage complete、出典289 files／289 items、全8 Course・166 Lesson内容台帳のstale0／rejected0、対象型／Lint／整形、subpath build／inline CSS／smoke、learning chunk isolation、552 filesの静的Artifact検査を確認しました。OOP全34SlideのPC／390px読書2件が22.0／20.5秒で成功し、共有helperを抽出した実践Course全11Slideの回帰2件も7.5／6.6秒で成功しました。いずれもretry0で、図読込・axe違反0・横overflowなし・末尾／Pager到達・Home／Path非掲載・Python core取得0を確認しています。3method／Function変換／Project状態分離の両幅6画像を直接確認しました。

初回検査で発見した出典3原稿の未登録と、作者のsmoke呼出で `BASE_PATH` を付け忘れた失敗は私有原本に保持します。前者は台帳登録で、後者は同じbuild条件の指定で是正しました。その後、独立レビューが公開出典の再生成不足を検出しました。台帳変更もcompileの生成入力になるため、既存compile結果を再利用した判断を訂正し、再compile／buildとsubpath／chunk／Artifact境界を確認し直しました。

生成元とdistの公開出典JSONには新3IDが存在し、両者が一致します。全552 filesの変更前後hashを照合し、変わったのはOOPの出典JSON1件だけでした。Lesson payload・SVG・JS・HTML・CSS・core・manifestは不変で、読書検査の4成功をこの条件で再利用します。教材9Lessonの内容hashと既存演習・解析・依存も不変です。初回レビューのP2と是正結果を私有原本に保持し、生ログ・画像・学習データは公開pushへ含めません。

安全性は[Python実行契約](python-runtime-contract.md)と[Local実行境界](local-python-runtime.md)を参照し、Worker／frame、固定同origin core、CSP、期限、CPythonの資源・出力・停止／回収条件を緩和しません。#147のcold準備や既知Solutionでの観測を、OOP全9Lesson・物理端末・性能合格へ一般化しません。core遅延取得・bundle上限の技術確認と、承認された操作性能の受入は別です。

## 初心者受入の準備と残る条件

方法・対象者・使用端末・性能条件の承認が未確認です。実人の理解、物理低性能端末、承認された性能予算の合否は、AI内容レビューや自動検査で代行しません。承認後、観察者は先に回答を見せず、次の課題を進め、本人の言葉と操作・つまずき・必要な介助を私有原本へ記録します。

1. 同じ倍率計算について、3methodが値と倍率をどこから受け取り、呼出しで何が自動供給されるか予測し、誤呼出しを修正する。
2. 継承と委譲、Propertyによる不正更新、dunderとcopyの観測結果を説明する。各課題が初期化の繰返しだけになっていないか確認する。
3. 明示適用とdecoratorをFunction変換として対応させ、引数・結果・例外とwrapsのmetadataを保つ修正を行う。
4. 設定／装飾／呼出しの3時点と状態の持ち主を予測し、Ledger ProjectのBriefから実装する。同じ設定・別Function・別Instanceを区別する。
5. 保存・再開・Reset・修正後の再試行を行い、未達／実行エラー／未採点の表示を説明する。Keyboard・focus・エラー案内と操作可否を観察する。

未達やblocking findingは課題・Source・表示と結び、是正後に影響範囲を再確認します。人数・理解率・所要時間の閾値を未承認のまま作りません。合否と方法の妥当性、必要な性能受入は本人の承認に従います。

公開前には、さらにOOP専用公開契約と既存Gateの整合、9Lesson内容hash／Source／tree／dist／harnessと原本のbinding、最新候補の独立3レビュー、blocking findingの是正、本人のPath追加・新Pages公開許可が必要です。既存Python基礎の許可をOOPへ流用しません。公開後は正確な配信SHA／hash、開始・再開・実判定・保存・Export／fresh Importを確認します。これらが未完の間は#152を閉じず、#147の保留も維持します。
