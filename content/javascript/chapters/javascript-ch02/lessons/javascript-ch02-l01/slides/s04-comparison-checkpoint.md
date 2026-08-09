---
id: javascript-ch02-l01-s04
title: 同じかを確かめる記号へ直す
kind: concept
concept: 比較結果をbooleanで確かめる
layout: code-preview
teachesConceptIds: [boolean-comparison]
masteryTarget: transform
screenBudget: { maxTextCharacters: 300, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: javascript-ch02-l01-comparison-checkpoint
    source: assets/comparison-flow.svg
    mediaType: image
    alt: 厳密等価の比較結果trueをConsoleで確認する図
    provenanceId: javascript-ch02-l01-comparison-flow-original
---

演習では、2行目の`!==`を`===`へ直します。それ以外の値と変数名は変えません。

```js
const answer = 'A';
const isCorrect =
  answer === 'A';
console.log(isCorrect);
```

比較式を残して、Consoleに`true`が表示されることを確認します。

![厳密等価の完成結果](asset:javascript-ch02-l01-comparison-checkpoint)

:::practice
prompt: 変更する場所を確認します。
expectedAction: 2行目の!==だけを===へ置き換えると答える
estimatedMinutes: 1
:::
