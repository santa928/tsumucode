---
id: html-css-ch05-l05-s02
title: Safe Sizingは四辺の実測で確認する
kind: concept
concept: safe-container-sizing
assets: []
---

見た目だけで収まりを判断せず、Childのx、y、width、heightからrightとbottomを求め、Container境界と比べます。

横Overflow falseに加え、rightとbottomが安全域内なら、狭いViewportでも主要Contentを失いにくくなります。

:::practice
prompt: x 20、width 280のChildのright端を計算します。
expectedAction: 300と答え、Container幅と比較する
estimatedMinutes: 2
:::

次の実習ではCardの幅とSizingを直し、境界内へ収めます。
