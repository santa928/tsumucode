# 関数型・generic・readonly Lessonの通常draft接続

2026-10-06。Issue #112、main基点 `265ebd6346b7c35fefb8121b35427490cb704da3`（PR #158）。既存interface・union・optionalの後に、関数の入出力とcallback、genericの入出力関係、readonly入力のコピーを扱う3単位を追加する。

## 教材と採点の範囲

`typescript-ch04-l01`は数値callback、`typescript-ch04-l02`は同じ型を保つgeneric関数、`typescript-ch04-l03`は元配列を変えずに別配列を作る関数を扱う。各4枚に最小例、結果、理由、予測、修正練習、段階的Hintと図を接続する。Courseは4Chapter・9Lesson・36枚（28概念Slide）・9演習・165分のdraft。時間は見積りで、初心者の実測ではない。

revision `2026-10-06.1`への空step移行で、旧2/3/4/6Lessonの元TS、履歴、閲覧、Hint、合格、passing snapshotを保持する。新Lesson追加後はCourse完了を再計算する。Solution/Fixtureはauthoring専用で配信しない。

[有限な採点契約](typescript-reusable-grading-contract.md)の3profileを固定Exerciseだけに適用する。引数/戻り値/callbackの型と実引数の利用、単一型パラメータの入出力関係、readonly入力とコピー出力を有限AST・通常Compiler・非emit正負probeで確認し、実ConsoleをANDで判定する。改名、宣言/関数式/arrow、局所変数による返却、対象内の配列表記・concat、式の括弧などを受理する。型が通っても計算結果や追加値が違えば動作条件は未達になる。

any/assertion/診断抑制、固定return/固定表示、genericを固定型やunionだけで代用する回避、mutable入力や元配列への書込は合格にしない。readonlyは参照先の実行時freezeではなく、この引数経由の書込を禁止する型である。元配列の所有者による更新とコピーした配列の結果を分けて示す。genericは型関係を保ち、実行時の値変換ではない。

正例各2、負例callback4/generic3/readonly3を非emitで検査する。診断のfile・line・code・件数と正のcolumnを照合し、columnの完全一致とは説明しない。probe、AST、コピー、生成JSは学習者の保存TSへ混ぜない。既存Preview安全制約、入力/AST上限、Compiler遅延読込、Worker期限、source/session/revision照合を維持する。未知のLesson/profile/Console契約は拒否する。8つの固定学習契約をschemaとValidatorで共有し、汎用採点エンジンや高度な型プログラミングを追加していない。

## 変更範囲の検証

専用Docker `tsumucode-issue112-check`。Node 24.18.0 / TypeScript 6.0.3 / Playwright 1.61.1 / Chromium 149.0.7827.55 / Linux arm64。既存イメージと依存を専用volumeへコピーして再利用し、ホスト依存・設定や他checkoutを変更していない。

- `content:compile`（3Course）、型検査、全Lint、ch04検査（3Lesson/9概念Slide/3演習）、TypeScript出典265files/265items成功。
- 実Compiler9・CompilerClient22・Validator25・Course6・掲載例3の65件成功。初期51Fixture、正負probe、型回避、別解、予算/未知環境、profile/payload、source/session/revision、旧進捗移行、掲載例の診断と型消去を確認した。固定契約共有の整理後はValidator/Course31件だけ再確認した。
- レビュー指摘を直した括弧Fixture3件の実Compiler回帰成功。括弧自体の存在をassertし、整形後も入力を保持する。既存9件は入力変更のない検証部分を再利用し、追加3件との合計は68種類で、再実行を別の成功数へ加えない。Course6もFixture件数更新後に再確認した。
- `build:app`のtsc/Vite/inline CSS成功。初回の実Chromium10件のうち通常UI/390px/既存01→02の7件が成功。3Lesson各4枚の閲覧/keyboard、Compiler遅延読込、型失敗の非採点、条件不足、誤動作、保存/再読込、Reset、Solution合格と元TS/Console/完了保存を確認した。
- 390pxの各4枚でページ横はみ出しなし、図全体、前提コード展開、練習欄到達を確認。PC/mobileでaxe違反0。作者はPC各s01の3枚、390pxのcallback/generic図2枚とreadonlyのs03本文/練習欄1枚を実見した。長いコード行は既存枠内の横スクロール、本文は縦スクロール。物理実機や初心者試用ではない。

