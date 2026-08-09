---
id: javascript-ch01-l04-s04
title: 加える点数だけを直す
kind: concept
concept: letの得点更新
layout: code-preview
teachesConceptIds: [let-score-update]
masteryTarget: transform
screenBudget: { maxTextCharacters: 300, maxCodeLines: 3, maxVisuals: 1 }
assets:
  - id: javascript-ch01-l04-update-checkpoint
    source: assets/update-flow.svg
    mediaType: image
    alt: scoreへ5を加えて15へ更新する完成手順の確認図
    provenanceId: javascript-ch01-l04-update-flow-original
---

演習では`let score = 10`と`score += 0`が用意されています。加える数値だけを直します。

```js
let score = 10;
score += 5;
console.log(score);
```

`let`と`+=`は残し、`0`を`5`へ置き換えます。Consoleで`15`を確認します。

![得点を更新してConsoleへ表示する流れ](asset:javascript-ch01-l04-update-checkpoint)

:::practice
prompt: 変更する値と、残す構文を答えます。
expectedAction: 0を5へ変え、letと+=は残すと答える
estimatedMinutes: 1
:::
