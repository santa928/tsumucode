---
id: javascript-ch06-l04-s04
title: 問題数を直して30点へそろえる
kind: concept
concept: 点数計算のDebug
layout: code-preview
teachesConceptIds: [score-calculation-debug]
masteryTarget: transform
screenBudget: { maxTextCharacters: 300, maxCodeLines: 6, maxVisuals: 1 }
assets:
  - id: javascript-ch06-l04-debug-flow
    source: assets/debug-flow.svg
    mediaType: image
    alt: 期待値30と実際値20を比べ、script.js 1行目のquestionCountを2から3へ直す流れ
    provenanceId: javascript-ch06-l04-debug-flow-original
---

演習では`script.js`の1行目だけを`const questionCount = 3;`へ直します。ほかの行は変更しません。

```js
const questionCount = 3;
const pointsPerQuestion = 10;
const totalScore = questionCount * pointsPerQuestion;
```

![期待値と実際値から原因箇所を絞る流れ](asset:javascript-ch06-l04-debug-flow)

Consoleの期待値と実際値が両方30なら完成です。

:::practice
prompt: 変更前と変更後の問題数を答えます。
expectedAction: 2から3へ変更すると答える
estimatedMinutes: 1
:::
