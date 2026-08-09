---
id: javascript-ch03-l05-s01
title: Functionが前回の値を覚える
kind: concept
concept: Closureの記憶
layout: explanation
teachesConceptIds: [closure-memory]
masteryTarget: read
screenBudget: { maxTextCharacters: 290, maxCodeLines: 0, maxVisuals: 0 }
assets: []
---

1回目に10、2回目に20と増えるFunctionには、前回までの値を覚える場所が必要です。

外側Functionで変数を用意し、その変数を使う内側Functionを返すと、内側Functionは外側の処理が終わった後も値を覚えます。この仕組みがClosureです。

:::practice
prompt: 10の次に10を加えた値を答えます。
expectedAction: 20と答える
estimatedMinutes: 1
:::
