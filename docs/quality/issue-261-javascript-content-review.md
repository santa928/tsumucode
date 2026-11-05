# Issue #261 JavaScript導入2教材の独立内容レビュー

対象は `javascript-ch00-l01` と `javascript-ch01-l01` の文言4文書である。用語を日本語の意味から正式名へ説明し、編集対象・更新操作・表示する実値・判定をつなげた。変更前後はGit差分で確認できる。作者は `codex-issue261-javascript-clarity-author`、新規独立レビュアーは `/root/review_js_clarity`。レビュアーは教材を編集・実行していない。

## 手順と今回の判断

既存の[内容承認更新手順](issue-21-slide-examples.md#比較画像と独立レビュー)と[技術受入の記録](2026-10-02-sol-integration-acceptance.md)に従い、内容の読解、掲載例の実行、Browser表示、公開承認を区別する。機械検査は `scripts/content/verifyContentReview.ts` の全文hash、作者とレビュアーの分離、内容項目の承認条件を維持する。

レビュアーは両教材の `lesson.yaml`、全8スライド、課題本文、`exercise.yaml`、Starter/Solution全ファイル、3段階Hint、参照用語を実際に読み、ch01の図はSVGソースを照合した。UI操作名は実装ソースと照合した。主担当は下記の旧版と新文面のbyte・hashをDocker内で確認した。

| Lesson              | accuracy | goalExerciseAlignment | unexplainedTerms | hintLeakage | decision |
| ------------------- | -------- | --------------------- | ---------------- | ----------- | -------- |
| javascript-ch00-l01 | approved | approved              | 0                | 0           | approved |
| javascript-ch01-l01 | approved | approved              | 0                | 0           | approved |

ch00では既存1行の右端の文字列を変更する到達点と、表示する実値・Solution・2採点ルールが一致する。ch01では3種類の値とConsoleの順序が、r05の出力比較とr06の種類を保った受け渡し条件に一致する。既存の `transform` 支援段階に沿う完成形や最終Hintを、自力設計の判定として扱っていない。この設計内で漏洩0と判断した。

## 旧実行記録を再利用する範囲

比較基点は `9821a4eb16b7395ccf94bfbb59f467507bca97b3`。その教材全文hashが旧承認行のhashと一致することを確認し、変更が各教材のスライド1文書と課題本文だけであることを確認した。掲載フェンスのコードと属性、Starter/Solution/Fixture、採点条件、Goal、Hintは不変である。

| Lesson              | 不変ファイル | 不変掲載コードブロック | 不変ファイル集合SHA-256                                            |
| ------------------- | ------------ | ---------------------- | ------------------------------------------------------------------ |
| javascript-ch00-l01 | 35           | 7                      | `b1b80f315603b42c3bfab76e8dea33a366bdee1ab162ab4bf814a66e38918761` |
| javascript-ch01-l01 | 20           | 4                      | `7338b7f3753478e1c9abfb33c9556f21b74254a827becfcdb0c16f9825cfb481` |

集合hashは、Lesson内の不変な通常ファイルを相対pathの昇順に並べ、各 `path + NUL + bytes + NUL` をSHA-256へ渡したもの。シンボリックリンクを拒否し、旧版と現在版のファイル集合も一致させた。掲載コードは既存Markdown parserのcode block全体を比較した。

今回の `examplesExecuted: true` は、下記の旧承認原本に記録された実行の限定再利用である。新しい教材文面で掲載例を新規実行したこと、旧実行の生ログを今回再閲覧したこと、実RunnerやBrowserを再試験したことを表さない。旧評価を新文面への内容承認として流用せず、今回の内容承認は上記の独立再読解に基づく。

## hashと原本の保持

| Lesson              | 旧全文hash                                                         | 新全文hash                                                         |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| javascript-ch00-l01 | `a004b43c4ce9f4880f6422ca4fd36e36d984620640c3e5f52dbdfc5cb729487d` | `be6a3db76c1279e9591776982117e217aa408b8172b53a3f6190b76b13cf1405` |
| javascript-ch01-l01 | `92acbef8ca5eeb599ecadcda91018edaf76adf5aec43966640061e8370d460c5` | `b613cef51cd10243931de04cc8739b87988b3d3d1931b0ee5120d3723039d92e` |

独立レビュアーが読んだ変更4文書のSHA-256は主担当の再計算と一致する。

| 文書                                                       | SHA-256                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| ch00-l01/slides/s03-read-text-content.md                   | `83de048f01cb92113fbfa8aa8454c05226b154fd176b9caa1ece75ee8b3cc8e5` |
| ch00-l01/exercises/javascript-ch00-l01-e01/instructions.md | `2b2fc277faacedf55f791e82b750f4c421f582516e8a16330d06a804ea23ca3e` |
| ch01-l01/slides/s01-values-on-screen.md                    | `9d850d00bb844899f06b69daf32ed5265fae579c40278311931f494da8a14e6e` |
| ch01-l01/exercises/javascript-ch01-l01-e01/instructions.md | `fba735d0712a6f3164cc68e5de8f300e12e887ff3412a8e3b39c8547e29d5fdd` |

旧原本は基点commitの `docs/quality/content-review-javascript.yaml` と以下の転載に保持する。各行SHA-256は先頭の2空白から末尾改行までのUTF-8 bytesを対象にする。再整形しない。

ch00旧行SHA-256: `d9230e6c176537821d6f84ab014024af310bea84a3f8ed163543ae5f57f1c497`

```text
  - lessonId: javascript-ch00-l01
    authorId: gpt-6.1-sol-js-entry-author
    reviewerId: gpt-6.1-sol-independent-js-entry-review
    sourceHash: a004b43c4ce9f4880f6422ca4fd36e36d984620640c3e5f52dbdfc5cb729487d
    accuracy: approved
    goalExerciseAlignment: approved
    unexplainedTerms: 0
    hintLeakage: 0
    examplesExecuted: true
    decision: approved
    notes: 開始Slideの役割確認を頭の中で行う案内へ限定修正し、静的Practiceとの整合を非作者レビュー。Exercise・Rule・掲載実例の実行入力は同byteのため既存実証を範囲付き再利用。3persona全通し・JS通常公開・実人の学習/時間は未承認、metadataはdraft。
```

ch01旧行SHA-256: `a0f489e1fa51a7d25e91e753144bcd21fd64b3043a98171282b6abf3314d787a`

```text
  - lessonId: javascript-ch01-l01
    authorId: tsumucode-javascript-authoring
    reviewerId: gpt-6.1-sol-independent-js52-content-review
    sourceHash: 92acbef8ca5eeb599ecadcda91018edaf76adf5aec43966640061e8370d460c5
    accuracy: approved
    goalExerciseAlignment: approved
    unexplainedTerms: 0
    hintLeakage: 0
    examplesExecuted: true
    decision: approved
    notes: '旧46独立読解と新6固定承認を、同byte本文/Hint/Starter/Solution、現在のRule/Goalへ結合。既存394 Fixture＋累積prefix10（対象36演習）の原実測を再利用。 本Lessonを含む初出前案内6件は現候補の実iframe Snapshot/採点で正答6pass・反例6incomplete、診断0、Source認証/新文言一致。証拠SHA256 55ae2d8e375c87ea77449b6b7323e62a86561e22505c45de11a019e0f8ff509d。 内容52Lesson/54Exerciseの技術承認であり、3persona全通し・JS通常公開・実人の学習/時間は未承認。Course/release metadataはdraftを維持。掲載例の新実行と旧実測再利用を区別する。参照: 2026-10-02-sol-integration-acceptance.md / javascript-project-course-contract.md。固定教材/Rule binding SHA256 f9b4b742513f47e79dd39b96e3f4eb893ae736ef2922c03250803c0ab64084a1。'
```

旧台帳上位の `releaseStatus: approved`、`verifiedSourceCommit: 5ac6e3a1572c0b14ff796f939282d9121ebece69`、`canonicalDistSha256: 2cac445ab57ac6310c920f18e841097df13f22cb07fab51685a09bcbcba53e1f` は旧版の値である。新文面の公開候補へ付け替えず、今回の作業branchの台帳上位3項目だけを `draft` へ戻す。他50教材の承認行と、旧初心者3役の原本・公開記録は変更しない。

## 確認済みと残件

変更前の台帳が新hashの2教材をstaleとして拒否することを確認した。変更4文書のPrettier、JavaScriptのcompileと既存画面予算は成功している。変更スライドは262/370字と165/280字である。

更新後は既存の `verifyReviewLedger` を対象2行と再計算した全文hashへ適用し、`lessonsReviewed: 2`、`staleHashes: 0`、`rejected: 0` を確認した。他50行の値と旧原本2行の転載bytesは不変。独立差分レビューで見つかったYAMLの `#261` による注記欠落を引用形式で修正し、読み込み後にもIssue番号・旧実証の限定再利用・今回の実行/Browser/3役再観察ではない旨が残ることを検査した。全Courseの正式公開Gateとは区別する。

Browser表示・代表PC/狭幅の読み順・実操作は枠割当待ちで、今回未確認。全体検証・公開用Source/Artifactの再bindingも未実施。旧初心者3役の観察を繰り返しておらず、実人の理解・実務能力・学習時間を実証していない。Issue #261全体と正式公開の承認ではない。
