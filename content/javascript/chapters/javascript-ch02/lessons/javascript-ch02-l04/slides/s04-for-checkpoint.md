---
id: javascript-ch02-l04-s04
title: 3を含む条件へ直す
kind: concept
concept: 問題番号を3回表示する
layout: code-preview
teachesConceptIds: [problem-number-loop]
masteryTarget: transform
screenBudget: { maxTextCharacters: 300, maxCodeLines: 3, maxVisuals: 1 }
assets:
  - id: javascript-ch02-l04-loop-checkpoint
    source: assets/loop-flow.svg
    mediaType: image
    alt: 問題1から問題3まで表示して停止する完成図
    provenanceId: javascript-ch02-l04-loop-flow-original
---

演習では、小なり記号へイコールを加えて「3以下」の条件へ直します。numberが3の回も実行されるようになります。

```js
// forの条件
number <= 3;
```

初期化の1、更新の`number++`、表示する行は変えません。

![3を含む条件の完成結果](asset:javascript-ch02-l04-loop-checkpoint)

:::practice
prompt: 変更する場所と最後の表示を確認します。
expectedAction: 小なり記号へイコールを加えると問題3まで表示されると答える
estimatedMinutes: 1
:::
