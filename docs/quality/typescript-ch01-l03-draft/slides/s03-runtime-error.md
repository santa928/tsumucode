---
id: typescript-ch01-l03-s03
title: 型が通っても実行は止まり得る
kind: concept
concept: 型が通っても実行は止まり得る
layout: comparison
teachesConceptIds:
  - typescript-type-erasure
masteryTarget: read
screenBudget:
  maxTextCharacters: 300
  maxCodeLines: 3
  maxVisuals: 0
assets: []
---

`throw`は例外を投げ、通常の処理を中断します。`new Error`は失敗の内容を持つオブジェクトを作ります。JavaScriptで学んだ処理です。

```ts
let score: number = 2;
throw new Error('表示の途中で止まりました');
console.log(score);
```

型は合っていますが、型消去後もthrowは残り、表示へ到達しません。画面には実行中のエラーという共通案内が出ます。Errorへ書いた文がそのまま出るとは限りません。

:::practice
prompt: 型注釈を増やせば、表示へ進めますか。
expectedAction: 型注釈を変えてもthrowの処理は残ると答える
estimatedMinutes: 1
:::