初回Worker3件はStarterの診断期待metadata不足で失敗した。実際の型診断は正しく、metadataと表示後throwの失敗種別を補った後、3件・54Fixtureを実Worker/Runner/Validatorで照合し成功した。この時の新しい括弧3Fixtureは整形でSolutionと同一になっていたため、不変の51例だけを有効証拠として再利用する。括弧を保持した真の別解3例は、既存の厳密なstatus/診断/Rule照合を維持した限定実行で3件成功（22.7秒、retry0）。通常UI7件はStarter/Solution・UI実装・Slide原文のbytesが不変（callbackの課題説明では括弧の範囲だけを明確化）のため再利用する。途中の失敗や重複入力を括弧回帰の成功として数えない。

追加のprivateブラウザ検証設定は作業ディレクトリ未指定で起動timeoutした。作業ディレクトリを指定した後の3件成功を採用し、失敗を成功へ数えない。検証用TS artifactがLint対象へ混入した問題はartifactを退避して解消し、製品のLint設定を変更していない。

原稿中のMDX記号、型の絞込み、Lintとchapter CLI引数の途中問題は修正後の対象検査で確認した。検査上限や期待結果を緩めていない。TypeScript全Courseの性能測定、TS固有p95予算や新たな公開受入は実施していない。

## 独立承認と台帳

Reviewer `review_issue109`は初期固定HEAD `e7759e93dd47a92dfd66391c2176760d447e0c20`の114file差分と、全12Slide・図・Hint/Solution・初期51Fixture、採点/Worker/保存/配信経路を独立確認した。既存ch03-l02は次Lesson参照追加だけの限定確認。accuracy/goalExerciseAlignment/decisionはapproved、unexplainedTerms/hintLeakageは0、examplesExecutedは作者の成功記録へ依拠する。

ReviewerはPC各s03の3枚、390pxの図3枚、各s04本文/前提コード/練習欄3枚、各s02本文/練習欄3枚の計12画像を実見した。修正HEAD `e8861edc5d0c7287580491ed3ccbc2fd548a5d61`への限定差分で、括弧の受け入れと診断metadataの2指摘、整形後の括弧Fixture保持を確認し、残る必須指摘0でコード/内容を承認した。

Reviewer自身のDocker再実行/hash再計算、初心者・実機・汎用TS文法・全TS完成・正式公開受入を意味しない。

Docker内の既存 `computeLessonSourceHash`で変更4Lessonだけを計算した。

| Lesson | hash                                                               |
| ------ | ------------------------------------------------------------------ |
| 03-l02 | `20131580cf43dd476637119ca7eef9b3546a495ebf859827a17539f79e60d2c7` |
| 04-l01 | `fb54d002217ff1eea7e4bb5bf34e2fc32b2a78ef7abe2ce62b81231b99750d40` |
| 04-l02 | `396e9ae97aa27e0eff4c70b1da415e2acdbd0f65912b5ea0753f035400b5e168` |
| 04-l03 | `8e9cf66925d71336493801ed678ea92bedfcac375101f2893062fd86876c2008` |

最初のReview Gateはch03-l02のstale hashと新3Lessonの欠落で停止した。独立承認後に対象4Lessonだけを台帳へ反映し、既存承認とCourse/Reviewのdraftを維持する。台帳整合後、正確なPR HEADのremote CIと実際のContent review成功を確認して統合する。本記録作成時点ではpush/PR/merge未実施。

全TS制作・最終受入/公開は後続 #113〜#115。未承認27Lesson/595分案やTS固有性能予算案は採用していない。Home/Path掲載、初心者/物理実機、正式公開Gateを通常CIで代替しない。通常PR/main CIはdeployを起動しない。
