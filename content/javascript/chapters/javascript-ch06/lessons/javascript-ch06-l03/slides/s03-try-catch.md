---
id: javascript-ch06-l03-s03
title: tryで試しcatchでErrorを受け止める
kind: code
concept: try catch
layout: comparison
teachesConceptIds: [try-catch]
masteryTarget: read
screenBudget: { maxTextCharacters: 300, maxCodeLines: 7, maxVisuals: 1 }
assets: []
---

Errorが起きる可能性のある呼び出しを`try`へ置き、`catch`でErrorを受け止めます。

```js
try {
  console.log(readQuestion({ text: '' }));
} catch (error) {
  console.log(error.message);
}
```

`error.message`には`new Error()`へ渡した理由が入ります。Errorを受け止めるため、実行全体は止まりません。

:::practice
prompt: Errorを受け止めるblockを答えます。
expectedAction: catchと答える
estimatedMinutes: 1
:::
