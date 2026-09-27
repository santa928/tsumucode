# 3 Lessonの説明・コード・結果の対応

対象は `html-css-ch00-l01`、`javascript-ch00-l01`、`javascript-ch03-l05`。教材ID、完了条件、演習、進捗・下書き保存形式、provenance ID、公開/draft区分は維持する。

## 要件と設計

| ID      | 区分   | 要件と実装                                                                   |
| ------- | ------ | ---------------------------------------------------------------------------- |
| REQ-001 | 維持   | 3 Lessonだけ本文改訂。全212 Slideの書き直しをしない                          |
| REQ-002 | 維持   | Lesson全体で目的→完全例→静的結果→重要行の理由→勘違い→試すことをつなぐ        |
| REQ-003 | 維持   | DOMは著者順。明示した入力と直後の出力/画像だけPCで横置き、狭幅では縦置き     |
| REQ-004 | 維持   | 任意ラベル・注目行・軽量構文色。Editor/Runnerを読書のために読み込まない      |
| REQ-005 | 具体化 | Closureの同じ係の10→20、別の係の10を表で比較。先行コードを折り畳み参照       |
| REQ-006 | 維持   | ID・保存・由来を維持。新採点操作やCMSは追加しない                            |
| REQ-007 | 具体化 | PC/狭幅/文字拡大で順序と操作到達を実測。共通CSSの未改訂Lesson/演習回帰も確認 |

保留・削除なし。通読UI・しおりは#22、新しい予測・修正・応用の解答/採点は#23で扱う。工房の生成り・深緑・黄色を維持し、静的出力を実行結果や採点合格と誤認させない。

## 著者向けの最小記法

既存の言語名だけのfenceは互換。任意のJSONは次の表示情報だけを許可する。

````markdown
```js {"label":"script.js", "role":"input", "highlightedLines":[2]}
const score = 10;
console.log(score);
```

```text {"label":"Console", "role":"output"}
10
```
````

- `label`: 空でない80文字以内の文字列。HTML/MDX/link等の禁止は本文と同じ。
- `role`: `input` / `output`。outputは「静的な例」と表示し、実行しない。
- `highlightedLines`: 1始まり、重複・コード範囲外を拒否。色に加え「注目：2行目」と表示する。
- `resultAssetId`: inputの直後に置く結果画像のasset ID。違う画像やinput以外の指定は拒否。隣接しただけの画像を自動でペアにしない。
- JSONの未知キーを拒否。shell、CSS、HTML、実行オプションは受け取らない。

`codeReferenceSlideId`はSlide frontmatterの任意項目。同じLessonの先行するコード例に限定し、自己・後方・他Lesson参照を拒否する。表示は既存LessonデータのコードBlockから生成するため、定義を教材Sourceへ複製しない。折り畳みを開いても閲覧進捗や演習合格は変更しない。

短い状態比較には、外側を `|` で囲み区切り行を `---` とする表を使える。2〜5列、本文1〜12行、列数一致、空セル禁止。各セルは本文と同じ安全な文字列。DOMはtable/th(scope)/tdで、狭幅では表内を横スクロールできる。新しい汎用図解基盤やHTML埋込ではない。

色分けはJS/HTML/CSSの読み取り補助で、完全な構文解析ではない。未知言語はプレーン表示。文字列はReactのtext nodeとして保持し、HTMLを実行しない。長い行はコード内でスクロールし、注目色だけに説明を依存させない。

## 検証記録

