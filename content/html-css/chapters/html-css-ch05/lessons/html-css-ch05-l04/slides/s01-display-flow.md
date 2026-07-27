---
id: html-css-ch05-l04-s01
title: inlineのLinkは文字の流れに並ぶ
kind: concept
concept: display-flow
layout: code-preview
teachesConceptIds: [width-height]
masteryTarget: transform
screenBudget: { maxTextCharacters: 400, maxCodeLines: 3, maxVisuals: 1 }
assets:
  - id: target-inline
    source: assets/target-size.svg
    mediaType: image
    alt: inlineの小さいLinkとinline-blockの44px Linkを比較した図
    provenanceId: ch05-target-size-original
---

`a`要素は既定で`inline`です。文字の流れに沿って横へ並びますが、上下Paddingを含むBoxの寸法を扱う操作部品には向きません。

![inlineと操作領域の比較](asset:target-inline)

実習のLinkにも`display: inline;`が書かれています。`a`要素と`href`はKeyboard操作に必要なので、そのまま残します。

```css
nav a {
  display: inline;
}
```

:::practice
prompt: 横へ並ぶ既定のLinkが持つDisplayを答えます。
expectedAction: inlineと答え、文字の流れに沿うと説明する
estimatedMinutes: 2
:::

次は、横並びのまま44pxのBoxを持てるDisplayを見ます。
