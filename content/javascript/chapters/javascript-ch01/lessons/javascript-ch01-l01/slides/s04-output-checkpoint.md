---
id: javascript-ch01-l01-s04
title: 3種類の値を順番どおりに書く
kind: concept
concept: 値をConsoleで確かめる
layout: code-preview
teachesConceptIds: [console-log-values]
masteryTarget: transform
screenBudget: { maxTextCharacters: 300, maxCodeLines: 3, maxVisuals: 1 }
assets:
  - id: javascript-ch01-l01-console-checkpoint
    source: assets/console-flow.svg
    mediaType: image
    alt: 3つの値がコードの順番どおりConsoleへ表示される確認図
    provenanceId: javascript-ch01-l01-console-flow-original
---

演習では3行の`console.log`が用意されています。丸括弧の中だけを次の完成形へ直します。

```js
console.log('問題1');
console.log(3);
console.log(true);
```

文字列だけは引用符で囲みます。数値と真偽値には引用符を付けません。

![完成コードとConsoleの順番](asset:javascript-ch01-l01-console-checkpoint)

:::practice
prompt: 変更する場所と、残す記号を確認します。
expectedAction: 丸括弧の中だけを変え、console.logとセミコロンは残すと答える
estimatedMinutes: 1
:::
