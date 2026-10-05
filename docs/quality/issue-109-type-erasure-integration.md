# 型消去・実行時失敗Lessonの通常draft接続

2026-10-05。対象はIssue #109。基点はmain `eee05c3`（PR #105統合後）。PR #79の原稿を通常Lessonへ登録するローカル実装と独立内容/コードレビューを完了した。統合・公開の完了記録ではない。

## 登録と保持する契約

`typescript-ch01-l03`を01-02の次へ追加し、型推論→型注釈→型消去・型/実行失敗の順に進める。Courseはdraftのまま、1Chapter・3Lesson・12Slide（10概念Slide・2チェックリスト）・3演習・45分。元のSlide文章・演習/Starter/Solution/Hint/9Fixtureを再利用し、s01だけ通常教材の学習段階検査に必要なコード/結果の図を追加した。図は型注釈だけの消去と、代入/表示が残ることを対比し、代替テキストを持つ。

用語の既存初出を保持し、型消去・JavaScript・throw・Errorを追加した。型消去概念は型注釈を前提にする。Provenanceは新教材・図の公開/authoring区分を登録し、Solution/Fixtureを通常配信Lessonに含めない。

revisionを`2026-10-01.1`から`2026-10-05.1`へ移行する。既存IDと教材内容に対する移行stepは空で、既存2Lessonの合格・閲覧・元TS・Hint・採点履歴・passing snapshotを保持する。03を開始するとCourse全体は未完へ再計算され、既存Lessonの合格は残る。

03は動作課題で、型注釈の有無を採点しない。型検査成功、実行成功、Consoleの数値2が1回という動作を要求する。推論・固定表示の合格を型消去の理解の証明へ拡張しない。型失敗は未実行/未採点、表示前後のthrowは実行時失敗、誤出力は未達として扱う。失敗後も元コードと履歴を保持して修正できる。Compiler/Runner/Validator/保存形式/通信・停止上限は変更していない。

#11の全15トピックは[既存要件台帳の子タスク対応](2026-09-29-typescript-course-design.md#再開時の子タスク対応2026-10-05)へ同期した。順序は#109→#110→#111/#112→#113→#114→#115で、#115は全TSの最終受入/公開。採用済み登録範囲と未承認の27Lesson/595分案・TS固有性能予算案を区別する。現行performance YAMLの承認済み公開上限と非対象を維持する。

## 変更範囲の検証

依存・build・test・Browserは専用Docker `tsumucode-issue109-check`で実行した。固定Node 24.18.0、TypeScript 6.0.3、Playwright 1.61.1、Chromium 149.0.7827.55、Linux arm64。Hostの依存/設定、既存稼働コンテナは変更していない。

- `content:compile`成功（3Course）。TSのProvenanceは77 files/77 itemsで成功。
- `tests/content/typescript-course.test.ts`最終3件成功。登録・用語/概念・順序・動作と型条件の区別・配信境界に加え、旧進捗/元TS/履歴/passing snapshotの移行と新Lesson開始を確認。
- `tests/content/typescript-lesson-drafts.test.ts`15件成功。掲載例の型失敗2322、型注釈の消去、throwの保持を確認。03の演習directoryは原稿とbyte一致を`diff -rq`で確認したため、[既存9Fixtureの実Worker/Runner/Validator証拠](typescript-erasure-lesson-evidence.md)を再利用する。新登録・図・保存操作の証拠へ広げない。
- 対象ESLint・Prettier・`typecheck`、`build:app`（型検査/Vite/inline CSS）、`smoke:learning-chunks`成功。buildのCompiler Workerは従来どおり約7.28MB（非gzip）。新たなTS性能p95達成の測定ではない。
- `typescript-course-learning.spec.ts`の変更対象4ケースは成功証拠を集約。初回は既存2Lessonの通常操作/保存、390pxの既存図、新Lessonの390px表示の3件が成功。新Lessonの1件は検証修正後に単独25.2秒で成功し、成功済み3件は再実行していない。retryは0。
- 静的buildの通常Routeで03の4枚閲覧保存、型失敗未採点、表示後throwのcode-error、誤出力の未達、Reset、元TS修正後合格、完了/元TS/Consoleの再読込を確認。エラー時の操作日時は更新され得るが、進捗の証拠は保持され、実行時失敗は既存履歴にcode-errorが追記される。テストはこの既存契約に合わせ、合格条件を緩めていない。
- 新LessonのSlide/Exerciseでaxe違反0、次Slideをキーボードで操作。1280×900と390×844の図/本文/練習欄の画像を目視し、図の全体と練習欄が読めることを確認。長いコード行は既存コード枠内の横スクロールを使う。物理実機や初心者理解の観察ではない。

