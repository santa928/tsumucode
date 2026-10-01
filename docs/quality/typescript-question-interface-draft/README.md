# Questionをinterfaceで表す小教材原稿

Issue #11 / PR80のBriefを、4枚のSlide原稿と1演習の作者用案へ具体化した。未登録・未承認の原稿であり、通常Course、Catalog、Path、学習画面、製品採点器へ接続していない。27Lesson/595分の全量設計を確定した記録でもない。

前提はJSのオブジェクト/配列/0から始まる添字と、TSの型推論/注釈/型消去。前提Lessonの人の受入を完了扱いにしない。今回の新語はinterfaceと配列の型`string[]`に絞る。type alias/optional/readonly/generic/Reactはこの原稿の既習条件へ追加しない。

| 順序 | 原稿                          | 小さい目標                                                         |
| ---- | ----------------------------- | ------------------------------------------------------------------ |
| 1    | slides/01-shape.md            | オブジェクトの形と値の違いを読み、Questionという形の名前を説明する |
| 2    | slides/02-required.md         | 必須のcorrectIndexがないと型誤りになる場所を読む                   |
| 3    | slides/03-field-type.md       | 文字列の位置を数値へ直し、引用符の有無で型が変わると予測する       |
| 4    | slides/04-runtime-boundary.md | 形の型検査と配列範囲の確認を分けて説明する                         |

演習のinstructions.mdに公開した練習条件、3段階Hint、作者が見る回答の理由を記載。Starterは`correctIndex`を文字列にして型誤り、Solutionは数値0。表示だけを固定して通す、型条件を消す、型の確認を迂回する解答を学習達成として扱わない。一方で、Questionの名前変更は形を読む目標を変えない。自動採点による区別は未実装で、PR80の固定原稿の型関係観察を任意source用の安全な判定器へ流用しない。

掲載TS例は単独の全sourceとして実Compilerで検査する。型Errorの例はコードを実行せず、診断のcode・file・位置を確認する。範囲外の例は型が通ることを示す対照で、有効なクイズデータのSolutionではない。教材では`console.log`の値を予測する練習として記載する。作者は型検査とは別に型成功3sourceを実Nodeで実行し、出力なし・`undefined`・`内容`を照合した。製品Consoleや実Runnerの確認としては扱わない。

原稿の読解順序/Hint/型診断と、固定作者sourceのNode実行までが今回の作者確認範囲。通常Slideのfrontmatter/Concept/Glossary/Rule/Fixtureへの接続、学習画面の収まり、実Preview/保存/Reset/合格状態、初学者の理解、独立Proレビューは未完。通常Lessonへ登録する前に有限な型学習条件と動作とのAND、未知入力/世代/時間/保存、実画面を別に確認する。既存性能予算と公開Gateは変更しない。

公式一次資料: [Interfaceと配列の型](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html)、[オブジェクトの必須プロパティ](https://www.typescriptlang.org/docs/handbook/2/objects.html)。文章と例はこの作品に合わせた独自原稿。

Starter/Solutionの作者用sourceは`exercise/*.ts.txt`。通常Projectへ未登録の原稿であり、意図した型Errorを含むためテキストで保管する。検査時に内容を仮想`main.ts`として実Compilerへ渡す。既存TypeScript/Lintの設定や除外範囲を増やさない。

作者技術確認では、実Docker Compiler6.0.3で掲載6sourceがready3/type-error3と一致。必須欠落はmain.ts:6:7 TS2741、誤型例とStarterはmain.ts:9:3 TS2322、失敗3sourceはJSなし。公開Hintの1箇所修正だけでStarterがSolution全文と一致する。掲載6sourceのSHA256を固定した別確認で、型成功3sourceだけ同じCompilerで再emitし、Dockerの実Node24.18.0で実行した。形の例は出力なし、範囲外例は`undefined`、Solutionは`内容`、終了コードは全3件0。型Error3sourceと元の12制御原稿は実行しない。DOM・製品Console/実Runner/保存/Reset・人の理解はこの作者確認の完了範囲に含めない。
