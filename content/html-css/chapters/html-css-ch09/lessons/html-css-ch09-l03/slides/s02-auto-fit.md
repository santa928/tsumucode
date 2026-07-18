---
id: html-css-ch09-l03-s02
title: auto-fitが収まる数だけTrackを作る
kind: comparison
concept: auto-fit-responsive-grid
assets: []
---

`repeat(auto-fit, minmax(160px, 1fr))`は、Containerへ収まる数だけTrackを作り、空いた幅へTrackを伸ばします。

同じCSSでもDesktopでは4列、390px相当では2列にできます。固定Breakpointを追加せず、内容の最小幅から自然にColumn数が変わります。

:::practice
prompt: 利用可能幅358pxへ160pxのTrackと16pxのGapがいくつ収まるか計算します。
expectedAction: 160 × 2 + 16で336pxとなり2列と答える
estimatedMinutes: 2
:::

次の実習ではDesktopとMobileの3枚目のyを比較します。
