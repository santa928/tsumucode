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

## 検証記録（作業中）

- Docker Compile成功、表追加前の関連7ファイル329テスト/型成功。表追加後のparser/schema/screen budget/表示4ファイル227テスト、型・対象Lint成功。
- Docker内Node/Chromiumで改訂した教材コードそのものを実行。Closure完成例`10 20`、独立した係`10,20,10`、次の予測`30,20`、JS DOM例3つ、HTML本文と背景`rgb(255,250,240)`の一致。信頼された静的教材の照合で、learner隔離の受入試験とは区別する。
- 3 Lesson各1代表×1280/390pxでコード行の縦順、本文末尾、前後Pager、目次、コード参照の展開を確認。ページ全体の横overflowなし。表追加後も再実行成功。
- root font-size 200%の390px表示で本文末尾と次ページへ到達、横overflowなし。
- 実Chromeのブラウザズーム200%は未確認。Tabのキー操作ではズーム変化を確認できず、本体UI操作はMacロックで不可。root font-size検証と同一視しない。

未改訂Lesson1件の表示/次移動と既存演習のEditor/Preview表示smoke成功。Production build／CSS inline／chunk isolation成功。

未完: 最新画像の目視整理、配信容量検査、教材の独立reviewとsource hash同期、関連visual差分の個別確認、最新HEADのPRレビュー。これらを完了したとは記録しない。実機タッチ・人による初心者試用は未実施。

画面予算の全体上限・配信性能予算・安全制限を緩和しない。Slide宣言内の本文/コード数は例の構成に合わせて調整し、Compileで全体上限内を検証する。通常編集ごとの全公開Gateは行わず、公開時に既存Gateを適用する。


## 比較画像と独立レビュー待ち

[変更前](evidence/issue-21/before/)はmain bfd6e174のSlide実装、[変更後](evidence/issue-21/after/)は本改訂。PC1280×800・狭幅390×844。長い内容はtop/endを分け、末尾到達を操作でも確認した。文字200%は別画像でありBrowser zoomの証拠ではない。

`content:review`はHTML/CSS導入Lessonの旧sourceHashで停止した。後続JSレビューには到達していない。改訂3Lessonの正確性・未説明語・演習整合・例の結果を独立レビュー後に台帳へ反映する。旧承認のhashだけを機械的に付け替えて通すことはしない。
