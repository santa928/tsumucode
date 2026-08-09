---
id: javascript-ch01-l01-s03
title: console.logは上から順に表示する
kind: code
concept: Console出力
layout: code-preview
teachesConceptIds: [console-log]
masteryTarget: read
screenBudget: { maxTextCharacters: 280, maxCodeLines: 3, maxVisuals: 1 }
assets:
  - id: javascript-ch01-l01-console-flow
    source: assets/console-flow.svg
    mediaType: image
    alt: 3行のconsole.logが問題1、3、trueの順でConsoleへ届く図
    provenanceId: javascript-ch01-l01-console-flow-original
---

`console.log(値);`と書くと、丸括弧の中の値がConsoleへ表示されます。

```js
console.log('問題1');
console.log(3);
console.log(true);
```

実行結果も`問題1`、`3`、`true`の順です。1行目から順に実行されます。

![コードの順番とConsole出力](asset:javascript-ch01-l01-console-flow)

:::practice
prompt: 2行目だけを実行したときの表示を答えます。
expectedAction: 数値の3が表示されると答える
estimatedMinutes: 1
:::
