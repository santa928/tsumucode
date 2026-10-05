---
id: typescript-ch01-l03-s04
title: 型と動作を順に確認する
kind: checklist
concept: 型と動作を順に確認する
layout: checkpoint
teachesConceptIds:
  - typescript-type-erasure
masteryTarget: transform
screenBudget:
  maxTextCharacters: 300
  maxCodeLines: 2
  maxVisuals: 0
assets: []
---

演習では、表示の途中に置いた練習用のthrowの行を除きます。throwは失敗を知らせるためにも使うので、一般に消すべき構文ではありません。

```ts
let score: number = 2;
console.log(score);
```

「プレビューを更新」で型の案内と実行の診断を確認し、Consoleに2が1回出たら「判定する」を押します。今回は表示の動作を判定し、型注釈の有無は採点しません。

:::practice
prompt: 型の確認と実行の観察は、どう違いますか。
expectedAction: 型が合うかは実行前、実行が止まらず期待の値を出すかは動作で確認すると答える
estimatedMinutes: 1
:::
