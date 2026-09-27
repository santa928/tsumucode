---
id: javascript-ch00-l01-s02
title: 2ファイルと表示結果をつなげる
kind: concept
concept: JavaScript Fileの読み込み
layout: comparison
teachesConceptIds: [script-file-connection]
masteryTarget: read
screenBudget: { maxTextCharacters: 350, maxCodeLines: 4, maxVisuals: 0 }
assets: []
---

この2ファイルを同じ場所に用意すると、ブラウザー（Browser）がHTMLを読み、続けてJavaScriptを動かします。演習では接続する行が用意済みです。

```html {"label":"index.html", "highlightedLines":[2]}
<p id="message">読み込み前の文字</p>
<script src="script.js"></script>
```

```js {"label":"script.js", "role":"input", "highlightedLines":[1]}
document.querySelector('#message').textContent = '学習を始めよう';
```

```text {"label":"ページに表示する文字", "role":"output"}
学習を始めよう
```

HTMLのscript要素がscript.jsを読み込みます。JavaScriptがmessageの文字を書き換えるため、最後に見えるのは「読み込み前の文字」ではありません。この結果欄は完成例の静的な表示です。

:::practice
prompt: script.jsを読み込む行と、最後にページへ表示する文字を指します。
expectedAction: HTMLの2行目と「学習を始めよう」を指す
estimatedMinutes: 1
:::