- Docker Compile成功、表追加前の関連7ファイル329テスト/型成功。表追加後のparser/schema/screen budget/表示4ファイル227テスト、型・対象Lint成功。
- Docker内Node/Chromiumで改訂した教材コードそのものを実行。Closure完成例`10 20`、独立した係`10,20,10`、次の予測`30,20`、JS DOM例3つ、HTML本文と背景`rgb(255,250,240)`の一致。信頼された静的教材の照合で、learner隔離の受入試験とは区別する。
- 3 Lesson各1代表×1280/390pxでコード行の縦順、本文末尾、前後Pager、目次、コード参照の展開を確認。ページ全体の横overflowなし。表追加後も再実行成功。
- root font-size 200%の390px表示で本文末尾と次ページへ到達、横overflowなし。
- Docker内Chromiumの`chrome://settings/appearance`でページズームを実際に200%へ変更。1280×813 / DPR 1 → 640×406 CSS px / DPR 2、root font-sizeは16pxのまま。Closure s03の本文末尾、前後Pager、目次に到達し、ページ横overflowなし。検証用profile内で100%へ戻して終了した。Linux headless Chromiumでの確認であり、Mac/iOS実機確認とは区別する。
- 演習内の関連Slide Drawerにも先行コード参照を表示。Closure不正解→関連Slide→参照展開→演習へ戻る経路で定義を読め、下書きと保存進捗が変わらない回帰を追加。修正前の参照欠落を検出し、修正後は既存JS下書き/Reset回帰と合わせ2件成功。関連表示unit 9件、対象Lint成功。
- 狭幅のSlideはShellが本文とPagerを通常フローでスクロールし、Document自体は固定する。既存a11yのスクロール対象をこの契約に合わせ、axe・横overflow・案内/Pager到達を維持した7件成功。
- 全Course validatorの純粋な生成を明示し、Homeが不要な教材検証schemaを取り込まないようにした。Home初期配信175,066 bytes、追加17,004 bytesで既存上限20,480 bytes以内。容量9件、schema/compiler 131件成功。実際のvalidation呼出しや安全制限は維持する。

未改訂Lesson1件の表示/次移動と既存演習のEditor/Preview表示smoke成功。Production build／CSS inline／chunk isolation成功。

未完: 修正後教材の限定再reviewとsource hash台帳同期、最新HEADのPRレビュー/CI。実機タッチ・人による初心者試用は未実施。

画面予算の全体上限・配信性能予算・安全制限を緩和しない。Slide宣言内の本文/コード数は例の構成に合わせて調整し、Compileで全体上限内を検証する。通常編集ごとの全公開Gateは行わず、公開時に既存Gateを適用する。

## 比較画像と独立レビュー

[変更前](evidence/issue-21/before/)はmain bfd6e174のSlide実装、[変更後](evidence/issue-21/after/)は本改訂。PC1280×800・狭幅390×844。長い内容はtop/endを分け、末尾到達を操作でも確認した。`closure-text200-*`はroot文字サイズ200%、`closure-browser200-*`は上記の実ブラウザズーム200%で別の証拠。ブラウザズーム画像は表示全体をCDPのDIP寸法1280×813で撮影した。

既存Visualの変更対象26件はexpected/actual/diffを個別に確認し、著者順、静的コード/結果ラベル、参照、狭幅通常フローによる意図した差分だけ更新した。HTML s01のPreview説明追加後はその9件を再撮影・個別確認した。末尾2件は実スクロール対象のShellへ移動してから案内とPager到達を検証する。閾値緩和・skip・一括snapshot更新はしていない。

独立Proレビュー（対象HEAD `56b40f6d8b5a3b42e406e268bb4527c802de7fcb`）は[PR #36の記録](https://github.com/santa928/tsumucode/pull/36#issuecomment-5856071665)に保存した。JS導入は正確性・演習整合を承認。HTML導入のPreview初出説明とClosure s03の「末尾2行を5行へ置き換える」明記を必須修正としたため、その2箇所を修正して限定再reviewを依頼する。Closureはこの置換手順どおりにコードを組み立てた実行でも10、20、10を再確認した。

`content:review`はHTML/CSS導入Lessonの旧sourceHashで停止した。改訂3Lessonの正確性・未説明語・演習整合の独立レビューを、Codexによる実例実行・source hash計算と区別して台帳へ反映する。旧承認のhashだけを機械的に付け替えて通すことはしない。
