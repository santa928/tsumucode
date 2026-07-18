---
id: html-css-ch08-l04-s01
title: flex-wrapは収まらないItemを次のLineへ送る
kind: concept
concept: flex-wrap-lines
assets: []
---

既定の`flex-wrap: nowrap`では、Itemは1行へ留まろうとして縮むか、Containerを越えます。`wrap`を指定すると、収まらないItemが次のFlex Lineへ移ります。

折り返しはViewport幅だけでなく、Container幅、ItemのBasis、Gapの合計で決まります。

:::practice
prompt: 横Overflowを避けながらCardを複数行へ並べるwrap値を答えます。
expectedAction: flex-wrap wrapと答える
estimatedMinutes: 2
:::

次は各Itemが占め始める幅を決めます。