初回登録検査は次Lesson参照の欠落とcode-preview図の不足を検出し、実装へ補った。Browser検証では操作日時の不変・実行時失敗の履歴不変を誤って期待したテストが失敗し、製品の進捗/診断保存契約を確認して上記の検証へ修正した。これらの途中失敗を最終成功として数えていない。

## 独立内容・コードレビューと統合前の条件

Reviewer `review_issue109`が固定HEAD `c60a25b1e08b123e2b104a7e3fb904fc4370bbe1` / base `eee05c3`の全差分・対象教材原文・関連schema/既存実行保存経路を独立レビューし、内容・コードを承認した。必須指摘0件。01-01の登録順序/集計への影響、01-02の次Lesson参照追加、01-03の全Slide/練習・演習/Hint・Starter/Solution/9Fixture・追加図・通常登録が対象。

各範囲のaccuracy/goalExerciseAlignment/decisionはapproved、unexplainedTerms/hintLeakageは0。03の固定表示/推論の合格を動作確認に限定する条件を含めて目標整合を承認した。ReviewerはExercise bytes一致と既存画像3点（PC s01、390px図全体、390px s03練習欄）を確認し、Docker実行は上記の有効証拠に依拠した。Reviewerによる再実行・hash再計算・初心者理解/実機観察ではない。追加の全Content/全Browser再実行は要求していない。

Lesson directory hash（既存`computeLessonSourceHash`でDocker算出）:

| Lesson | hash                                                               | レビュー状態                                 |
| ------ | ------------------------------------------------------------------ | -------------------------------------------- |
| 01-01  | `b37eaea98f0d48c57403ec2137c5781c69f2127d6666f23a2321fbcef5eb052c` | 既存内容承認と一致                           |
| 01-02  | `847997ca34137403b0f1463f40044f06dca69c4a0bfa5fdf72500b1e89eed56b` | 次Lesson参照追加の限定レビュー承認           |
| 01-03  | `3daee5efafaadc32264122a4c3ed320d2d26dc99a1b2426ef84225ff8f4d42ce` | 原稿内容・追加図・通常登録の独立レビュー承認 |

最初のReview Gateは02のstale hashと03のReview欠落で停止した。上記の独立承認を得てから02のhashとReviewer/根拠を更新し、03のReviewを追加した。01-01の既存承認は変更せず、releaseStatus/verifiedSourceCommit/canonicalDistSha256はdraftのまま保持する。

台帳更新後の既存`npm run content:review`は成功（3Course・106Lesson、stale hashes 0、rejected 0）。これは既存承認とSourceの整合検査であり、106Lessonの新たな独立レビューや学習操作の再実行ではない。Reviewerは台帳と本記録の差分も確認し、実質的な誤記0件で承認した。

通常CIの必須境界では上記のcompile・対象TS test・型/build/chunks・TS出典成功を再利用し、未確認だった全体Lintと変更したTS1章のchapter検査を追加して成功した。`npm run check`を単一コマンドで再実行した結果ではなく、通常の`test:changed`が教材差分に補う全Contentの選択を今回新たに全走した結果でもない。ユーザー指定に沿って変更関連の成功証拠を保持し、未変更の全コース学習・全Browser・性能・公開Gateは追加していない。リモートCIは未実行、PRは未作成で、統合前の必要CIと最終HEAD確認を残す。main push/merge・Issue投稿/close・公開は今回の許可対象外で、実施していない。

#109の受入チェックを完了済みへ更新していない。次の実装候補は#110のQuestion/interface型条件で、別タスクとする。全TS制作/受入、Local実toolchainの完成、Home/Path公開、初心者/実機の観察、全公開Gateは未完として保持する。
