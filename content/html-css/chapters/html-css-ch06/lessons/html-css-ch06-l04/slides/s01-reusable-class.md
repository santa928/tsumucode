---
id: html-css-ch06-l04-s01
title: Base Classで共通Styleを再利用する
kind: concept
concept: reusable-base-class
layout: code-preview
teachesConceptIds: [reusable-base-class]
masteryTarget: read
screenBudget: { maxTextCharacters: 400, maxCodeLines: 5, maxVisuals: 1 }
assets:
  - id: base-class-reuse
    source: assets/base-modifier-classes.svg
    mediaType: image
    alt: 1つのcard Base Classが2枚のCardへ共通Styleを届ける図
    provenanceId: ch06-base-modifier-classes-original
---

Base Classは、複数の部品へ共通する見た目を1つのRuleへ集めます。実習では`.card`のPadding、背景、Borderが完成済みです。

![Base Classの再利用](asset:base-class-reuse)

HTMLで両方の`article`へ`card` Classを付けると、同じStyleが2枚へ届きます。

```html
<article data-card class="card">HTML</article>
<article data-card class="card">CSS</article>
```

:::practice
prompt: 2枚へ共通のPaddingと背景を届けるClassを答えます。
expectedAction: cardというBase Classを両方へ付ける
estimatedMinutes: 2
:::

次は、2枚目だけの差を追加Classで重ねます。
