---
id: html-css-ch10-l01-s02
title: Mobile Firstは小さい画面をBaseにする
kind: comparison
concept: mobile-first-source-order
layout: code-preview
teachesConceptIds: [mobile-first-base]
masteryTarget: read
screenBudget: { maxTextCharacters: 410, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: mobile-first-base
    source: assets/viewport-mobile-first.svg
    mediaType: image
    alt: Mobileでは幅100パーセントの1列をBaseにし、広い画面で拡張する流れの図
    provenanceId: ch10-viewport-mobile-first-original
---

Mobile Firstでは、小さい画面で必要な1列・流動幅をMedia Queryの外へ書きます。広い画面向けの変更は後から足します。

![小さい画面をBaseにするSource Order](asset:mobile-first-base)

```css
[data-page] {
  width: 100%;
}
```

実習では完成済みのPaddingや`box-sizing`を残し、固定幅`500px`だけを`100%`へ変えます。390pxの親幅に追従すれば横Overflowを防げます。

:::practice
prompt: Mobile Baseの500px固定幅を何へ変えるか答えます。
expectedAction: width 100%へ変えると答える
estimatedMinutes: 2
:::

次の実習ではViewport Metaとwidthの2か所だけを変更します。
