---
id: javascript-ch03-l05-s01
title: 得点係ごとに値を覚える
kind: concept
concept: Closureの記憶
layout: explanation
teachesConceptIds: [closure-memory]
masteryTarget: read
screenBudget: { maxTextCharacters: 340, maxCodeLines: 0, maxVisuals: 0 }
assets: []
---

ゲームの得点係を作りましょう。呼ぶたびに10点を足し、1回目は10、2回目は20を返します。別の得点係は0点から始めたいので、係ごとに値を覚える場所が必要です。

関数（function）は、名前を付けて後から呼べる処理です。外側の関数で変数を用意し、それを使う内側の関数を返すと、外側の処理が終わってもその変数を使い続けられます。この仕組みをクロージャ（Closure）と呼びます。

:::practice
prompt: 同じ得点係に10点を2回足した値と、新しい得点係に1回だけ足した値を予想します。
expectedAction: 同じ係は20、新しい係は10と予想する
estimatedMinutes: 1
:::

次の完成例で、どこに値が残るか確かめます。
