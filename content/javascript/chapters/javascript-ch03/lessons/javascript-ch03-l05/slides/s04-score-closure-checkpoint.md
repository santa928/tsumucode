---
id: javascript-ch03-l05-s04
title: 値を置く場所を守って試す
kind: concept
concept: 得点を覚えるClosure
layout: code-preview
teachesConceptIds: [score-closure]
masteryTarget: transform
screenBudget: { maxTextCharacters: 350, maxCodeLines: 1, maxVisuals: 1 }
assets:
  - id: javascript-ch03-l05-closure-flow
    source: assets/closure-memory-flow.svg
    mediaType: image
    alt: 1つのClosureを2回呼び出し、scoreが0から10、20へ増える流れ
    provenanceId: javascript-ch03-l05-closure-memory-flow-original
codeReferenceSlideId: javascript-ch03-l05-s02
---

演習では内側の関数のscore += 0;をscore += 10;へ直し、同じ関数を2回呼びます。完成例の定義は上の折り畳みで確認できます。

```js {"label":"変更する1行（定義の中）", "role":"input", "resultAssetId":"javascript-ch03-l05-closure-flow", "highlightedLines":[1]}
score += 10;
```

![Closureがscoreを0から10、20へ進める流れ](asset:javascript-ch03-l05-closure-flow)

score = 0を内側へ移すと、呼ぶたびに0へ戻って10、10になります。外側のさらに外へ出すと、別々の得点係が値を共有してしまいます。変数を置く場所にも意味があります。

:::practice
prompt: まず演習で10、20を確認します。次に10を5へ変えた場合の2回の結果を予想してから、実行結果を比べます。
expectedAction: 5、10になる理由を説明する。指定課題の採点を受ける前は10へ戻す
estimatedMinutes: 2
:::
