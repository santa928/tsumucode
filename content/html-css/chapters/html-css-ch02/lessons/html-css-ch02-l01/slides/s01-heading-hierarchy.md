---
id: html-css-ch02-l01-s01
title: 見出しLevelで文書の階層を示す
kind: concept
concept: heading-hierarchy
layout: code-preview
teachesConceptIds: [heading-hierarchy, h2]
masteryTarget: read
screenBudget: { maxTextCharacters: 390, maxCodeLines: 9, maxVisuals: 1 }
assets:
  - id: preview-heading-outline
    source: assets/heading-outline-preview.svg
    mediaType: image
    alt: 1つのh1の下に同じLevelのh2が2つ並ぶ文書Outline
    provenanceId: ch02-heading-outline-original
---

Headingは文章の骨組みです。ページ全体の題名を`h1`、その下にある同格の話題を`h2`で表します。文字を小さくする目的でLevelを選ぶのではありません。

```html
<h1>わたしの学習記録</h1>
<section>
  <h2>学んだこと</h2>
</section>
<section>
  <h2>次に試すこと</h2>
</section>
```

![h1とh2のOutline](asset:preview-heading-outline)

完成例では2つのh2が、どちらもh1の題名に属します。実習では用意された2組の`h3`を、開始Tagと終了Tagとも`h2`へ直します。

:::practice
prompt: 「料理ノート」「材料」「作り方」をh1とh2へ分類します。
expectedAction: ページ題名をh1、同格な2話題をh2と説明する
estimatedMinutes: 2
:::

次は各h2の直後へ、その話題を説明するpを置きます。
