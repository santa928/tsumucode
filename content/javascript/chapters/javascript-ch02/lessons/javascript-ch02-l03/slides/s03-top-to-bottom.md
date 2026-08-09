---
id: javascript-ch02-l03-s03
title: 最初にtrueになった道で止まる
kind: comparison
concept: 分岐の順番
layout: code-preview
teachesConceptIds: [branch-order, three-way-classification]
masteryTarget: read
screenBudget: { maxTextCharacters: 300, maxCodeLines: 7, maxVisuals: 1 }
assets:
  - id: javascript-ch02-l03-branch-order-flow
    source: assets/branch-flow.svg
    mediaType: image
    alt: A、B、その他の条件を上から順に確かめる図
    provenanceId: javascript-ch02-l03-branch-flow-original
---

条件は上から順に確かめ、最初に`true`になった道だけを実行します。どれも違うときは最後のelseへ進みます。

```js
if (answer === 'A') {
} else if (answer === 'B') {
} else {
}
```

![最初にtrueになった道だけを選ぶ流れ](asset:javascript-ch02-l03-branch-order-flow)

:::practice
prompt: answerがCのときの表示を答えます。
expectedAction: その他ですと答える
estimatedMinutes: 1
:::
