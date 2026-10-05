# Question/interface Lessonの通常draft接続

2026-10-05。Issue #110、基点はmain `3553c54`（#109のPR #156統合後）。PR #80の作者原稿を通常Lessonへ登録し、初回演習だけの型条件と実行結果を既存Compiler/Runnerへ接続する。

## 登録と判定の契約

`typescript-ch02-l01`の4枚と演習を、型推論→型注釈→型消去・実行時失敗の次へ追加する。Courseは2Chapter・4Lesson・16枚（13概念Slide）・4演習・65分のdraft。65分は見積りで、初心者の実測ではない。用語interface・string[]・プロパティ・type alias・.at()を初出説明し、型の形と実行の値を分ける図に代替テキストを付けた。

revisionは`2026-10-05.2`。旧2Lessonの`2026-10-01.1`、旧3Lessonの`2026-10-05.1`から空stepで移行し、既存ID・元TS・合格・閲覧・Hint・履歴・passing snapshotを保持する。新Lesson開始時はCourse全体を未完へ再計算する。Solution/Fixtureはauthoring専用で通常配信へ含めない。

型条件は[有限な採点契約](typescript-question-interface-grading-contract.md)の`question-interface-v1`だけ。interfaceの3つの必須項目と型、対応する注釈、問題文と選択肢、正答位置で選ぶ表示を原文ASTで確認する。型名/変数名の改名、項目順・引用符・Array表記・数値だけの位置計算を許す。コピーの正例2・負例6を非emitで型検査し、欠落/誤型の診断位置と件数まで照合する。コピー・probe・ASTをRunnerや保存へ渡さない。型成功とConsoleの「内容」が1回という動作をANDで判定する。

作者原稿の`choices[correctIndex]`は既存Previewが動的computed accessとして拒否する。初回の実ブラウザー検査でこれを確認し、通常教材のみ既存に許可された`.at(correctIndex)`へ適応した。作者原稿とPreviewの安全制約は変更していない。学習目標はinterfaceの形・注釈と型/値の境界で、Starterの正答位置を文字列から数値へ直す操作を保持する。`.at()`は4枚目で説明する。

位置10/1は型条件を満たすが実出力条件を満たさない。負数-2/小数0.5では同じ「内容」が出るため、このクイズの0から数える位置という元TSの条件で拒否する。一般のJavaScriptの不正とは説明しない。any・assertion・診断抑制・型の弱化・固定表示も型成功や同じ出力だけで学習達成にしない。

元TS/HTML・runtime/session/revisionの既存SHA256証拠と再型検査を保持する。型失敗は未実行/未採点、実行失敗はcode-error、形/出力不足はincomplete、環境や世代の不一致はsystem-error。元TSと履歴を保持して修正できる。既存通信/実行隔離・入力上限・Compiler遅延読込・Worker10秒は変更しない。学習検査だけ8192文字/2048 AST node/深さ64へ限定する。教材の意図的な誤型/条件回避Fixtureは既存方針と同じく、その演習データの正確なパスだけESLint対象外とし、専用Compiler/Runnerテストで検査する。製品src/testsの規則は維持する。

## 変更範囲の検証

既存環境を再利用した専用Docker `tsumucode-issue110-check`で実行。Node 24.18.0、TypeScript 6.0.3、Playwright 1.61.1、Chromium 149.0.7827.55、Linux arm64。ホスト依存/設定・他コンテナは変更していない。

