---
id: javascript-ch05-l01-s02
title: callbackが1要素ずつ受け取る
kind: code
concept: mapのcallback
layout: comparison
teachesConceptIds: [map-callback]
masteryTarget: read
screenBudget: { maxTextCharacters: 260, maxCodeLines: 5, maxVisuals: 0 }
assets: []
---

`map`の丸括弧へ渡すFunctionをcallbackと呼びます。callbackのparameterには、現在の要素が先頭から順に入ります。

```js
const labels = questions.map((question) => {
  return `問題: ${question}`;
});
```

ここでは`question`を受け取り、`return`で変換後の文字列を返します。

:::practice
prompt: callbackのquestionへ入る値を答えます。
expectedAction: 現在処理している問題文と答える
estimatedMinutes: 1
:::
