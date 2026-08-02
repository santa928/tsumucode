---
id: javascript-ch00-l01-s03
title: 探す・変える・結果の順に読む
kind: concept
concept: querySelectorとtextContent
layout: comparison
teachesConceptIds: [query-selector-text-content]
masteryTarget: read
screenBudget: { maxTextCharacters: 300, maxCodeLines: 3, maxVisuals: 0 }
assets: []
---

次の1行は、左から「探す場所」「変えるもの」「新しい文字」の順に読めます。

```js
document.querySelector('#message').textContent = 'ここを書き換えます';
```

- `'#message'`を目印に、HTMLの場所を探す
- `textContent`で、その場所の文字を変える
- 右端の引用符内が、画面へ表示する新しい文字

:::practice
prompt: 画面へ表示される文字だけをコードから探します。
expectedAction: 右端の引用符内「ここを書き換えます」を指す
estimatedMinutes: 1
:::
