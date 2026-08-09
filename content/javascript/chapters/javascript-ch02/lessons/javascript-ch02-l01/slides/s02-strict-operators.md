---
id: javascript-ch02-l01-s02
title: ===と!==を使い分ける
kind: comparison
concept: 厳密等価と厳密不等価
layout: comparison
teachesConceptIds: [strict-equality, strict-inequality]
masteryTarget: read
screenBudget: { maxTextCharacters: 300, maxCodeLines: 2, maxVisuals: 0 }
assets: []
---

`===`は「左右の値と種類が同じ」、`!==`は「左右の値または種類が違う」を確かめます。

```js
'A' === 'A'; // true
'A' !== 'A'; // false
```

記号を1つ変えると、質問の意味が反対になります。イコールは3個続けて書きます。

:::practice
prompt: 「回答がAと同じ」を確かめる記号を選びます。
expectedAction: ===を選ぶ
estimatedMinutes: 1
:::
