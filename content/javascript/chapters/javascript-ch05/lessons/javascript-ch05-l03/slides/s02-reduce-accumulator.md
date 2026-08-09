---
id: javascript-ch05-l03-s02
title: accumulatorが途中結果を受け取る
kind: code
concept: reduceのaccumulator
layout: comparison
teachesConceptIds: [reduce-accumulator]
masteryTarget: read
screenBudget: { maxTextCharacters: 290, maxCodeLines: 5, maxVisuals: 0 }
assets: []
---

callbackの1つ目のparameterは途中結果、2つ目は現在の要素です。途中結果をaccumulatorと呼びます。

```js
const total = questions.reduce((sum, question) => {
  return sum + question.points;
}, 0);
```

返した値が、次の処理の`sum`へ引き継がれます。

:::practice
prompt: sumへ入る値を答えます。
expectedAction: それまでのpoint合計と答える
estimatedMinutes: 1
:::
