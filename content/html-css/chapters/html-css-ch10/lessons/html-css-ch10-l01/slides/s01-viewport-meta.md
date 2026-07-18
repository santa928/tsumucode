---
id: html-css-ch10-l01-s01
title: Viewport MetaがCSS Pixelの表示幅を合わせる
kind: concept
concept: viewport-meta
assets: []
---

`&lt;meta name="viewport" content="width=device-width, initial-scale=1" /&gt;`は、Mobile BrowserへLayout Viewportを端末幅に合わせるよう伝えます。これがないと小さい画面でも広いPageを縮小表示し、意図したBreakpointになりません。

:::practice
prompt: meta要素をheadへ置き、contentへwidth=device-widthを含める
expectedAction: Viewport Metaを正しく置く
estimatedMinutes: 2
:::

次の観察または実習で、Viewportごとの最終結果を確認します。
