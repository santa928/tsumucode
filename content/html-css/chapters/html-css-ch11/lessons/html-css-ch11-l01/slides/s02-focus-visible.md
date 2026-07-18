---
id: html-css-ch11-l01-s02
title: Focus Indicatorを消さず現在地を見せる
kind: concept
concept: focus-visible-indicator
assets: []
---

Keyboard操作ではPointerの位置が見えません。`:focus-visible`へ太さ3px以上の`outline`と`outline-offset`を指定すると、現在地をLayoutを動かさず示せます。`outline: none`だけで終わらせてはいけません。

:::practice
prompt: Focus Indicatorに必要な2つのCSS指定を挙げる
expectedAction: 見えるoutlineとoutline-offsetを挙げる
estimatedMinutes: 2
:::

次の実習では、主要ActionのFocusabilityとIndicatorの太さを別々に判定します。
