---
id: javascript-ch01-l04-s03
title: +=で加えて入れ直す
kind: code
concept: 加算代入
layout: code-preview
teachesConceptIds: [addition-assignment]
masteryTarget: read
screenBudget: { maxTextCharacters: 300, maxCodeLines: 3, maxVisuals: 1 }
assets:
  - id: javascript-ch01-l04-update-flow
    source: assets/update-flow.svg
    mediaType: image
    alt: scoreの10へ5を加え、同じscoreへ15を入れ直す図
    provenanceId: javascript-ch01-l04-update-flow-original
---

`+=`は、現在の値へ右側の値を加え、その結果を同じ変数へ入れ直します。

```js
let score = 10;
score += 5;
console.log(score); // 15
```

`score = score + 5`と同じ更新を、短く読みやすく書けます。

![現在の得点へ加えて入れ直す流れ](asset:javascript-ch01-l04-update-flow)

:::practice
prompt: score += 5を言葉で読みます。
expectedAction: scoreへ5を加えてscoreへ入れ直すと答える
estimatedMinutes: 1
:::
