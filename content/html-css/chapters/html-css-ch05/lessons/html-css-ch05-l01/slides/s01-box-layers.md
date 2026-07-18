---
id: html-css-ch05-l01-s01
title: BoxはContentからMarginまでの4層を持つ
kind: diagram
concept: box-model-layers
assets:
  - id: diagram-box-model
    source: assets/diagram-box-model.svg
    mediaType: image
    alt: Content、Padding、Border、Marginを入れ子にしたBox Model図
    provenanceId: ch05-box-model-slide-original
---

ElementはContent、Padding、Border、Marginの層としてLayoutされます。内側の情報から外側の隣接Boxまで、各層の役割が違います。

![Box Modelの4層](asset:diagram-box-model)

Paddingは内容とBorderの間、MarginはBorderの外です。似た空白でも、どの境界を広げたいかで選びます。

:::practice
prompt: 図を内側から外側へ読み、4層を順に言います。
expectedAction: Content、Padding、Border、Marginの順を説明する
estimatedMinutes: 2
:::

次はComputed Styleから各層の実値を読みます。
