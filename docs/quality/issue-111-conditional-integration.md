# union・optional Lessonの通常draft接続

2026-10-05。Issue #111、main基点 `29613fedd2dcf005453b2ae203af956d193630a5`（PR #157）。Question/interfaceを前提に、状態で型を絞るLessonと、ないかもしれない値を確認するLessonの2単位を追加する。

## 教材と判定の範囲

`typescript-ch03-l01`はunion/literal・kind narrowing、`typescript-ch03-l02`はoptional/undefinedと空文字を扱う。各4枚で、最小コード、結果、理由、予測、修正練習、段階的Hintを接続する。Courseは3Chapter・6Lesson・24枚（19概念Slide）・6演習・105分のdraft。時間は見積りで初心者の実測ではない。前提関数・引数注釈・returnを短く再確認し、用語/概念/図の代替説明を追加した。

revision `2026-10-05.3`へ空stepで移行し、旧2/3/4Lessonの元TS、履歴、閲覧、Hint、合格、passing snapshotを保持する。新Lesson開始時はCourse全体の完了を再計算する。Solution/Fixtureはauthoring専用で配信しない。

[有限な採点契約](typescript-conditional-grading-contract.md)の2profileを固定Exerciseだけへ適用する。型形・引数注釈・実値を返す2分岐・呼出しを有限ASTで確認し、通常Compilerの型/flow検査と実ConsoleをANDで判定する。改名、分岐反転、early return、条件式を受理する。固定returnや固定表示、any/assertion/診断抑制は合格にしない。optionalの真偽だけの確認は型条件が通っても空文字の動作条件で未達となる。

コピーの正例2と、union負例3/optional負例2を非emitで検査する。診断のfile・line・code・件数と正のcolumnを照合し、columnの完全一致とは説明しない。probe、AST、コピーはRunner/保存へ渡さない。既存Preview安全制約、入力上限、Compiler遅延読込、Worker期限、source/session/revision照合を維持する。対象内の型形/分岐/実動作を確認する判定で、汎用文法や一般的な型理解の証明ではない。

## 変更範囲の検証

専用Docker `tsumucode-issue111-check`。Node 24.18.0 / TypeScript 6.0.3 / Playwright 1.61.1 / Chromium 149.0.7827.55 / Linux arm64。既存イメージと依存を再利用し、ホストの依存・設定や他作業のcheckoutを変更していない。

- `content:compile`（3Course）、全Lint、型検査、ch03検査（2Lesson/6概念Slide/2演習）成功。
- 実Compiler6件成功（51.73秒）。17+18Fixture、正負probe、未知環境/予算、型回避、有限別解、payload/profile境界を確認。
- CompilerClient19・Validator22・Course5・掲載例2の48件成功。Validatorの2新ケースの整理後はその2件だけ再確認し、追加の別テスト数へ数えていない。
- `build:app`のtsc/Vite/inline CSS、学習chunk確認成功。TypeScript出典171files/171items成功。
- 実Chromium6件成功（2.8分、retry0）。union17/optional18Fixtureを実Worker/Runner/Validatorへ通し、型失敗、条件不足、誤動作、実行失敗、別解を照合。通常Routeで4枚の閲覧/keyboard、編集/履歴/再読込、Reset、Solution合格と元TS/Console/完了保存を確認。
- 390pxの両Lesson全4枚でページ横はみ出しなし、図全体・前提コード展開・練習欄到達を確認。PC/mobileでaxe違反0。作者はPC各s01、unionの390px図とoptionalの390px s03本文/練習欄の画像を実見した。コードの長い行は既存枠内の横スクロール、本文は縦スクロール。物理実機や初心者試用ではない。
- 既存01→02の通常UI追加1件成功（28.1秒）。revision期待値1行を更新し、既存profileの合格/保存/再読込を確認。

初回単体テストの新6件は、テスト側のauthoring Exercise API参照を誤って失敗した。修正後の実Compiler6件の成功を採用し、途中失敗は成功数に加えない。途中の原稿schema/出典整合/Lint問題も修正後のcompile/Lint/provenanceで確認した。検査上限や期待結果を緩めていない。TS固有性能p95や新たな予算の受入は実施していない。

## 独立承認と統合記録

Reviewer `review_issue109`は固定実装HEAD `70b9f208075fe49e8bfb41d072701137797f1a91`を独立承認した。84file実装差分、既存E2E revision期待値1行、全8Slide/Hint/Solution/35Fixture/図、判定経路、配信/保存/移行境界を読解。既存ch02-l01はnextLessonと整形変更の限定承認。必須修正と未解決の実質的不具合は0件。

各新Lessonのaccuracy/goalExerciseAlignment/decisionはapproved、unexplainedTerms/hintLeakageは0、examplesExecutedは作者の成功ログに依拠する。ReviewerはPC2枚と390pxの図/本文/練習欄6枚を実見した。Reviewer自身の再実行/hash再計算や初心者・実機・全TS完成・公開受入を意味しない。

Docker内の既存 `computeLessonSourceHash`で変更した3Lessonだけを計算した。

| Lesson | hash                                                               |
| ------ | ------------------------------------------------------------------ |
| 02-01  | `35bd2f64b2f4f3ca3b1bfb2d8d0ffda55043fe219542264f3ebf3220f7de2aca` |
| 03-01  | `cd37cc9af6a5c734520740601d288d7cf6bd900dfa84123a86e69308c452a0d1` |
| 03-02  | `8c44c1b4a7352117a5a0966d527a65799ab9da53d4d0030bfbbfac615d6c36b9` |

最初のReview Gateは02-01のstale hashと新2Lessonの欠落で停止。独立承認後に限定更新/追加し、既存01群の承認とCourse/Reviewのdraftを維持する。台帳整合後、正確なPR HEADのremote CIと実際のContent review成功を確認して統合する。本記録作成時点ではpush/PR/merge未実施。

台帳反映後のReview Gateは3Course・109Lesson、stale hashes 0・rejected 0で成功。変更ファイルのPrettierとdiff checkも成功した。109Lesson全件の新たな教材読解や学習操作を実施した意味ではない。

全TS制作・最終受入/公開は後続 #112〜#115。27Lesson/595分案・TS固有性能予算案は承認していない。Home/Path掲載、初心者/物理実機、正式公開Gateは後続で、自動検証や通常CIへ置き換えない。通常PR/main CIはdeployを起動しない。
