---
id: typescript-ch01-l01-s03
title: 数値のまま更新する
kind: comparison
concept: 数値の型を保つ更新
layout: code-preview
teachesConceptIds: [typescript-number-inference]
masteryTarget: transform
screenBudget: { maxTextCharacters: 300, maxCodeLines: 3, maxVisuals: 1 }
assets:
  - id: typescript-ch01-l01-number-update
    source: assets/number-update.svg
    mediaType: image
    alt: scoreは数値1からnumberと推論され、1を足した数値2をConsoleに表示する。
    provenanceId: typescript-ch01-l01-number-update-original
---

数値を入れ直したり、数値で計算したりすると、`score`の型を保てます。

```ts
let score = 1;
score += 1;
console.log(score);
```

1に1を足すので表示は2です。今回は`let`で宣言し、型を書き足さず最初の数値から推論させます。型を自分で書く方法は次のLessonで学びます。`const`も有効な宣言ですが、値を更新する今回の練習では使いません。

![数値のまま更新する](asset:typescript-ch01-l01-number-update)

:::practice
prompt: 最初の値が0でなく1でも、scoreの型は数値になりますか。
expectedAction: 1も数値なのでnumberと推論されると答える
estimatedMinutes: 1
:::
