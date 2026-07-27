---
id: html-css-ch02-l04-s02
title: emは発声上の強調で文の意味を際立たせる
kind: comparison
concept: inline-emphasis
layout: code-preview
teachesConceptIds: [em-element]
masteryTarget: read
screenBudget: { maxTextCharacters: 390, maxCodeLines: 1, maxVisuals: 1 }
assets:
  - id: preview-em-meaning
    source: assets/inline-meaning-preview.svg
    mediaType: image
    alt: strongの重要事項とemの発声上の強調を並べた文章Preview
    provenanceId: ch02-inline-meaning-original
---

`em`は、声に出すときに強く読む部分を表します。「今日はHTMLを学ぶ」のどの語を強調するかで、日や対象を対比できます。

```html
<p>今日は<em>HTML</em>を学びます。</p>
```

strongは重要性、emは発声上の強調です。どちらも文の流れの中に置くInline Elementなので、新しい段落を作らず一部へ意味を加えます。

![strongとemを使い分けた文章](asset:preview-em-meaning)

:::practice
prompt: 「CSSではなくHTMLを学ぶ」と伝えるとき、どの語をemで包むか選びます。
expectedAction: 対比したいHTMLを選び、strongとの目的の違いを説明する
estimatedMinutes: 2
:::

次の実習ではclassと文字を残し、1つ目のspanをstrong、HTMLを包む2つ目のspanをemへ変えます。
