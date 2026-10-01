# 型推論Lesson原稿の検証記録

2026-10-01。Issue #11。対象は `docs/quality/typescript-ch01-l01-draft` の通常教材原稿。Course登録・公開受け入れの記録ではない。

既存 `computeLessonSourceHash` によるdirectory全体のSHA-256は `09fdaea9a3a8ce4a2a0d449efb75c1f33c0cd7d0c342970b3c41c4692a44876b`。AUTHORING.mdも含む。記録はdirectory外に置き、原文を変更したら再計算する。

## Docker検証

- `npx vitest run tests/content/typescript-lesson-drafts.test.ts`: 型推論・既存型注釈の10件成功。導入前に型推論directory欠落で失敗することを確認。原稿の未対応metadata値は既存schemaに合わせて修正した。
- 型推論の全4掲載例を実Compilerで確認。s02の文字列再代入だけが2322/2行目の型エラーで、JSを生成しない。他3例は成功。用語/概念/参照と解答用データが学習Lessonに漏れないことも確認。
- `npm run typecheck`: 成功。
- `npx eslint tests/content/typescript-lesson-drafts.test.ts tests/e2e/typescript-compiler-worker.spec.ts eslint.config.js`: 成功。
- `npx playwright test --config=typescript-inference-playwright.config.cjs --grep "inferenceの製品採点"`: Chromiumの実Worker/Runner/Validatorによる1テスト/13fixture成功、23.2秒。通常YAMLのruntime/rules/files/期待結果を使用し、pilotからのID/profile置換を廃止した。
- `npx playwright test --config=inference-preview.config.cjs`: 4枚を既存SlideStageで表示、1テスト成功。viewport1280×900、4画像を目視し、本文・コード・練習欄の読み順と収まりを確認した。Slide単体の表示であり、Course連続遷移の証拠ではない。
- 変更教材・コードはDocker内Prettierで整形。アプリ用Lintから外すのは新draftの演習TSだけで、意図した型誤り/any/抑制をCompilerと製品採点で検証する。

PR76で成功した両profileの未達→修正→合格→元TS保存復元の4 E2Eは、その基盤入力を変えていないため再実行していない。今回追加した通常型推論bundle自体のfixture/表示は新たに実測した。

## 残る確認

固定HEAD独立レビューと教材accuracy/goalExerciseAlignment/unexplainedTerms/hintLeakageはPRで回収する。01-01/01-02のCourse同時登録、Course全体の用語初出/概念/進捗移行、連続UI、初心者試用・実機・正式公開は未完了。

公開内容を変更していないため全Browser/全性能/Release Gateは今回未実行。Course登録・β公開前に必要範囲と既存公開Gateを確認する。Gate削除や性能受け入れへの読み替えは行わない。
