---
id: html-css-ch02-l04-s01
title: strongは見逃せない重要事項を表す
kind: concept
concept: strong-importance
layout: code-preview
teachesConceptIds: [strong-element]
masteryTarget: read
screenBudget: { maxTextCharacters: 380, maxCodeLines: 1, maxVisuals: 1 }
assets:
  - id: preview-strong-meaning
    source: assets/inline-meaning-preview.svg
    mediaType: image
    alt: 保存してからが重要事項、HTMLが発声上の強調として表示された比較
    provenanceId: ch02-inline-meaning-original
---

`strong`は、文の中で重要性、深刻さ、緊急性が高い部分を表します。たとえば「保存前にTabを閉じない」のように、読み飛ばすと困る注意へ使えます。

Browserの既定表示では太字になることが多いものの、太字にしたいだけならCSSを使います。strongを選ぶ根拠は見た目ではなく、その言葉が文脈上重要かどうかです。

```html
<p><strong>保存してから</strong>Previewを更新してください。</p>
```

![strongとemの意味の比較](asset:preview-strong-meaning)

:::practice
prompt: 操作案内の中で、見逃すと作業を失う部分を探します。
expectedAction: 文脈上の重要事項だけをstrongの候補として選ぶ
estimatedMinutes: 2
:::

実習では「保存してから」を包むspanのTag名だけをstrongへ変えます。次はemとの違いです。
