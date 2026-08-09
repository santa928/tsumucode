---
id: javascript-ch01-l04-s01
title: 得点は途中で変わる
kind: concept
concept: 変わる値
layout: comparison
teachesConceptIds: [mutable-value]
masteryTarget: read
screenBudget: { maxTextCharacters: 270, maxCodeLines: 2, maxVisuals: 1 }
assets: []
---

問題へ正解すると、現在の得点へ点数を加えます。このように途中で変わる値もあります。

```js
let score = 10;
score += 5;
```

最初の`10`から、正解後の`15`へ更新されます。

:::practice
prompt: 最初の得点と更新後の得点を答えます。
expectedAction: 10から15へ変わると答える
estimatedMinutes: 1
:::
