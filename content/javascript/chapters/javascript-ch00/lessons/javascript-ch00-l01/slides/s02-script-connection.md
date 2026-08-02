---
id: javascript-ch00-l01-s02
title: index.htmlからscript.jsへつなぐ
kind: concept
concept: JavaScript Fileの読み込み
layout: comparison
teachesConceptIds: [script-file-connection]
masteryTarget: read
screenBudget: { maxTextCharacters: 280, maxCodeLines: 4, maxVisuals: 0 }
assets: []
---

JavaScriptは`script.js`へ書きます。`index.html`には、そのFileを読み込む行が最初から用意されています。

```html
<p id="message">読み込み前の文字</p>
<script src="script.js"></script>
```

上の`script`要素は今は暗記しません。「HTMLの内容とJavaScriptのFileがつながっている」と読めれば十分です。

:::practice
prompt: JavaScriptを書くFile名をコードから探します。
expectedAction: script.jsを見つける
estimatedMinutes: 1
:::
