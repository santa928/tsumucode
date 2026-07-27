---
id: html-css-ch10-l03-s01
title: calcでViewportに追従する安全余白を作る
kind: concept
concept: fluid-container-width
layout: code-preview
teachesConceptIds: [percentage-width]
masteryTarget: read
screenBudget: { maxTextCharacters: 400, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: fluid-container-width
    source: assets/fluid-container.svg
    mediaType: image
    alt: 390pxでは幅358px、1280pxでは上限720pxになるContainerの比較図
    provenanceId: ch10-fluid-container-original
---

`width: calc(100% - 32px)`は、親幅から32pxを引きます。左右へ16pxずつ安全余白を残しながら、親に合わせて縮みます。

![MobileとDesktopのContainer幅](asset:fluid-container-width)

```css
[data-container] {
  width: calc(100% - 32px);
}
```

390pxでは`390 - 32 = 358px`です。実習では固定幅900pxを、このValueへ変更します。

:::practice
prompt: 390pxから32pxを引いたContainer幅を計算する
expectedAction: 358pxと答える
estimatedMinutes: 2
:::

次はDesktopで広がりすぎない上限を加えます。
