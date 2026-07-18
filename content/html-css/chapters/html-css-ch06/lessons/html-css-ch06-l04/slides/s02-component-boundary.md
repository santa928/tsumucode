---
id: html-css-ch06-l04-s02
title: Component Boundaryは変更をまとめる範囲
kind: comparison
concept: component-boundary
assets: []
---

Component Boundaryは、内容と見た目をひとまとまりとして扱う境界です。Cardなら外側の余白まで抱え込まず、Card自身の背景、Border、内部Paddingを責務にします。

外側の並び方はCardを配置する親Containerの責務です。この分離により、同じCardを縦並びにも横並びにも再利用できます。

判定ではTextやClass名の完全一致を求めず、2つのCardが共通のPaddingと背景を持つ最終結果を確認します。

:::practice
prompt: Card自身と親ContainerのどちらがCard間の余白を持つべきか考えます。
expectedAction: Card間の配置は親Containerの責務と答える
estimatedMinutes: 2
:::

実習で2枚のCardへ同じBase Styleを適用します。
