---
id: javascript-ch03-l05-s03
title: 内側Functionが外側の変数を覚える
kind: concept
concept: 外側の変数を覚える
layout: comparison
teachesConceptIds: [captured-binding]
masteryTarget: read
screenBudget: { maxTextCharacters: 290, maxCodeLines: 5, maxVisuals: 0 }
assets: []
---

`score`は外側Functionのlocal変数です。内側の`addScore`が`score`を使うため、外側Functionが終わっても値は残ります。

```js
const addScore = createScoreCounter();
console.log(addScore()); // 10
console.log(addScore()); // 20
```

同じ`addScore`を2回呼ぶため、2回目は0からやり直しません。

:::practice
prompt: 2回目が20になる理由を答えます。
expectedAction: addScoreが前回のscoreを覚えているからと答える
estimatedMinutes: 1
:::
