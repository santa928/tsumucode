---
id: javascript-ch02-l02-s04
title: 正解の条件へ直す
kind: concept
concept: ifとelseで表示を選ぶ
layout: code-preview
teachesConceptIds: [if-else-output]
masteryTarget: transform
screenBudget: { maxTextCharacters: 300, maxCodeLines: 6, maxVisuals: 1 }
assets:
  - id: javascript-ch02-l02-if-else-checkpoint
    source: assets/if-else-flow.svg
    mediaType: image
    alt: answerがAなら正解ですだけを表示する図
    provenanceId: javascript-ch02-l02-if-else-flow-original
---

演習では、ifの条件だけを「answerがAと同じ」へ直します。if、else、波括弧、表示文は残します。

```js
const answer = 'A';
if (answer === 'A') {
  console.log('正解です');
} else {
  console.log('不正解です');
}
```

Consoleには`正解です`だけが表示されます。

![正解の条件を選ぶ完成図](asset:javascript-ch02-l02-if-else-checkpoint)

:::practice
prompt: 変更する記号を確認します。
expectedAction: '!==を===へ置き換えると答える'
estimatedMinutes: 1
:::
