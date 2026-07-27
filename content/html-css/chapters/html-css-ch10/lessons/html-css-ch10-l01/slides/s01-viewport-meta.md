---
id: html-css-ch10-l01-s01
title: Viewport MetaでCSS幅を端末幅へ合わせる
kind: concept
concept: viewport-meta
layout: code-preview
teachesConceptIds: [viewport-meta]
masteryTarget: read
screenBudget: { maxTextCharacters: 400, maxCodeLines: 6, maxVisuals: 1 }
assets:
  - id: viewport-device-width
    source: assets/viewport-mobile-first.svg
    mediaType: image
    alt: Viewport Metaの有無で390px端末のCSS表示幅が変わる比較図
    provenanceId: ch10-viewport-mobile-first-original
---

Viewport Metaは、Mobile Browserへ「CSSの表示幅を端末幅へ合わせる」と伝えます。`head`の中へ1つだけ置きます。

![Viewport Metaによる390px表示幅の比較](asset:viewport-device-width)

```html
<meta name="viewport" content="width=device-width, initial-scale=1" />
```

`width=device-width`がないと、Browserが広いPageを縮小して見せるため、後で書くBreakpointを意図した幅で確認できません。

:::practice
prompt: Starterのcontentに足りないValueを答えます。
expectedAction: width=device-widthを追加すると答える
estimatedMinutes: 2
:::

次は、小さい画面向けCSSを標準にします。
