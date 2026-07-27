---
id: html-css-ch01-l01-s01
title: Elementは開始Tag、内容、終了Tagでできる
kind: diagram
concept: html-element
layout: code-preview
teachesConceptIds: [html-element, opening-closing-tag]
masteryTarget: read
screenBudget: { maxTextCharacters: 350, maxCodeLines: 1, maxVisuals: 1 }
assets:
  - id: diagram-element-anatomy
    source: assets/element-anatomy.svg
    mediaType: image
    alt: 開始Tag、内容、終了TagからElementができる図
    provenanceId: ch01-element-anatomy-original
---

HTMLでは、開始Tagと終了Tagで内容を挟んだ全体をElementと呼びます。下の例では左側が開始Tag、右側が終了Tagです。終了側だけにslash `/`が付き、開始と終了の名前は同じにします。

```html
<p>今日からHTMLを学びます。</p>
```

![Elementを組み立てる3つの部分](asset:diagram-element-anatomy)

:::practice
prompt: 図とコードで、開始Tag、内容、終了Tagを左から順に指します。
expectedAction: 3部分を区別し、全体をElementと呼ぶ
estimatedMinutes: 2
:::

次は、題名と文章に合うElementを選びます。
