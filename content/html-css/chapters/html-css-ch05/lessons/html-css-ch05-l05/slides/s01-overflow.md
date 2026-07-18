---
id: html-css-ch05-l05-s01
title: OverflowはContentが境界を越えた状態
kind: concept
concept: overflow-boundary
assets: []
---

固定幅、長いText、Paddingが重なると、Childのright端がContainerを越えて横Scrollを生むことがあります。

`overflow: hidden`で隠す前に、Boxのwidth、max-width、box-sizingを直し、内容が自然に収まるようにします。

:::practice
prompt: はみ出しを隠す方法とSizing原因を直す方法を比べます。
expectedAction: 内容を失わないSizing修正を先に選ぶ
estimatedMinutes: 2
:::

次はrightとbottomの境界値を実測します。
