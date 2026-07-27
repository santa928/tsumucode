---
id: html-css-ch04-l04-s02
title: Computed ValueはBrowserが最終的に使う値
kind: concept
concept: computed-values
layout: code-preview
teachesConceptIds: [computed-value]
masteryTarget: read
screenBudget: { maxTextCharacters: 410, maxCodeLines: 1, maxVisuals: 1 }
assets:
  - id: computed-unit
    source: assets/unit-computation.svg
    mediaType: image
    alt: Sourceの2remをBrowserがComputed 32pxへ変換する図
    provenanceId: ch04-unit-computation-original
---

Sourceへ`2rem`と書くと、BrowserはRoot Font Sizeを解決し、Layoutに使うComputed Valueを`32px`として持ちます。

![SourceからComputed Valueへの変換](asset:computed-unit)

この実習は2つを確認します。Sourceに`padding: 2rem;`と書けていること、PreviewのComputed Paddingが32pxになったことです。Font Size 20pxとBorder 1pxは完成済みなので壊さず残します。

```css
padding: 2rem; /* Computed: 32px */
```

:::practice
prompt: SourceとComputedで表記が違っても同じ長さになる理由を考えます。
expectedAction: Root 16pxへ2を掛けた結果だと説明する
estimatedMinutes: 2
:::

次の実習ではremでPaddingを設定し、Computed px値で結果を確認します。
