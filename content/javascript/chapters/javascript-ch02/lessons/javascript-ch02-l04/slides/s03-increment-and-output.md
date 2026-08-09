---
id: javascript-ch02-l04-s03
title: number++で1ずつ進める
kind: code
concept: インクリメント
layout: code-preview
teachesConceptIds: [increment-operator, problem-number-loop]
masteryTarget: read
screenBudget: { maxTextCharacters: 300, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: javascript-ch02-l04-increment-flow
    source: assets/loop-flow.svg
    mediaType: image
    alt: numberが1ずつ増えて問題3まで表示される図
    provenanceId: javascript-ch02-l04-loop-flow-original
---

`number++`は、処理が1回終わるたびにnumberへ1を加える更新です。

```js
console.log('問題' + number);
number++;
```

文字列の`'問題'`へnumberを`+`でつなぎ、問題1、問題2、問題3の順に表示します。

![numberを1ずつ増やす流れ](asset:javascript-ch02-l04-increment-flow)

:::practice
prompt: 2回目の処理で表示される文字を答えます。
expectedAction: 問題2と答える
estimatedMinutes: 1
:::
