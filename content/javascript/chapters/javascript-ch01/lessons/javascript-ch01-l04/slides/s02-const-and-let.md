---
id: javascript-ch01-l04-s02
title: constとletを使い分ける
kind: comparison
concept: constとlet
layout: comparison
teachesConceptIds: [let-binding]
masteryTarget: read
screenBudget: { maxTextCharacters: 300, maxCodeLines: 2, maxVisuals: 0 }
assets: []
---

`const`は変えない値、`let`はあとで変わる値へ使います。

```js
const pointPerQuestion = 5; // 途中で変えない
let score = 10; // 正解するたび変わる
```

迷ったときはconstを基本にし、本当に更新する変数だけletにします。

:::practice
prompt: 1問の点数と現在の得点をconst／letへ分けます。
expectedAction: 1問の点数はconst、現在の得点はletと答える
estimatedMinutes: 1
:::
