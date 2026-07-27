---
id: html-css-ch10-l03-s02
title: max-widthで止め、auto Marginで中央に置く
kind: comparison
concept: max-width-centered-container
layout: code-preview
teachesConceptIds: [max-width, auto-margin]
masteryTarget: read
screenBudget: { maxTextCharacters: 410, maxCodeLines: 5, maxVisuals: 1 }
assets:
  - id: max-width-centered-container
    source: assets/fluid-container.svg
    mediaType: image
    alt: 1280px内で720pxのContainerが左右280pxずつ空けて中央に置かれる図
    provenanceId: ch10-fluid-container-original
---

流動幅だけではDesktopで本文が広がりすぎます。`max-width`で成長を止め、`margin-inline: auto`で残り幅を左右へ等分します。

![720pxへ止まり中央に置かれるContainer](asset:max-width-centered-container)

```css
[data-container] {
  max-width: 720px;
  margin-inline: auto;
}
```

1280pxでは`(1280 - 720) ÷ 2 = 280px`です。auto MarginはStarterで完成済みなので、実習では上限900pxだけを720pxへ直します。

:::practice
prompt: 1280px内で720pxを中央に置くxを計算する
expectedAction: (1280 - 720) / 2で280pxと答える
estimatedMinutes: 2
:::

次の実習ではwidthとmax-widthの2つのValueだけを変更します。
