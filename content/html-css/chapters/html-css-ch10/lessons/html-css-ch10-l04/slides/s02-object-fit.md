---
id: html-css-ch10-l04-s02
title: object-fit coverはBoxを隙間なく埋める
kind: comparison
concept: object-fit
layout: code-preview
teachesConceptIds: [object-fit]
masteryTarget: read
screenBudget: { maxTextCharacters: 400, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: object-fit-comparison
    source: assets/responsive-image.svg
    mediaType: image
    alt: containは画像全体を見せ、coverは端を切ってBoxを埋める比較図
    provenanceId: ch10-responsive-image-slide-original
---

`object-fit: contain`は画像全体を見せ、余白が残ることがあります。`cover`は比率を保ったまま端を切り、Boxを隙間なく埋めます。

![containとcoverの比較](asset:object-fit-comparison)

```css
img {
  object-fit: cover;
}
```

元画像が480×320px、Boxが320×180pxなら比率が違います。`contain`では左右または上下に余白が残り、`cover`では画像の上下が少し切れてBoxを埋めます。実習では完成済みのBoxサイズを保ち、`contain`だけを`cover`へ変えます。

:::practice
prompt: 320×180pxの横長Boxを隙間なく埋める値を選ぶ
expectedAction: object-fit coverを選ぶ
estimatedMinutes: 2
:::

次の実習ではmax-widthとobject-fitの2か所だけを変更します。
