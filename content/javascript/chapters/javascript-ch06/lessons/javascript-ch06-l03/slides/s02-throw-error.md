---
id: javascript-ch06-l03-s02
title: throw new Errorで通常処理を止める
kind: code
concept: Errorをthrowする
layout: comparison
teachesConceptIds: [throw-error]
masteryTarget: read
screenBudget: { maxTextCharacters: 290, maxCodeLines: 6, maxVisuals: 1 }
assets: []
---

`throw`はErrorを発生させ、そのFunctionの通常処理を止めます。`new Error()`の丸括弧へ理由を書きます。

```js
function readQuestion(question) {
  if (question.text === '') {
    throw new Error('問題文がありません');
  }
  return question.text;
}
```

空でない場合だけ、最後の`return`まで進みます。

:::practice
prompt: 通常処理を止めてErrorを渡すkeywordを答えます。
expectedAction: throwと答える
estimatedMinutes: 1
:::
