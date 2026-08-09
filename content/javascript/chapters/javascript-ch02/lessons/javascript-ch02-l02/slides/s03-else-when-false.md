---
id: javascript-ch02-l02-s03
title: elseはfalseのときに実行する
kind: comparison
concept: elseの道
layout: code-preview
teachesConceptIds: [else-branch, if-else-output]
masteryTarget: read
screenBudget: { maxTextCharacters: 300, maxCodeLines: 5, maxVisuals: 1 }
assets:
  - id: javascript-ch02-l02-else-flow
    source: assets/if-else-flow.svg
    mediaType: image
    alt: 条件がfalseなら不正解ですへ進むelseの図
    provenanceId: javascript-ch02-l02-if-else-flow-original
---

`else`は、直前の`if`の条件が`false`だったときだけ実行します。

```js
if (answer === 'A') {
  console.log('正解です');
} else {
  console.log('不正解です');
}
```

ifとelseの表示が同時に出ることはありません。

![ifとelseの2つの道](asset:javascript-ch02-l02-else-flow)

:::practice
prompt: answerがBのときに実行される側を答えます。
expectedAction: else側だけと答える
estimatedMinutes: 1
:::
