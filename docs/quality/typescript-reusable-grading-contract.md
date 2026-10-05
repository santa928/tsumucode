# 関数型・generic・readonlyの有限な採点契約

2026-10-06。Issue #112の3つの初回演習へ限定した契約。一般のTypeScript文法の正しさや学習者の一般的な型理解を判定するものではない。既存Compiler/Runnerの型成功と実動作を分け、どちらも必要とする。

## 公開した学習条件

| Lesson / profile               | 型で確認すること                                                       | 元の値を使う処理                                            | Console       |
| ------------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------- | ------------- |
| ch04-l01 / number-callback-v1  | 数値1引数から数値を返すalias、数値の引数/戻り値、callback注釈          | applyが受け取ったoperationへvalueを渡し、計算役が引数を使う | 6・10         |
| ch04-l02 / generic-identity-v1 | 無制約の型パラメータ1つを引数/戻り値へ使い、数値と文字列の受取先に注釈 | 受け取った値をそのまま返す                                  | 2・型のクイズ |
| ch04-l03 / readonly-copy-v1    | readonly number[]の入力、number[]の出力                                | 元の要素から別配列を作る。呼出し元は元配列へ後から4を追加   | 1,2,4・1,2,3  |

名前・引用符・括弧の違い、関数宣言と変数のarrow/function式、ローカルへ1回複写してreturnする別解を扱う。callback計算役はOperation注釈による引数の推論か明記を使い、掛け算/足し算で引数から計算する。型の契約は2倍の正しさを決めないので、3倍の誤例は型条件が成立してもConsole条件で未達とする。

genericは呼出しからの推論とnumber/stringの型引数明記を扱う。readonlyはreadonly number[]/ReadonlyArray<number>、戻り値のnumber[]/Array<number>、spread/concatによる別配列を扱う。異なる追加値の例は型と元値を使う条件が成立しても実出力で未達となる。型の契約だけを満たす誤動作を、学習合格へ広げない。

原文ASTは、課題内の型宣言・関数・明示した実行例だけを有限に受理する。追加関数、ループ、分岐、更新処理、複数ファイルなどは課題の範囲外で、一般のTypeScriptで不正とは説明しない。readonly課題の元配列へのpush(4)だけは、readonlyが実行時の凍結ではないことを比較する実行例として受理する。

any、assertion、非null assertion、診断抑制、reference directive、固定表示/固定戻り値で条件を回避しない。型条件と処理の有限構文、既存Compilerの実型検査、すべてのConsole結果をANDにする。通常Previewの安全制約は変更しない。

## 型検査と境界

AST/checkerはCompiler Workerの内部だけに置く。原文のコピーへ予約exportを追加し、別ファイルの正負例を固定Compilerで非emit検査する。callbackの正例2/負例4、genericの正例2/負例3、readonlyの正例2/負例3を確認する。

負例は誤った引数・戻り値、genericの型引数と結果の不一致、readonly配列への代入/ push。file・line・code・件数と正のcolumnを照合する。column完全一致や、型消去後の値の凍結を確認したとは記録しない。readonlyの正例では戻り値へpushできることも型で確認する。

単一main.ts、8192文字/2048 AST node/深さ64まで。予約ファイル名/識別子、検査基盤・libの不備、probe不一致はsystem-error。probe、コピー、AST、診断はRunner/編集元TS/進捗へ渡さない。返却は要求profileと7つのboolean factだけ。余分なpayload、他profile、不成立なのにprobe成功する結果は拒否する。

CompilerClientは既存の入力複写、session/revision/request照合、取消・置換・期限・Worker破棄を維持する。Validatorは固定Lessonの単一必須型Ruleと独立した単一必須Console Ruleだけを許し、同じ入力hashと世代で再型検査する。型失敗は未実行/未採点、処理の失敗はcode-error、型条件/表示不足はincomplete、基盤/証拠不一致はsystem-error。元TSと履歴を保持して修正/再試行できる。

## 教材と非対象

3単位を前のoptional Lessonへ接続する。Courseとreviewのdraft、authoring専用Solution/Fixtureの非配信、旧2/3/4/6Lesson進捗の移行を維持する。readonlyは型の参照からの変更制限で、実行時の凍結ではない。数値配列の新規コピーを確認する範囲で、深い複写/凍結や全参照の変更防止を保証しない。

高度な型プログラミング、全TypeScript Courseの制作/正式公開、27Lesson/595分案、TS固有の性能予算、初心者試用/物理実機の受入は含まない。固定Compiler/Consoleでの成功をそれらの代わりへ使わない。

一次資料確認（2026-10-06、文章/図/例は独自制作）: [More on Functions](https://www.typescriptlang.org/docs/handbook/2/functions.html)、[Generics](https://www.typescriptlang.org/docs/handbook/2/generics.html)、[Object Types](https://www.typescriptlang.org/docs/handbook/2/objects.html)。型の仕様は公式資料と、固定Compiler 6.0.3の対象例の実行証拠を照合する。
