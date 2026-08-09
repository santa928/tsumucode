---
id: javascript-ch02-l03-s04
title: Bの条件だけを直す
kind: concept
concept: 3通りの表示を選ぶ
layout: code-preview
teachesConceptIds: [three-way-classification]
masteryTarget: transform
screenBudget: { maxTextCharacters: 300, maxCodeLines: 5, maxVisuals: 1 }
assets:
  - id: javascript-ch02-l03-three-way-checkpoint
    source: assets/branch-flow.svg
    mediaType: image
    alt: 回答BがBですの道へ進む完成図
    provenanceId: javascript-ch02-l03-branch-flow-original
---

演習では、2つ目の比較にある文字列だけを`'B'`へ直します。if、else if、elseの形は残します。

```js
else if (
  answer === 'B'
) {
  console.log('Bです');
}
```

![回答Bを3通りへ分類する完成図](asset:javascript-ch02-l03-three-way-checkpoint)

:::practice
prompt: 変更する場所を確認します。
expectedAction: else ifの比較にある2つ目のAだけをBへ直すと答える
estimatedMinutes: 1
:::
