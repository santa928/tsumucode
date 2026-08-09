---
id: javascript-ch03-l05-s02
title: 外側Functionから内側Functionを返す
kind: concept
concept: 外側と内側のFunction
layout: comparison
teachesConceptIds: [outer-inner-function]
masteryTarget: read
screenBudget: { maxTextCharacters: 280, maxCodeLines: 8, maxVisuals: 0 }
assets: []
---

外側の`createScoreCounter`を呼ぶと、内側の`addScore`そのものが返ります。まだ`addScore`の処理は実行されません。

```js
function createScoreCounter() {
  let score = 0;
  const addScore = function () {
    score += 10;
    return score;
  };
  return addScore;
}
```

:::practice
prompt: 外側Functionが返すものを答えます。
expectedAction: addScoreという内側Functionと答える
estimatedMinutes: 1
:::
