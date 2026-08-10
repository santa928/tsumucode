---
id: javascript-ch06-l03-s04
title: 空問題のError messageを完成させる
kind: concept
concept: 問題文Error
layout: code-preview
teachesConceptIds: [question-text-error]
masteryTarget: transform
screenBudget: { maxTextCharacters: 300, maxCodeLines: 6, maxVisuals: 1 }
assets:
  - id: javascript-ch06-l03-error-flow
    source: assets/error-flow.svg
    mediaType: image
    alt: 空の問題文を検出してErrorをthrowし、catchで受け止めてmessageを表示する流れ
    provenanceId: javascript-ch06-l03-error-flow-original
---

演習では`throw new Error()`のmessageだけを`問題文がありません`へ置き換えます。`if`、`throw`、`try/catch`は完成しています。

```js
if (question.text === '') {
  throw new Error('問題文がありません');
}
```

![空問題をErrorとして受け止める流れ](asset:javascript-ch06-l03-error-flow)

Consoleへ`問題文がありません`と表示されたら完成です。

:::practice
prompt: 置き換えるmessageをそのまま答えます。
expectedAction: 問題文がありませんと答える
estimatedMinutes: 1
:::
