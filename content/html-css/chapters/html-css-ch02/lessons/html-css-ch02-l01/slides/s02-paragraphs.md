---
id: html-css-ch02-l01-s02
title: 1つの話題を1つのParagraphにまとめる
kind: comparison
concept: paragraph-structure
layout: code-preview
teachesConceptIds: [section-paragraph]
masteryTarget: read
screenBudget: { maxTextCharacters: 380, maxCodeLines: 8, maxVisuals: 1 }
assets:
  - id: preview-section-paragraph
    source: assets/heading-outline-preview.svg
    mediaType: image
    alt: 各h2の直後に説明のpが1つずつある2つのSection
    provenanceId: ch02-heading-outline-original
---

`p`は関係する文を1つのParagraphとして表します。見出しだけでは話題の名前しか伝わらないため、各sectionで`h2`の直後へ説明の`p`を置きます。

```html
<section>
  <h2>学んだこと</h2>
  <p>見出しは文章の階層を表します。</p>
</section>
```

![h2とpを組み合わせたSection](asset:preview-section-paragraph)

実習では2つのsectionそれぞれに、h2と同じ話題のpを1つ追加します。h1、section、h2の順番は変えません。

:::practice
prompt: h2「次に試すこと」の直後へ置く説明文を1つ考えます。
expectedAction: 同じ話題を説明する短い文をpにすると答える
estimatedMinutes: 2
:::

次の実習ではh3をh2へ直した後、各h2の直後へpを追加します。
