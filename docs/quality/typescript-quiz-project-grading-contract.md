# TypeScriptクイズ制作の有限採点契約

Issue #114は、既存JS Capstoneと同じWeb/Logic各2問の学習クイズを、同じTS専用Workspace `typescript-quiz-guided` の3工程へ分ける。新しいRuntimeやReact作品は作らない。25/30/40分の見積りを加え、採用draftは6Chapter・15Lesson・60Slide・12標準演習・3制作Lesson・320分、revision `2026-10-06.3`。初心者の実測、旧27Lesson/595分案の採用、正式公開の承認ではない。

## 学ぶ範囲と提供する範囲

| Lesson / profile            | 学習者が直す範囲                                         | 実操作で確認する範囲                                          |
| --------------------------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| ch06-l01 / quiz-data-v1     | Questionとreadonly配列、2カテゴリ各2問の型付きデータ     | Web/Logicの問題・2択・初期状態・focus                         |
| ch06-l02 / quiz-state-v1    | readonly QuizState、answer/advanceの型と実値の接続       | 正答と誤答、1点と2点の結果、次問、カテゴリを保つ再挑戦、Enter |
| ch06-l03 / quiz-boundary-v1 | unknownの各項目・配列長と各要素、await、Errorの実message | 正常、不正、拒否、再試行後に変わる問題順、得点                |

main.tsだけを編集し、index.html/styles.css/quiz-ui.ts/questions.tsは3工程で同一の提供Fileを使う。quiz-uiは要素探索・表示・focusと学習関数の呼出しを受け持つ。型だけのimportを使うため、main.tsとの実行時循環は作らない。questionsは同梱データを80ms後に返すPromiseで、外部通信は行わない。Questionの型名を公開する処理と、unknownを検証する処理を混同しない。

Starter→部分Solution→次のStarterを同じSourceとして積み上げる。前工程では未来の未達を残す。採点は現在までの工程を累積して行う。現在工程の合格を未来の工程まで完成した証拠と混同しない。Resetはこの共有TS作品全体を現在LessonのStarterへ戻す。保存・再開は既存Project Workspaceと履歴を使い、JSの進捗・draftと旧12TS Lessonは別の保存単位として保持する。

## 判定の責務と限界

Authoring/Core schemaとValidatorは、固定3Lessonのruntime（typescript/module/project/main.ts/preview）、profile、Project/Workspace、全action/checkpoint/期待値を閉じる。runtimeの省略やJS置換、操作削除、期待値緩和で合格させない。既存source/session/revisionの照合を経て、Compiler Workerの学習factと実Console/DOM/interactionをANDにする。

Worker内のinspectQuizProjectは公開型名・関数の窓口・mountQuizへの接続、データ/関数/検証後の実値の使い方を有限ASTで検査する。引数/ローカル名、括弧、型を明示した関数宣言とarrow、readonly string[]/ReadonlyArray等の有限な別解を扱う。任意のTS構文・同値プログラムを理解する判定ではない。型が正しくても間違った問題文やscoreは実操作で不合格となる。

checkQuizProjectは入力を複写して、非emitの正probe1回と負probe1回を実Compilerで検査する。負probeはLoadMode外の値・数値の回答・readonly状態への書込を同時に検査し、固定位置と診断2345/2345/2540を照合する。probe/JS/map/AST/内部診断をRunner、教材、保存へ返さない。any/as/type assertion/非null assertion/診断抑制/予約名は回避として拒否する。8192文字・2048AST node・depth64と標準libの境界を守り、基盤障害を学習上の不合格と混同しない。

## 検証環境と公開条件

固定Node 24.18.0 / TypeScript 6.0.3 / Playwright 1.61.1 / Chromium 149、Linux arm64 Dockerで確認する。Fixtureの期待status・診断code・失敗Ruleは実Compilerと実Browserに対応させる。掲載例、共有Sourceの往復、型/実行失敗からの復帰、Keyboard/focus、代表画面と390pxの表示は別に確認する。Home/Pathにはdraftを掲載せず、解答とFixtureは配信しない。

#115では最終台帳と採用15Lesson/320分を照合し、初心者検証、実機とTS固有性能の実測/予算承認、公開受入を別途判断する。既存JS予算の承認をTS固有予算の承認へ広げない。

型のreadonlyは実行時freezeではない（[TypeScript Object Types](https://www.typescriptlang.org/docs/handbook/2/objects.html)）。型だけのimport/exportは実行コードへ残らない（[Modules](https://www.typescriptlang.org/docs/handbook/2/modules.html)）。unknownの確認と絞り込みは[公式Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)、Event対象は[MDN currentTarget](https://developer.mozilla.org/en-US/docs/Web/API/Event/currentTarget)を参照する。
