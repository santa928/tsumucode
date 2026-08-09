---
id: javascript-ch04-l03-s03
title: 反復変数が現在の要素を受け取る
kind: concept
concept: for...ofの反復変数
layout: comparison
teachesConceptIds: [for-of-item]
masteryTarget: read
screenBudget: { maxTextCharacters: 260, maxCodeLines: 4, maxVisuals: 0 }
assets: []
---

反復変数`question`の値は、Loopするたびに現在の要素へ変わります。

```js
1回目: question → 'HTMLの役割は？'
2回目: question → 'CSSの役割は？'
3回目: question → 'JavaScriptの役割は？'
```

Arrayの順番がそのまま実行順になります。反復変数は波括弧の内側で使います。

:::practice
prompt: 2回目のLoopでquestionが受け取る値を答えます。
expectedAction: CSSの役割は？と答える
estimatedMinutes: 1
:::
