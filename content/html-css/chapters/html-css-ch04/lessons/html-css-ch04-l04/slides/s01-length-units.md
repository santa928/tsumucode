---
id: html-css-ch04-l04-s01
title: pxとremは長さの基準が違う
kind: comparison
concept: css-length-units
assets: []
---

`px`はCSS Pixelを基準にした絶対Length、`rem`はRoot ElementのFont Sizeを基準にした相対Lengthです。

Root Font Sizeが16pxなら、`2rem`はComputed Valueで32pxになります。文字や余白を利用者設定と連動させたいとき、remが役立ちます。

- Borderの細さなど固定したい値にはpx
- 読みやすさと連動する文字・余白にはrem
- Unitは数値の目的と基準で選ぶ

:::practice
prompt: Rootが16pxのとき1.5remをpxへ計算します。
expectedAction: 16に1.5を掛けて24pxと答える
estimatedMinutes: 2
:::

次は、書いた値とComputed Valueを見比べます。
