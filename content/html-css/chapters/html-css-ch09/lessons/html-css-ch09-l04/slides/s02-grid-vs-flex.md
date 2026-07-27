---
id: html-css-ch09-l04-s02
title: 外側はGrid、内側の横1列はFlexbox
kind: comparison
concept: grid-flex-selection
layout: code-preview
teachesConceptIds: [grid-flex-choice]
masteryTarget: read
screenBudget: { maxTextCharacters: 410, maxCodeLines: 8, maxVisuals: 1 }
assets:
  - id: grid-flex-role-map
    source: assets/grid-flex-composition.svg
    mediaType: image
    alt: 外側Galleryの2次元配置をGrid、Card内Actionの横1列をFlexboxが担当する図
    provenanceId: ch09-grid-flex-composition-original
---

Gallery全体のRowとColumnを揃える親にはGrid、Card内のActionを横1列にする親にはFlexboxを使います。1つの画面で組み合わせて構いません。

![外側Gridと内側Flexboxの役割分担](asset:grid-flex-role-map)

```css
[data-gallery] {
  display: grid;
}
[data-actions] {
  display: flex;
}
```

指定するElementを分けるのが要点です。`data-gallery`と`data-actions`を混同せず、それぞれの直接の子を確認します。

:::practice
prompt: 2列GalleryとCard内Button Rowへ、それぞれ使うLayoutを選びます。
expectedAction: GalleryへGrid、Button RowへFlexboxと答える
estimatedMinutes: 2
:::

次の実習ではFeatureの`grid-column`とActionの`display`だけを変更します。
