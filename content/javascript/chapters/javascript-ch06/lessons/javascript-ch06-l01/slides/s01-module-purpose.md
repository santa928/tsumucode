---
id: javascript-ch06-l01-s01
title: 役割ごとにJavaScriptのFileを分ける
kind: concept
concept: Moduleの役割
layout: explanation
teachesConceptIds: [module-purpose]
masteryTarget: read
screenBudget: { maxTextCharacters: 300, maxCodeLines: 0, maxVisuals: 0 }
assets: []
---

問題データと表示処理を1つのFileへ増やし続けると、探す範囲が広がります。

JavaScriptでは、役割ごとに分けたFileをModuleとして扱えます。今回は問題Arrayを`questions.js`、表示処理を`main.js`へ分けます。

Module間で使う名前だけを`export`と`import`で共有します。

:::practice
prompt: 問題データを置くFileを答えます。
expectedAction: questions.jsと答える
estimatedMinutes: 1
:::
