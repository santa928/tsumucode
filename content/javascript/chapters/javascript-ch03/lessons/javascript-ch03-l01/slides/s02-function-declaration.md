---
id: javascript-ch03-l01-s02
title: functionで処理を宣言する
kind: concept
concept: Function宣言
layout: comparison
teachesConceptIds: [function-declaration]
masteryTarget: read
screenBudget: { maxTextCharacters: 260, maxCodeLines: 3, maxVisuals: 0 }
assets: []
---

`function`の後ろにFunction名と丸括弧を書き、波括弧の内側へ実行したい処理を置きます。このまとまりがFunction宣言です。

```js
function showQuestion() {
  console.log('問題1: 2 + 3 は？');
}
```

宣言しただけでは、波括弧の中はまだ実行されません。

:::practice
prompt: Function名を見つけます。
expectedAction: showQuestionと答える
estimatedMinutes: 1
:::
