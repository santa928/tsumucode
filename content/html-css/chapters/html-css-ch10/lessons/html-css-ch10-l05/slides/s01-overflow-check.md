---
id: html-css-ch10-l05-s01
title: 横Overflowは幅の実測で見つける
kind: concept
concept: horizontal-overflow-audit
layout: code-preview
teachesConceptIds: [horizontal-overflow]
masteryTarget: read
screenBudget: { maxTextCharacters: 400, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: horizontal-overflow-audit
    source: assets/viewport-audit.svg
    mediaType: image
    alt: 390px画面から1100px固定幅がはみ出す状態と幅100パーセントへ直した状態の比較図
    provenanceId: ch10-viewport-audit-original
---

横Overflowは、内容幅`scrollWidth`が表示幅`clientWidth`を超えた状態です。少しのはみ出しでも横ScrollやCTAの操作阻害につながります。

![固定幅によるOverflowと修正後の比較](asset:horizontal-overflow-audit)

```css
[data-wide] {
  width: 100%;
}
```

実習では`1100px`固定幅を`100%`へ変え、最小390pxから最大1440pxまでDocumentのOverflowが`false`か測ります。

:::practice
prompt: 390pxで固定幅1100pxのContainerが起こす問題を答える
expectedAction: Horizontal Overflowが発生すると答える
estimatedMinutes: 2
:::

次は4つの幅で同じ完成条件を監査します。
