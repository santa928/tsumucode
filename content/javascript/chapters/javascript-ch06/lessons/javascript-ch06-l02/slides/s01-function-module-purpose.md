---
id: javascript-ch06-l02-s01
title: 採点の計算を専用Moduleへ移す
kind: concept
concept: Function Moduleの役割
layout: explanation
teachesConceptIds: [function-module-purpose]
masteryTarget: read
screenBudget: { maxTextCharacters: 300, maxCodeLines: 0, maxVisuals: 0 }
assets: []
---

問題データだけでなく、採点のように名前を付けた処理も別Moduleへ分けられます。

今回は`scoreAnswer` Functionを`score.js`へ置き、`main.js`は「採点する」と「結果を表示する」役割に絞ります。

Functionを共有しても、呼び出しの丸括弧やargumentの書き方は変わりません。

:::practice
prompt: 採点Functionを置くFileを答えます。
expectedAction: score.jsと答える
estimatedMinutes: 1
:::
