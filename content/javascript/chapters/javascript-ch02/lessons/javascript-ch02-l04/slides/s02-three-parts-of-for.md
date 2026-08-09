---
id: javascript-ch02-l04-s02
title: forの3つの準備を読む
kind: comparison
concept: for文
layout: code-preview
teachesConceptIds: [for-statement]
masteryTarget: read
screenBudget: { maxTextCharacters: 300, maxCodeLines: 3, maxVisuals: 1 }
assets:
  - id: javascript-ch02-l04-for-parts-flow
    source: assets/loop-flow.svg
    mediaType: image
    alt: forが問題1、問題2、問題3を表示して止まる図
    provenanceId: javascript-ch02-l04-loop-flow-original
---

forの丸括弧には、開始前の「初期化」、続ける「条件」、1回ごとの「更新」をセミコロンで区切って書きます。

```js
let number = 1;
number <= 3;
number++;
```

この3つを`for`の丸括弧へ順番に入れます。コードの中央は、numberが3以下の間だけ続ける条件です。

![forが3回繰り返す流れ](asset:javascript-ch02-l04-for-parts-flow)

:::practice
prompt: 最初のnumberの値を答えます。
expectedAction: 初期化にある1と答える
estimatedMinutes: 1
:::
