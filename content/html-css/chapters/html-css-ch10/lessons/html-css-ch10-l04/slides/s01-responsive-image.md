---
id: html-css-ch10-l04-s01
title: max-width 100%で画像を枠内へ縮める
kind: concept
concept: responsive-image-boundary
layout: code-preview
teachesConceptIds: [responsive-image, height-auto]
masteryTarget: read
screenBudget: { maxTextCharacters: 410, maxCodeLines: 5, maxVisuals: 1 }
assets:
  - id: responsive-image-boundary
    source: assets/responsive-image.svg
    mediaType: image
    alt: 幅480px、高さ320pxの横長画像が幅320pxの枠へ比率を保って縮む図
    provenanceId: ch10-responsive-image-slide-original
---

`max-width: 100%`は画像を親より大きくしません。`height: auto`は、縮んだ幅に合わせて元の縦横比から高さを計算します。

![480px画像を320pxの枠へ収める図](asset:responsive-image-boundary)

```css
img {
  max-width: 100%;
  height: auto;
}
```

Starterでは`height: auto`が完成済みです。`max-width: none`だけを`100%`へ変えると、480×320pxの横長画像は320×約213pxになります。

:::practice
prompt: 480×320pxのImageを幅320pxへ縮めたときの高さを考える
expectedAction: 320÷480×320で約213pxになると答える
estimatedMinutes: 2
:::

次は固定サイズの画像Boxをどう埋めるか選びます。
