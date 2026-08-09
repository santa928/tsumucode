---
id: javascript-ch01-l03-s04
title: 足し算を掛け算へ直す
kind: concept
concept: 得点の掛け算
layout: code-preview
teachesConceptIds: [score-calculation]
masteryTarget: transform
screenBudget: { maxTextCharacters: 300, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: javascript-ch01-l03-score-checkpoint
    source: assets/score-flow.svg
    mediaType: image
    alt: 問題数と1問の点数を掛けて30を作る完成手順の確認図
    provenanceId: javascript-ch01-l03-score-flow-original
---

演習の式は、問題数と1問の点数を足してしまっています。演算子1文字だけを直します。

```js
const questionCount = 3;
const pointPerQuestion = 10;
const totalScore = questionCount * pointPerQuestion;
console.log(totalScore);
```

数値や変数名は変更しません。`+`を`*`へ置き換え、結果が`30`になることを確認します。

![問題数と点数から合計を作る流れ](asset:javascript-ch01-l03-score-checkpoint)

:::practice
prompt: 変更する記号と期待する結果を答えます。
expectedAction: +を*へ変え、30を確認すると答える
estimatedMinutes: 1
:::
