---
id: typescript-ch01-l02-s01
title: 変数に受け取る型を書く
kind: concept
concept: numberの型注釈
layout: code-preview
teachesConceptIds: [typescript-number-annotation]
masteryTarget: read
screenBudget: { maxTextCharacters: 300, maxCodeLines: 3, maxVisuals: 1 }
assets:
  - id: typescript-ch01-l02-annotated-score
    source: assets/annotated-score.svg
    mediaType: image
    alt: numberは受け取る型の約束。scoreの数値を0から2へ変え、Consoleに2を表示する。
    provenanceId: typescript-ch01-l02-annotated-score-original
---

変数名の後ろに型を書くことを型注釈といいます。`number`は数値の型です。

```ts
let score: number = 0;
score = 2;
console.log(score);
```

`score`が変数名、`: number`が受け取る型、`= 0`が最初の値です。後から入れる2も数値なので、この約束に合います。

![型注釈と今の値を分ける](asset:typescript-ch01-l02-annotated-score)

:::practice
prompt: 型を表す部分と、最初の値を表す部分はどこですか。
expectedAction: 型はnumber、最初の値は0と答える
estimatedMinutes: 1
:::
