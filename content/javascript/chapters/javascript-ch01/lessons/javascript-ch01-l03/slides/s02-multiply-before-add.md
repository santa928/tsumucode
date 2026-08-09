---
id: javascript-ch01-l03-s02
title: 掛け算は足し算より先
kind: comparison
concept: 演算の優先順位
layout: comparison
teachesConceptIds: [operator-precedence]
masteryTarget: read
screenBudget: { maxTextCharacters: 300, maxCodeLines: 2, maxVisuals: 0 }
assets: []
---

同じ式に`+`と`*`があるとき、掛け算を先に計算します。丸括弧があれば、その内側が最優先です。

```js
console.log(2 + 3 * 10); // 32
console.log((2 + 3) * 10); // 50
```

読み違えそうな式には丸括弧を使うと、計算する順番が明確になります。

:::practice
prompt: 2 + 3 * 10の計算順を説明します。
expectedAction: 3 * 10を先に計算し、その後2を足すと答える
estimatedMinutes: 1
:::