- `.at()`修正後の`content:compile`（3Course）、新章検査（1Lesson/3概念Slide/1演習）、型検査・全Lint成功。
- 実Compiler単体6件、通常掲載例5つを確認する1件、通常登録/配信/旧2・3Lesson進捗移行4件の計11件成功、30.61秒。必須3項目の欠落/誤型、改名/別表記、条件回避、負数/小数、範囲外/別位置、未知構文/検査環境/予算、Worker有限payloadを確認。
- 直近の意味変更に影響しないCompilerClient17件とValidator20件の既存成功証拠を再利用。Question profile、入力コピー/世代照合、異なるprofile/余分な結果の拒否、型/動作AND・古いsource hash・Rule欠落を確認したもの。変更後の実Compiler成功の代わりには数えない。
- `build:app`、inline CSS、`smoke:learning-chunks`成功。TypeScript出典は109 files/109 itemsで成功。Compiler Workerは約7.29MB（非gzip）、新たなTS性能p95の達成測定ではない。
- 修正後の実Chromium4件成功、約1.8分、retry0。Questionの18Fixtureを実Worker/Runner/Validatorで確認。通常Routeで4枚の閲覧保存、Starter型失敗未採点、anyの条件不足、型は正しい誤値、履歴の再読込、型検査中の編集で古い合格を保存しないこと、Reset、Solutionの合格/完了/元TS/Consoleの保存・再読込を確認。
- 既存01→02の通常経路・profileの区別・合格/保存と新revisionを確認。新Lessonの390pxでページ横はみ出しなし、図/練習欄/前提参照の到達と操作、axe違反0。PCでもaxe違反0、次Slideをキーボード操作した。
- 作者は1280×900のs01/s04、390pxの図全体・変更後s04本文/練習欄を画像そのもので確認。コードの長い行は既存枠内の横スクロール、Slide全体は縦スクロールを使う。モバイルの演習は既存のPC利用案内を維持する。物理実機や初心者理解の観察ではない。

初回実ブラウザーの2失敗は動的computed accessの拒否を検出したもの。モバイル1件は成功したが、変更したs04は修正後に再確認した。途中失敗を最終成功に数えず、Runtime制約や正答の期待値を緩めて通過させていない。

## 独立レビューと統合の状態

独立Reviewer `review_issue109`が固定HEAD `70da7ac3e9805ae8718a0faed09f634a93e6942c` / base `3553c54`の内容・コードを承認した。実装と通常教材/Hint/18Fixture/図・型と値の境界・有限別解・安全制約・進捗移行・配信境界・既存03の次Lesson参照が対象。必須修正・実質的不具合の指摘は0件。

02-01全内容と03の次Lesson参照追加についてaccuracy/goalExerciseAlignment/decisionはapproved、unexplainedTerms/hintLeakageは0。Reviewerは55file差分・原文・関連判定経路を読解し、diff checkと修正後画像4点（PC s04、390px s04本文/練習欄、形と値の図）を確認。examplesExecutedは作者の上記実行証拠に依拠し、Reviewerによる再実行/hash再計算・初心者/実機の観察ではない。

Lesson source hashは既存`computeLessonSourceHash`でDocker算出:

| Lesson | hash                                                               |
| ------ | ------------------------------------------------------------------ |
| 01-01  | `b37eaea98f0d48c57403ec2137c5781c69f2127d6666f23a2321fbcef5eb052c` |
| 01-02  | `847997ca34137403b0f1463f40044f06dca69c4a0bfa5fdf72500b1e89eed56b` |
| 01-03  | `b354866c0f28cbfb8fbdbe49ec6ba032a57240c3d0d9c85b5d5925471008c125` |
| 02-01  | `5292f41257dd269883924b2f5ffebcdf9d10b2f27074011f339f60d0dbf18f28` |

既存01/02の承認と一致。最初のReview Gateは03のstale hashと02-01の欠落で停止した。独立承認後に03を限定更新し02-01を追加、01/02とCourse/Reviewのdraftを保持する。台帳整合・通常CIの正確なHEAD成功を確認してから統合する。本記録時点でremote CI/push/PR/mergeは未実施。

台帳反映後の`content:review`は3Course・107Lesson、stale hashes 0・rejected 0で成功。変更範囲のPrettierとdiff checkも成功した。107Lessonの新たな内容レビューや全学習操作を実施した意味ではない。

全TS制作・最終受入/公開は#111〜#115。27Lesson/595分案・TS固有性能予算案は新たに承認していない。Home/Path掲載、初心者/物理実機、正式公開Gateは未完で、自動検証や通常CIに置き換えない。通常PR/main CIはdeployを起動しない。
