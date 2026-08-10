---
id: javascript-ch06-l02-s02
title: Function declarationもexportできる
kind: code
concept: named function export
layout: comparison
teachesConceptIds: [named-function-export]
masteryTarget: read
screenBudget: { maxTextCharacters: 280, maxCodeLines: 5, maxVisuals: 1 }
assets: []
---

Function declarationの前へ`export`を書くと、Function名を別Moduleへ公開できます。

```js
export function scoreAnswer(isCorrect) {
  return isCorrect ? 10 : 0;
}
```

ここでは正解なら10、不正解なら0を返します。`scoreAnswer`がnamed exportの公開名です。

:::practice
prompt: 公開されるFunction名を答えます。
expectedAction: scoreAnswerと答える
estimatedMinutes: 1
:::
