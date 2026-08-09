---
id: javascript-ch04-l01-s03
title: lengthでArrayの件数を確かめる
kind: concept
concept: Arrayの件数
layout: comparison
teachesConceptIds: [array-length]
masteryTarget: read
screenBudget: { maxTextCharacters: 250, maxCodeLines: 5, maxVisuals: 0 }
assets: []
---

Array名の後ろへ`.length`を付けると、入っている要素の件数を数値で受け取れます。

```js
const questions = ['HTMLの役割は？', 'CSSの役割は？'];

console.log(questions.length);
// 2
```

`length`はArrayそのものを変更しません。今の件数を読み取ります。

:::practice
prompt: 2つの要素を持つquestions.lengthの結果を答えます。
expectedAction: 2と答える
estimatedMinutes: 1
:::
