---
id: html-css-ch06-l04-s02
title: Modifier Classで1枚だけ差を加える
kind: comparison
concept: component-boundary
layout: code-preview
teachesConceptIds: [modifier-class]
masteryTarget: read
screenBudget: { maxTextCharacters: 410, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: modifier-class-composition
    source: assets/base-modifier-classes.svg
    mediaType: image
    alt: 2枚目のCardへcardとcard--featuredを重ねるClass構成図
    provenanceId: ch06-base-modifier-classes-original
---

Modifier Classは、Base Styleを残したまま一部だけ変えます。Class属性には空白で区切って複数のClassを書けます。

![Base ClassとModifier Classの合成](asset:modifier-class-composition)

実習では1枚目を`class="card"`、2枚目を`class="card card--featured"`へ変更します。完成済みのModifierが2枚目へ左Borderを加えます。

```html
<article data-card class="card">…</article>
<article data-card class="card card--featured">…</article>
```

:::practice
prompt: 共通Styleと2枚目だけの差を両立するClass属性を答えます。
expectedAction: card card--featuredと2つのClassを並べる
estimatedMinutes: 2
:::

次の実習では、2つのClass属性だけを編集してStyleを合成します。
