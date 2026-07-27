---
id: html-css-ch12-l04-g01
title: Contactを加えて2 Viewportへ収める
kind: guide
layout: code-preview
teachesConceptIds: [contact, responsive]
masteryTarget: compose
screenBudget: { maxTextCharacters: 390, maxCodeLines: 9, maxVisuals: 1 }
assets:
  - id: contact-responsive-check
    source: assets/contact-responsive-check.svg
    mediaType: image
    alt: 同じProfileが390pxでは1列、1280pxでは2列へ収まる比較図
    provenanceId: ch12-contact-responsive-check-original
---

Contactは「連絡できる」だけでなく、Link名から相手と目的が分かるようにします。工程3のWorksは、固定幅を避けて390pxと1280pxの両方へ収めます。

![ContactとResponsive確認](asset:contact-responsive-check)

Contactは`contact`というidを持つsection要素の中へ、h2と「つむぎへ感想を送る」というa要素を置きます。

```css
.works-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
}
.work-image {
  display: block;
  width: 100%;
  max-width: 100%;
}
```

:::practice
prompt: 390pxでCardがはみ出したとき、最初に確認する2つのCSSを答えます。
expectedAction: Gridの列幅と画像のwidthまたはmax-widthを確認すると答える
estimatedMinutes: 2
:::

実習ではContactを追加し、`auto-fit`と画像境界を使って2 ViewportのOverflowを解消します。
