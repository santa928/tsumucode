---
id: javascript-ch03-l02-s02
title: parameterで受け取った値へ名前を付ける
kind: concept
concept: parameter
layout: comparison
teachesConceptIds: [function-parameter]
masteryTarget: read
screenBudget: { maxTextCharacters: 280, maxCodeLines: 3, maxVisuals: 0 }
assets: []
---

Function宣言の丸括弧に書く名前をparameterと呼びます。呼び出し時に渡した値を、波括弧の中でその名前から使えます。

```js
function calculateScore(correctAnswers, pointsPerAnswer) {
  // 2つのparameterをここで使える
}
```

:::practice
prompt: 受け取る値の数を数えます。
expectedAction: 2つと答える
estimatedMinutes: 1
:::
