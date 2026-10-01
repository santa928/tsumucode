---
id: typescript-ch01-l02-s03
title: 今回は型の約束を書く練習
kind: concept
concept: 型推論と今回の目標
layout: comparison
teachesConceptIds: [typescript-number-annotation]
masteryTarget: read
screenBudget: { maxTextCharacters: 300, maxCodeLines: 2, maxVisuals: 0 }
assets: []
---

前のLessonでは、最初の値から型が分かる型推論を学びました。全ての変数に型注釈を書く必要はありません。

```ts
let score = 0;
score = 2;
```

このコードも型の確認を通ります。ただし今回は、数値を受け取る約束を自分で書く練習です。`: number`を残します。`any`は型の確認を弱める型なので、今回の約束の代わりにはしません。

:::practice
prompt: 型の確認を通れば、今回の型注釈の練習も終わったといえますか。
expectedAction: いえない。今回はnumberの型注釈も必要と答える
estimatedMinutes: 1
:::
