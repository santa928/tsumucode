---
id: javascript-ch02-l02-s02
title: ifはtrueのときに実行する
kind: code
concept: if文
layout: code-preview
teachesConceptIds: [if-statement]
masteryTarget: read
screenBudget: { maxTextCharacters: 280, maxCodeLines: 3, maxVisuals: 1 }
assets:
  - id: javascript-ch02-l02-if-flow
    source: assets/if-only-flow.svg
    mediaType: image
    alt: trueなら正解ですを表示し、falseなら表示しないifの図
    provenanceId: javascript-ch02-l02-if-only-flow-original
---

ifは、丸括弧の条件が`true`のときだけ波括弧の中を実行します。

```js
if (answer === 'A') {
  console.log('正解です');
}
```

条件が`false`なら、この`console.log`は実行されません。

![ifがtrueの道を選ぶ流れ](asset:javascript-ch02-l02-if-flow)

:::practice
prompt: answerがAのときに表示される言葉を答えます。
expectedAction: 正解ですと答える
estimatedMinutes: 1
:::
