---
id: javascript-ch00-l01-s03
title: 探す・変える・結果の順に読む
kind: concept
concept: querySelectorとtextContent
layout: comparison
teachesConceptIds: [query-selector-text-content]
masteryTarget: read
screenBudget: { maxTextCharacters: 370, maxCodeLines: 2, maxVisuals: 0 }
assets: []
codeReferenceSlideId: javascript-ch00-l01-s02
---

前のHTMLのmessageという目印を使います。次の行を「探す場所」「変えるもの」「新しい文字」の順に読みましょう。

```js {"label":"script.js", "role":"input", "highlightedLines":[1]}
document.querySelector('#message').textContent = 'ここを書き換えます';
```

```text {"label":"ページに表示する文字", "role":"output"}
ここを書き換えます
```

- querySelectorは指定した目印で要素を探す処理。'#message'がHTMLのid="message"に対応する。
- textContentはその場所の文字。=の右側にある文字へ置き換える。
- 引用符は文字の範囲を囲む記号。引用符そのものはページへ表示されない。

:::practice
prompt: 右端の引用符内を「こんにちは」に変えた結果を予想します。
expectedAction: 表示が「こんにちは」になり、目印のmessageは変えないと答える
estimatedMinutes: 1
:::
