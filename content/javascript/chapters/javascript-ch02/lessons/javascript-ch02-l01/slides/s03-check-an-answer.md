---
id: javascript-ch02-l01-s03
title: 比較結果をConsoleで確かめる
kind: code
concept: booleanの比較結果
layout: code-preview
teachesConceptIds: [boolean-comparison]
masteryTarget: read
screenBudget: { maxTextCharacters: 300, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: javascript-ch02-l01-comparison-flow
    source: assets/comparison-flow.svg
    mediaType: image
    alt: AとAの比較がtrueになりConsoleへ届く図
    provenanceId: javascript-ch02-l01-comparison-flow-original
---

比較式を変数へ入れると、結果のbooleanへ名前を付けて使えます。

```js
const answer = 'A';
const isCorrect = answer === 'A';
console.log(isCorrect);
```

`answer`はAなので、Consoleには`true`が1件表示されます。

![比較結果がConsoleへ届く流れ](asset:javascript-ch02-l01-comparison-flow)

:::practice
prompt: answerがBなら表示がどう変わるか答えます。
expectedAction: falseへ変わると答える
estimatedMinutes: 1
:::
