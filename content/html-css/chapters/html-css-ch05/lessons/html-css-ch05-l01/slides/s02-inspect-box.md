---
id: html-css-ch05-l01-s02
title: PaddingはContentとBorderの間にある
kind: concept
concept: inspect-box-model
layout: code-preview
teachesConceptIds: [box-model-content-padding-border-margin]
masteryTarget: read
screenBudget: { maxTextCharacters: 400, maxCodeLines: 4, maxVisuals: 1 }
assets:
  - id: box-model-inspection
    source: assets/diagram-box-model.svg
    mediaType: image
    alt: Box ModelのPadding 24pxを強調した4層図
    provenanceId: ch05-box-model-slide-original
---

CSSの`padding`は、ContentとBorderの間を広げます。Browserは`padding: 24px`を各辺の`padding-top`などへ展開してLayoutします。

![Paddingを確認するBox Model](asset:box-model-inspection)

実習の`.box`にはWidth 240px、Border 2px、Margin 32pxが完成済みです。変更するのは`padding: 16px;`だけ。値を`24px`へ変え、ほかの宣言は残します。

```css
padding: 16px; /* 24pxへ変更 */
```

:::practice
prompt: Padding 24pxとBorder 2pxが左右にあるとき、Content幅へ何px加わるか計算します。
expectedAction: 左右2組なので52pxと答える
estimatedMinutes: 2
:::

次の実習では、PaddingのSourceとComputed Valueを24pxへそろえます。
