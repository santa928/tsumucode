---
id: html-css-ch10-l05-s02
title: 4 Viewportすべてで同じ条件を満たす
kind: comparison
concept: four-viewport-check
layout: code-preview
teachesConceptIds: [multi-viewport-audit]
masteryTarget: read
screenBudget: { maxTextCharacters: 410, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: four-viewport-audit
    source: assets/viewport-audit.svg
    mediaType: image
    alt: 390、768、1280、1440pxの4幅でOverflowとCTA高さを確認する一覧図
    provenanceId: ch10-viewport-audit-original
---

監査では390、768、1280、1440pxを順に実行します。各幅で同じ3条件を確認し、1幅でも失敗すれば完成ではありません。

![4 Viewportの監査項目](asset:four-viewport-audit)

```css
[data-cta] {
  min-height: 44px;
}
```

確認項目はDocument Overflowが`false`、CTAがFocus可能、CTA高さが44px以上です。StarterのFocus可能なLinkは残し、高さ24pxだけを44pxへ変えます。

:::practice
prompt: 4 Viewportで共通して確認する3条件を挙げる
expectedAction: Overflow false、CTA高さ44px以上、Focus可能を挙げる
estimatedMinutes: 2
:::

次の実習では2つのSource変更を4 Viewportの実測で仕上げます。
