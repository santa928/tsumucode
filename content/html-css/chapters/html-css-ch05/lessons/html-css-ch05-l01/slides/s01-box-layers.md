---
id: html-css-ch05-l01-s01
title: Boxは内側から4つの層でできている
kind: diagram
concept: box-model-layers
layout: code-preview
teachesConceptIds: [box-model-content-padding-border-margin]
masteryTarget: read
screenBudget: { maxTextCharacters: 400, maxCodeLines: 6, maxVisuals: 1 }
assets:
  - id: diagram-box-model
    source: assets/diagram-box-model.svg
    mediaType: image
    alt: Content、Padding、Border、Marginを内側から順に示したBox Model図
    provenanceId: ch05-box-model-slide-original
---

HTMLのElementは、内側から`Content`、`Padding`、`Border`、`Margin`の4層を持つBoxとして配置されます。

![Box Modelの4層](asset:diagram-box-model)

`.box`では、文字がContent、内側の24pxがPadding、2pxの線がBorder、隣のBoxまでの32pxがMarginです。

```css
.box {
  padding: 24px;
  border: 2px solid #2d5d62;
  margin: 32px;
}
```

:::practice
prompt: 図を内側から外側へ読み、4層を順に言います。
expectedAction: Content、Padding、Border、Marginの順を説明する
estimatedMinutes: 2
:::

次は、実習で変更するPaddingをComputed Styleから見分けます。
