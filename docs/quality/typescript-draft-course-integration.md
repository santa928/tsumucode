# TypeScript導入2Lessonのdraft Course統合

2026-10-01。Issue #11の最初の技術・教材統合単位。全TypeScriptコースやReact/Next.jsの完成記録ではない。

## 保持する要件と今回の差分

| ID              | 区分 | この統合単位の受け入れ条件                                                             |
| --------------- | ---- | -------------------------------------------------------------------------------------- |
| REQ-TSC-001     | 維持 | 全15トピックの目標を残す。今回の2Lessonは型推論と型注釈だけを実装する。                |
| REQ-TSC-003     | 維持 | 型誤りを実行・採点せず、元TSと保存済み進捗を保持する。                                 |
| REQ-TSC-004     | 維持 | 型条件とConsoleの同じ入力の結果を両方要求する。                                        |
| REQ-TSC-005     | 維持 | Home/SlideではCompilerを起動しない。既存の隔離・停止・通信境界を保持する。             |
| REQ-TSC-006     | 維持 | 承認済み原稿から通常教材を登録し、変更した図・参照・集計を固定HEADで独立レビューする。 |
| REQ-TSC-009     | 維持 | 通常UIの01-01→01-02と元TS・合格状態の保存/再読込を実測する。                           |
| REQ-TSC-010     | 維持 | 人の初心者通し試用・実機・正式公開受入を未確認のまま残す。                             |
| REQ-TSC-INT-001 | 追加 | 初版revisionの導入2Lessonをdraftで登録し、Home/Pathの掲載状態を変えない。              |

既存要件の保留・削除はない。27Lesson/595分と新しい性能予算は既存設計案の提案として残し、この2Lesson登録で確定・達成したと扱わない。

## 教材・参照・保存の境界

`content/typescript/course.yaml`に1Phase/1Chapter/2Lesson/2標準演習/30分を登録する。総Slideは8枚で、既存schemaの分類では7概念Slideと1チェックリスト。Chapter配列のsequenceは既存規約どおり0から始める。

01-01「最初の値から型を判断する」の後に01-02「得点に数値の型を書く」を置き、01-02のprerequisiteを01-01へ接続する。Course prerequisiteはJavaScript。型推論・number・string・Consoleの用語初出を01-01へまとめ、型注釈の初出を01-02へ置く。型注釈の概念は型推論の概念を前提にする。

原稿単体はPR #77（型推論）とPR #75（型注釈）で同じPro Chatによる独立内容レビュー済み。Courseの学習段階検証で必要なコードと結果の対比を補うため、01-01のs03と01-02のs01を`code-preview`へ変更し、数値の更新・型と値・Consoleの対応図を追加する。この2枚とCourse統合は新たなレビュー対象。Exercise/Starter/Solution/Hint/Fixtureの原文は承認済み原稿と同一である。

revisionは`2026-10-01.1`。通常Courseへの初登録で、移行元の公開revisionはないため`progressMigrations: []`を初版の基準とする。架空の旧revisionは作らない。既存のIndexedDB正本・Lesson/ExerciseのID・元TS保存契約を利用する。

publicationStatusはdraft。通常CompilerのCatalogにはdraft metadataとして含まれるが、Homeはpublishedのみ表示し、Learning Pathには追加しない。これは掲載状態であり、アクセス制限ではない。現行の通常学習RouteはdraftをID指定で開ける。通常配信LessonへSolution/Fixtureを含めない既存境界を保持する。

## 検証記録

Docker内の専用コピーでCourse登録・用語初出・概念前提・8枚の集計・専用採点profile・authoringデータ非露出の2テストが成功し、`npm run content:compile`で3Course全体の参照整合を確認した。型検査と対象Lintも成功。

静的production artifactの実Chromiumで、通常Routeの01-01→01-02を連続操作した。8枚の閲覧保存、Starter型エラー時の未実行・未採点、逆profileとなる学習方法の未達、正解の合格、通常の完了画面への遷移、元TS/Console/合格状態の再読込、初版revisionの2Lesson進捗保存が成功した（最終19.1秒）。Homeと最初の4枚ではCompiler取得がなく、演習から取得することも確認した。モック教材の差し替え・ID置換・Runnerのモックは使用していない。

追加した2枚は1280×900と390×844で表示し、PCと狭幅の4画像・練習文へスクロールした2画像を目視した。図とコードの対応、読み順、横へはみ出さないことを確認。狭幅のコード枠はclientWidth=scrollWidth=332px、scrollLeft=0で、長い本文は既存の縦スクロールで読む。これは画像・合成操作の証拠であり、実機や初学者の理解の保証ではない。

開発Viteの初回依存最適化では操作途中に再読込が起こり、初期更新・保存の検証が中断したため静的配信で切り分けた。最初の`npm run build:app`は終了コード137で停止。このタスク専用のVite 4174/4176だけを止め、成功済みの同一アプリソース型検査を再利用し、`npx vite build`と`npm run build:inline-css`が成功した。次Lesson参照の修正後は同じchunkへ再生成した教材treeを反映した。最終テスト入力の型検査・対象Lintと`npm run smoke:learning-chunks`も成功。全suite/全Browser/性能/公開Gateは公開変更なしのこの統合単位では実行しない。

最終Lesson directory hash（既存`computeLessonSourceHash`、Docker計算）:

- 01-01: `b37eaea98f0d48c57403ec2137c5781c69f2127d6666f23a2321fbcef5eb052c`
- 01-02: `c2fc69f06c7cd24cbdb0ccc7b462097856f5aa47001ff79c3f6caec186022f8a`

Exercise directoryのbytesは原稿と同一であることを`diff -rq`で確認したため、PR #75の型注釈12fixtureとPR #77の型推論13fixture・掲載例の成功証拠を再利用する。今回のCourse/用語/概念・2図・nextLessonIdは上記の新しい検証と固定HEAD独立レビューの対象。統合内容レビュー台帳はレビュー回収まで空のdraftとし、未確認の内容を承認済みとは記録しない。

## 非対象・リスク・性能

03以降の教材、JS前提コースの公開受入、React/Next.js/#25、人の試用、実機、Home/Path掲載、PagesのdispatchはこのPRの非対象で、全体の到達点には残る。既存公開Gateは削除・緩和しない。公開入力が変わるRelease前に既存Gate・必要Browser/性能/subpathを実行する。

主なリスクは推論と注釈の課題条件の混同、合格済み元TSや前提進捗の損失、図とコードの不一致。別profile、型条件と動作条件のAND、通常UIの連続学習/再読込、2つの幅の画像目視と独立レビューで確認する。性能目標と測定条件は既存設計案・技術境界文書を保持し、この登録だけでp95予算達成や低速実機対応を主張しない。

- [x] 受け入れ条件を元の要件と対応させた。
- [x] 非対象を今回の統合単位と全体の到達点で区別した。
- [x] リスクと対策を残した。
- [x] 性能目標・測定条件・未測定範囲を保持した。
- [ ] 通常UI・画像目視・固定HEAD独立レビューを回収した。
