---
id: typescript-ch01-l01-s04
title: 型と変数の表示を確かめる
kind: checklist
concept: 型の確認と動作の確認
layout: checkpoint
teachesConceptIds: [typescript-number-inference]
masteryTarget: transform
screenBudget: { maxTextCharacters: 300, maxCodeLines: 3, maxVisuals: 0 }
assets: []
---

演習では、文字列を入れている行を数値へ直します。型を書く必要はありません。

```ts
let score = 0;
score = 2;
console.log(score);
```

「プレビューを更新」で型の案内が消え、Consoleに2が出ることを確認します。その後「判定する」で今回の条件を確かめます。`console.log(score)`で変数を表示しましょう。`console.log(2)`だけでは、変数を数値のまま使えたかを確認できません。

:::practice
prompt: 表示された2のほかに、コードのどこを確認しますか。
expectedAction: 型を書き足さずlet scoreを数値から推論させ、最後にscoreを表示していることを確認する
estimatedMinutes: 1
:::
